"use client";

import { useRef, useState } from "react";
import type { VerificationResult } from "@/types/label";
import type { BatchPairRequest } from "@/app/api/verify/batch/route";

interface ImageFile {
  fileName: string;
  base64: string;
  mimeType: string;
  preview: string;
}

interface LabelPair {
  id: string;
  front: ImageFile;
  back: ImageFile | null; // null = unpaired (odd file)
  status: "pending" | "processing" | "done" | "error" | "unprocessed";
  result?: VerificationResult;
  error?: string;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILES = 300;

function fileToImageFile(file: File): Promise<ImageFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      resolve({
        fileName: file.name,
        base64: dataUrl.split(",")[1],
        mimeType: file.type,
        preview: dataUrl,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ pair }: { pair: LabelPair }) {
  if (pair.status === "pending") return <span className="text-xs text-slate-400 font-medium">Pending</span>;
  if (pair.status === "processing") return (
    <span className="flex items-center gap-1 text-xs text-indigo-500 font-medium">
      <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Verifying…
    </span>
  );
  if (pair.status === "error") return <span className="text-xs text-red-500 font-medium">⚠ Failed — locate manually</span>;
  if (pair.status === "unprocessed") return <span className="text-xs text-orange-500 font-medium">⚠ Not processed — locate manually</span>;
  if (pair.status === "done" && pair.result) {
    const s = pair.result.overallStatus;
    if (s === "approved") return <span className="text-xs text-emerald-600 font-semibold">✓ Approved</span>;
    if (s === "rejected") return <span className="text-xs text-red-600 font-semibold">✗ Rejected</span>;
    return <span className="text-xs text-amber-600 font-semibold">⚠ Needs Review</span>;
  }
  return null;
}

function PairCard({ pair, running }: { pair: LabelPair; running: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const cardBorder =
    pair.status === "done" && pair.result?.overallStatus === "approved" ? "border-emerald-200 bg-emerald-50" :
    pair.status === "done" && pair.result?.overallStatus === "rejected" ? "border-red-200 bg-red-50" :
    pair.status === "done" && pair.result?.overallStatus === "needs_review" ? "border-amber-200 bg-amber-50" :
    pair.status === "error" || pair.status === "unprocessed" ? "border-orange-200 bg-orange-50" :
    "border-slate-200 bg-white";

  return (
    <div className={`rounded-lg border ${cardBorder} overflow-hidden`}>
      <div className="p-3 flex items-center gap-3">
        {/* Thumbnails */}
        <div className="flex gap-1.5 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pair.front.preview} alt="Front" className="w-12 h-14 object-cover rounded border border-slate-200" />
          {pair.back ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pair.back.preview} alt="Back" className="w-12 h-14 object-cover rounded border border-slate-200" />
          ) : (
            <div className="w-12 h-14 rounded border border-dashed border-orange-300 bg-orange-50 flex items-center justify-center">
              <span className="text-xs text-orange-400 text-center leading-tight px-1">No back</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-700 truncate">{pair.front.fileName}</p>
          {pair.back && <p className="text-xs text-slate-400 truncate">{pair.back.fileName}</p>}
          {!pair.back && <p className="text-xs text-orange-500">Unpaired — odd file in sequence</p>}
          <div className="mt-1">
            <StatusBadge pair={pair} />
          </div>
        </div>

        {/* Expand toggle for done items with issues */}
        {pair.status === "done" && pair.result && pair.result.overallStatus !== "approved" && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 hover:text-slate-700 flex-shrink-0"
          >
            {expanded ? "▲ Hide" : "▼ Details"}
          </button>
        )}

        {/* Error filename for manual lookup */}
        {(pair.status === "error" || pair.status === "unprocessed") && (
          <div className="text-xs text-orange-600 flex-shrink-0 text-right">
            <p className="font-semibold">Locate manually:</p>
            <p className="font-mono">{pair.front.fileName}</p>
            {pair.back && <p className="font-mono">{pair.back.fileName}</p>}
          </div>
        )}
      </div>

      {/* Expanded field failures */}
      {expanded && pair.result && (
        <div className="px-3 pb-3 border-t border-current/10 pt-2 space-y-1">
          {pair.result.fields
            .filter((f) => f.status !== "pass")
            .map((f) => (
              <p key={f.field} className="text-xs">
                <span className="font-semibold">{f.label}:</span> {f.note}
              </p>
            ))}
          {pair.result.governmentWarningResult.status !== "pass" && (
            <p className="text-xs">
              <span className="font-semibold">Gov. Warning:</span> {pair.result.governmentWarningResult.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function BatchUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pairs, setPairs] = useState<LabelPair[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totalFileCount, setTotalFileCount] = useState(0);

  const handleFiles = async (files: File[]) => {
    const valid = files
      .filter((f) => ALLOWED_TYPES.has(f.type))
      .slice(0, MAX_FILES - totalFileCount);

    if (valid.length === 0) return;

    const imageFiles = await Promise.all(valid.map(fileToImageFile));

    // Pair sequentially: [0,1], [2,3], [4,5]...
    const newPairs: LabelPair[] = [];
    for (let i = 0; i < imageFiles.length; i += 2) {
      newPairs.push({
        id: crypto.randomUUID(),
        front: imageFiles[i],
        back: imageFiles[i + 1] ?? null,
        status: "pending",
      });
    }

    setPairs((prev) => [...prev, ...newPairs]);
    setTotalFileCount((prev) => prev + valid.length);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const handleReset = () => {
    setPairs([]);
    setTotalFileCount(0);
    setProgress(null);
  };

  const handleRunBatch = async () => {
    const pending = pairs.filter((p) => p.status === "pending");
    if (pending.length === 0) return;

    setRunning(true);
    setProgress({ done: 0, total: pending.length });

    // Mark all pending as processing
    setPairs((prev) =>
      prev.map((p) => p.status === "pending" ? { ...p, status: "processing" } : p)
    );

    const CHUNK_SIZE = 5;

    try {
      for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
        const chunk = pending.slice(i, i + CHUNK_SIZE);

        const payload: BatchPairRequest[] = chunk.map((pair) => ({
          frontImage: { base64: pair.front.base64, mimeType: pair.front.mimeType, fileName: pair.front.fileName },
          backImage: pair.back ? { base64: pair.back.base64, mimeType: pair.back.mimeType, fileName: pair.back.fileName } : null,
          beverageType: "distilled_spirits",
        }));

        const res = await fetch("/api/verify/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const results = await res.json();

        setPairs((prev) => {
          const updated = [...prev];
          results.forEach((r: { success: boolean; result?: VerificationResult; error?: string; pairIndex: number }, idx: number) => {
            const pair = chunk[idx];
            if (!pair) return;
            const globalIdx = updated.findIndex((p) => p.id === pair.id);
            if (globalIdx === -1) return;
            updated[globalIdx] = r.success && r.result
              ? { ...updated[globalIdx], status: "done", result: r.result }
              : { ...updated[globalIdx], status: "error", error: r.error ?? "Unknown error" };
          });
          return updated;
        });

        setProgress({ done: Math.min(i + CHUNK_SIZE, pending.length), total: pending.length });
      }
    } catch {
      setPairs((prev) =>
        prev.map((p) => p.status === "processing" ? { ...p, status: "unprocessed" } : p)
      );
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const pendingCount = pairs.filter((p) => p.status === "pending").length;
  const doneCount = pairs.filter((p) => p.status === "done").length;
  const approvedCount = pairs.filter((p) => p.result?.overallStatus === "approved").length;
  const rejectedCount = pairs.filter((p) => p.result?.overallStatus === "rejected").length;
  const reviewCount = pairs.filter((p) => p.result?.overallStatus === "needs_review").length;
  const failedCount = pairs.filter((p) => p.status === "error" || p.status === "unprocessed").length;
  const unpairedCount = pairs.filter((p) => !p.back).length;

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
        <p className="text-xs text-slate-500 mt-1">Up to 300 images total — paired sequentially (1+2 = label 1, 3+4 = label 2…)</p>
        <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, WebP · {MAX_FILES - totalFileCount} images remaining</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {pairs.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="text-slate-600 font-medium">{pairs.length} label{pairs.length !== 1 ? "s" : ""} ({totalFileCount} files)</span>
            {unpairedCount > 0 && <span className="text-orange-500 font-medium">⚠ {unpairedCount} unpaired</span>}
            {doneCount > 0 && <>
              <span className="text-emerald-600 font-medium">✓ {approvedCount} approved</span>
              <span className="text-red-600 font-medium">✗ {rejectedCount} rejected</span>
              <span className="text-amber-600 font-medium">⚠ {reviewCount} needs review</span>
              {failedCount > 0 && <span className="text-orange-600 font-medium">🚫 {failedCount} failed — locate manually</span>}
            </>}
            <button onClick={handleReset} className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline">Clear all</button>
          </div>

          {/* Failed files callout — prominent after run */}
          {failedCount > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <p className="text-sm font-semibold text-orange-800 mb-2">🚫 {failedCount} label{failedCount !== 1 ? "s" : ""} could not be processed — locate manually</p>
              <div className="space-y-1">
                {pairs
                  .filter((p) => p.status === "error" || p.status === "unprocessed")
                  .map((p) => (
                    <p key={p.id} className="text-xs font-mono text-orange-700">
                      {p.front.fileName}{p.back ? ` + ${p.back.fileName}` : " (no back image)"}
                      {p.error && <span className="text-orange-500 ml-2">— {p.error}</span>}
                    </p>
                  ))}
              </div>
            </div>
          )}

          {/* Pair cards */}
          <div className="space-y-2">
            {pairs.map((pair) => (
              <PairCard key={pair.id} pair={pair} running={running} />
            ))}
          </div>

          {/* Run / progress */}
          {pendingCount > 0 && (
            <div className="space-y-2">
              {progress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Verifying label pairs…</span>
                    <span>{progress.done} / {progress.total} pairs</span>
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
