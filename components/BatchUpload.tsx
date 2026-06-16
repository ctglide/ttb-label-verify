"use client";

import { useRef, useState, useCallback } from "react";
import type { ApplicationData, VerificationResult } from "@/types/label";

interface BatchItem {
  id: string;
  fileName: string;
  imageBase64: string;
  imageMimeType: string;
  appData: ApplicationData;
  status: "pending" | "processing" | "done" | "error";
  result?: VerificationResult;
  error?: string;
}

const DEFAULT_APP_DATA: ApplicationData = {
  brandName: "",
  classType: "",
  alcoholContent: "",
  netContents: "",
  producerName: "",
  producerAddress: "",
  countryOfOrigin: "",
  beverageType: "distilled_spirits",
};

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const STATUS_COLORS = {
  pending: "text-slate-400",
  processing: "text-indigo-500",
  done_approved: "text-emerald-600",
  done_rejected: "text-red-600",
  done_needs_review: "text-amber-600",
  error: "text-red-500",
};

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      resolve({ base64: result.split(",")[1], mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BatchUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateItem = useCallback((id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const handleFiles = async (files: File[]) => {
    const valid = files.filter((f) => ALLOWED_TYPES.has(f.type)).slice(0, 300);
    const newItems: BatchItem[] = await Promise.all(
      valid.map(async (file) => {
        const { base64, mimeType } = await fileToBase64(file);
        return {
          id: crypto.randomUUID(),
          fileName: file.name,
          imageBase64: base64,
          imageMimeType: mimeType,
          appData: { ...DEFAULT_APP_DATA },
          status: "pending" as const,
        };
      })
    );
    setItems((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleRunBatch = async () => {
    const pending = items.filter((i) => i.status === "pending");
    if (pending.length === 0) return;

    setRunning(true);
    setProgress({ done: 0, total: pending.length });
    pending.forEach((i) => updateItem(i.id, { status: "processing" }));

    // Send in chunks of 10 to avoid request body size limits and timeouts
    const CHUNK_SIZE = 10;

    try {
      for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
        const chunk = pending.slice(i, i + CHUNK_SIZE);

        const payload = chunk.map((item) => ({
          applicationData: item.appData,
          imageBase64: item.imageBase64,
          imageMimeType: item.imageMimeType,
        }));

        const res = await fetch("/api/verify/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const results = await res.json();

        results.forEach((r: { success: boolean; result?: VerificationResult; error?: string }, idx: number) => {
          const item = chunk[idx];
          if (!item) return;
          if (r.success && r.result) {
            updateItem(item.id, { status: "done", result: r.result });
          } else {
            updateItem(item.id, { status: "error", error: r.error ?? "Unknown error" });
          }
        });

        setProgress({ done: Math.min(i + CHUNK_SIZE, pending.length), total: pending.length });
      }
    } catch {
      pending.forEach((i) => updateItem(i.id, { status: "error", error: "Network error" }));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const approvedCount = items.filter(
    (i) => i.status === "done" && i.result?.overallStatus === "approved"
  ).length;
  const rejectedCount = items.filter(
    (i) => i.status === "done" && i.result?.overallStatus === "rejected"
  ).length;
  const reviewCount = items.filter(
    (i) => i.status === "done" && i.result?.overallStatus === "needs_review"
  ).length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors bg-slate-50"
      >
        <svg className="mx-auto h-8 w-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm font-medium text-slate-700">Drop label images here or click to browse</p>
        <p className="text-xs text-slate-500 mt-1">Up to 300 images — JPEG, PNG, WebP</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {items.length > 0 && (
        <>
          {/* Summary bar */}
          {doneCount > 0 && (
            <div className="flex gap-4 text-sm flex-wrap">
              <span className="text-emerald-600 font-medium">{approvedCount} approved</span>
              <span className="text-red-600 font-medium">{rejectedCount} rejected</span>
              <span className="text-amber-600 font-medium">{reviewCount} needs review</span>
              <span className="text-slate-400">{items.length - doneCount} remaining</span>
            </div>
          )}

          {/* Item list */}
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
            {items.map((item) => {
              const statusKey =
                item.status === "done" && item.result
                  ? (`done_${item.result.overallStatus}` as keyof typeof STATUS_COLORS)
                  : item.status;

              return (
                <div key={item.id} className="p-3">
                  <div className="flex items-center gap-3">
                    {/* Thumbnail */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:${item.imageMimeType};base64,${item.imageBase64}`}
                      alt={item.fileName}
                      className="w-10 h-10 object-cover rounded border border-slate-200 flex-shrink-0"
                    />

                    {/* File name + status */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{item.fileName}</p>
                      <p className={`text-xs font-medium ${STATUS_COLORS[statusKey as keyof typeof STATUS_COLORS] ?? "text-slate-400"}`}>
                        {item.status === "pending" && "Waiting"}
                        {item.status === "processing" && "Verifying…"}
                        {item.status === "done" && item.result?.overallStatus === "approved" && "✓ Approved"}
                        {item.status === "done" && item.result?.overallStatus === "rejected" && "✗ Rejected"}
                        {item.status === "done" && item.result?.overallStatus === "needs_review" && "⚠ Needs Review"}
                        {item.status === "error" && `Error: ${item.error}`}
                      </p>
                    </div>

                    {/* Edit button for pending items */}
                    {item.status === "pending" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(editingId === item.id ? null : item.id); }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded"
                      >
                        {editingId === item.id ? "Done" : "Edit fields"}
                      </button>
                    )}

                    {/* Remove button */}
                    {item.status === "pending" && (
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="text-slate-300 hover:text-red-400 transition-colors"
                        aria-label="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Inline field editor */}
                  {editingId === item.id && (
                    <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50 rounded p-3">
                      {(
                        [
                          ["brandName", "Brand Name"],
                          ["classType", "Class / Type"],
                          ["alcoholContent", "Alcohol Content"],
                          ["netContents", "Net Contents"],
                          ["producerName", "Producer Name"],
                          ["producerAddress", "Producer Address"],
                        ] as [keyof ApplicationData, string][]
                      ).map(([key, label]) => (
                        <div key={key} className={key === "producerAddress" ? "col-span-2" : ""}>
                          <label className="block text-xs font-medium text-slate-500 mb-0.5">{label}</label>
                          <input
                            type="text"
                            value={(item.appData[key] as string) ?? ""}
                            onChange={(e) =>
                              updateItem(item.id, {
                                appData: { ...item.appData, [key]: e.target.value },
                              })
                            }
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Failed fields summary for done items */}
                  {item.status === "done" && item.result && item.result.overallStatus !== "approved" && (
                    <div className="mt-2 ml-13 pl-13">
                      {item.result.fields
                        .filter((f) => f.status !== "pass")
                        .map((f) => (
                          <p key={f.field} className="text-xs text-slate-500 ml-13">
                            <span className="font-medium">{f.label}:</span> {f.note}
                          </p>
                        ))}
                      {item.result.governmentWarningResult.status !== "pass" && (
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Gov. Warning:</span>{" "}
                          {item.result.governmentWarningResult.note}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Run button */}
          {pendingCount > 0 && (
            <div className="space-y-2">
              {progress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Verifying labels…</span>
                    <span>{progress.done} / {progress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={handleRunBatch}
                  disabled={running}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {running ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Processing…
                    </>
                  ) : (
                    `Verify ${pendingCount} label${pendingCount !== 1 ? "s" : ""}`
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
