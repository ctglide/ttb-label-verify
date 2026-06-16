"use client";

import { useState, useCallback } from "react";
import VerificationResultDisplay from "@/components/VerificationResult";
import BatchUpload from "@/components/BatchUpload";
import type { ApplicationData, VerificationResult, ExtractedLabelData } from "@/types/label";

const BLANK_APP_DATA: ApplicationData = {
  brandName: "",
  classType: "",
  alcoholContent: "",
  netContents: "",
  producerName: "",
  producerAddress: "",
  countryOfOrigin: "",
  beverageType: "distilled_spirits",
};

type Tab = "single" | "batch";
type ExtractionState = "idle" | "extracting" | "extracted" | "error";
type VerifyState = "idle" | "verifying" | "done" | "error";

const BEVERAGE_TYPES: { value: ApplicationData["beverageType"]; label: string }[] = [
  { value: "distilled_spirits", label: "Distilled Spirits" },
  { value: "wine", label: "Wine" },
  { value: "malt_beverage", label: "Malt Beverage / Beer" },
];

const EDITABLE_FIELDS: { key: keyof ApplicationData; label: string; placeholder: string }[] = [
  { key: "brandName", label: "Brand Name", placeholder: "Detected from label…" },
  { key: "classType", label: "Class / Type", placeholder: "Detected from label…" },
  { key: "alcoholContent", label: "Alcohol Content", placeholder: "Detected from label…" },
  { key: "netContents", label: "Net Contents", placeholder: "Detected from label…" },
  { key: "producerName", label: "Producer / Bottler Name", placeholder: "Detected from label…" },
  { key: "producerAddress", label: "Producer / Bottler Address", placeholder: "Detected from label…" },
  { key: "countryOfOrigin", label: "Country of Origin", placeholder: "Detected if present…" },
];

function ConfidenceDot({ confidence }: { confidence?: string }) {
  if (!confidence) return null;
  const colors = { high: "bg-emerald-400", medium: "bg-amber-400", low: "bg-red-400" };
  const labels = { high: "High confidence", medium: "Medium confidence — verify", low: "Low confidence — verify carefully" };
  return (
    <span
      title={labels[confidence as keyof typeof labels]}
      className={`inline-block w-2 h-2 rounded-full ml-1.5 ${colors[confidence as keyof typeof colors] ?? "bg-slate-300"}`}
    />
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("single");

  // Image state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg");

  // Extraction state
  const [extractionState, setExtractionState] = useState<ExtractionState>("idle");
  const [extracted, setExtracted] = useState<ExtractedLabelData | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Editable fields (populated from extraction, agent can correct)
  const [appData, setAppData] = useState<ApplicationData>(BLANK_APP_DATA);

  // Verification state
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Drag state
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(async (file: File) => {
    const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!ALLOWED.has(file.type)) {
      setExtractionError("Unsupported file type. Use JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setExtractionError("Image exceeds 5 MB.");
      return;
    }

    // Reset everything
    setResult(null);
    setVerifyState("idle");
    setVerifyError(null);
    setExtracted(null);
    setExtractionError(null);
    setAppData(BLANK_APP_DATA);

    // Load preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setImagePreview(dataUrl);
      setImageBase64(base64);
      setImageMimeType(file.type);

      // Auto-extract immediately
      setExtractionState("extracting");
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, imageMimeType: file.type, beverageType: appData.beverageType }),
        });
        const data: ExtractedLabelData = await res.json();
        if (!res.ok) {
          setExtractionError((data as { error?: string }).error ?? "Extraction failed.");
          setExtractionState("error");
          return;
        }

        setExtracted(data);
        setExtractionState("extracted");

        // Populate form fields from extraction
        setAppData((prev) => ({
          ...prev,
          brandName: data.brandName?.value ?? "",
          classType: data.classType?.value ?? "",
          alcoholContent: data.alcoholContent?.value ?? "",
          netContents: data.netContents?.value ?? "",
          producerName: data.producerName?.value ?? "",
          producerAddress: data.producerAddress?.value ?? "",
          countryOfOrigin: data.countryOfOrigin?.value ?? "",
        }));
      } catch {
        setExtractionError("Network error during extraction.");
        setExtractionState("error");
      }
    };
    reader.readAsDataURL(file);
  }, [appData.beverageType]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleVerify = async () => {
    if (!imageBase64 || extractionState !== "extracted") return;
    setVerifyState("verifying");
    setVerifyError(null);
    setResult(null);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationData: appData, imageBase64, imageMimeType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error ?? "Verification failed.");
        setVerifyState("error");
        return;
      }
      setResult(data);
      setVerifyState("done");
    } catch {
      setVerifyError("Network error. Try again.");
      setVerifyState("error");
    }
  };

  const handleReset = () => {
    setImagePreview(null);
    setImageBase64(null);
    setExtracted(null);
    setExtractionState("idle");
    setExtractionError(null);
    setAppData(BLANK_APP_DATA);
    setResult(null);
    setVerifyState("idle");
    setVerifyError(null);
  };

  const getFieldConfidence = (key: keyof ApplicationData) => {
    if (!extracted) return undefined;
    const map: Partial<Record<keyof ApplicationData, keyof ExtractedLabelData>> = {
      brandName: "brandName",
      classType: "classType",
      alcoholContent: "alcoholContent",
      netContents: "netContents",
      producerName: "producerName",
      producerAddress: "producerAddress",
      countryOfOrigin: "countryOfOrigin",
    };
    const extKey = map[key];
    if (!extKey) return undefined;
    const f = extracted[extKey];
    if (!f || typeof f !== "object" || !("confidence" in f)) return undefined;
    return (f as { confidence: string }).confidence;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">TTB / Compliance Division</p>
              <p className="text-sm font-semibold text-slate-800 leading-tight">Label Verification Tool</p>
            </div>
          </div>
          <div className="text-xs text-slate-400 hidden sm:block">Prototype — not for production use</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        {verifyState !== "done" && (
          <div className="flex gap-1 mb-6 border-b border-slate-200">
            {(["single", "batch"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t === "single" ? "Single Label" : "Batch Upload"}
                {t === "batch" && (
                  <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">up to 300</span>
                )}
              </button>
            ))}
          </div>
        )}

        {verifyState === "done" && result ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Verification Complete</h2>
              <button onClick={handleReset} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">← Verify another label</button>
            </div>
            <VerificationResultDisplay result={result} applicationData={appData} />
          </div>
        ) : tab === "batch" ? (
          <BatchUpload />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* LEFT: Upload */}
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Label Image</h2>
                <p className="text-sm text-slate-500 mt-0.5">Upload the label — fields are extracted automatically.</p>
              </div>

              {/* Beverage type — affects extraction prompt */}
              <div className="flex gap-2 flex-wrap">
                {BEVERAGE_TYPES.map(({ value, label }) => (
                  <label
                    key={value}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                      appData.beverageType === value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="beverageType"
                      value={value}
                      checked={appData.beverageType === value}
                      onChange={() => setAppData((d) => ({ ...d, beverageType: value }))}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
                className={`relative border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                  dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-indigo-400"
                }`}
              >
                {imagePreview ? (
                  <div className="p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Label preview" className="max-h-72 mx-auto object-contain rounded" />
                    {extractionState !== "extracting" && (
                      <p className="text-xs text-center text-slate-400 mt-2">Click or drag to replace</p>
                    )}
                  </div>
                ) : (
                  <div className="p-10 text-center">
                    <svg className="mx-auto h-10 w-10 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-sm font-medium text-slate-700">Drop label image here or click to browse</p>
                    <p className="text-xs text-slate-500 mt-1">JPEG, PNG, WebP — max 5 MB</p>
                    <p className="text-xs text-indigo-500 mt-2 font-medium">Fields extract automatically on upload</p>
                  </div>
                )}
                <input id="file-input" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              </div>

              {/* Extraction status */}
              {extractionState === "extracting" && (
                <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Reading label…
                </div>
              )}
              {extractionState === "extracted" && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                  <span>✓</span> Fields extracted — review and correct if needed, then verify
                </div>
              )}
              {extractionState === "error" && (
                <p className="text-sm text-red-600">⚠ {extractionError}</p>
              )}

              {/* Image quality warning */}
              {extracted && extracted.imageQuality !== "good" && (
                <div className={`rounded-lg border p-3 text-sm ${
                  extracted.imageQuality === "poor" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
                }`}>
                  <p className="font-semibold mb-1">
                    {extracted.imageQuality === "poor" ? "⚠ Poor image quality — results may be unreliable" : "⚠ Degraded image quality — verify flagged fields"}
                  </p>
                  {extracted.imageQualityNotes.map((n, i) => <p key={i} className="text-xs opacity-80">• {n}</p>)}
                </div>
              )}
            </div>

            {/* RIGHT: Extracted fields — editable */}
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Extracted Fields</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {extractionState === "idle" && "Upload a label to extract fields."}
                  {extractionState === "extracting" && "Extracting fields from label…"}
                  {extractionState === "extracted" && "Review extracted values. Correct any errors before verifying."}
                  {extractionState === "error" && "Extraction failed. Upload a clearer image."}
                </p>
              </div>

              <div className="space-y-3">
                {EDITABLE_FIELDS.map(({ key, label, placeholder }) => {
                  const confidence = getFieldConfidence(key);
                  const isLow = confidence === "low";
                  const isMedium = confidence === "medium";
                  return (
                    <div key={key}>
                      <label htmlFor={`field-${key}`} className="flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        {label}
                        {confidence && <ConfidenceDot confidence={confidence} />}
                        {isLow && <span className="ml-1.5 text-red-500 text-xs normal-case font-normal">verify carefully</span>}
                        {isMedium && <span className="ml-1.5 text-amber-500 text-xs normal-case font-normal">verify</span>}
                      </label>
                      <input
                        id={`field-${key}`}
                        type="text"
                        value={(appData[key] as string) ?? ""}
                        onChange={(e) => setAppData((d) => ({ ...d, [key]: e.target.value }))}
                        placeholder={extractionState === "idle" ? "Upload a label first" : placeholder}
                        disabled={extractionState === "idle" || extractionState === "extracting"}
                        style={{ color: '#000000' }}
                        className={`w-full rounded-md border px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400 transition-colors ${
                          isLow ? "border-red-300 bg-red-50" : isMedium ? "border-amber-300 bg-amber-50" : "border-slate-200"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Verify button */}
              <div className="pt-2 border-t border-slate-200">
                {verifyError && (
                  <p className="text-sm text-red-600 mb-2">⚠ {verifyError}</p>
                )}
                <button
                  onClick={handleVerify}
                  disabled={extractionState !== "extracted" || verifyState === "verifying"}
                  className="w-full px-6 py-3 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {verifyState === "verifying" ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Verifying…
                    </>
                  ) : "Verify Label"}
                </button>
                {extractionState === "extracted" && (
                  <p className="text-xs text-slate-400 text-center mt-2">
                    AI re-reads the label independently during verification
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-12 border-t border-slate-200 py-4">
        <p className="text-center text-xs text-slate-400">
          TTB Label Verification Prototype · Images processed in-memory only, not stored ·{" "}
          <a href="https://www.ttb.gov" className="underline hover:text-slate-600" target="_blank" rel="noopener noreferrer">ttb.gov</a>
        </p>
      </footer>
    </div>
  );
}
