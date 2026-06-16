"use client";

import { useState, useCallback } from "react";
import VerificationResultDisplay from "@/components/VerificationResult";
import BatchUpload from "@/components/BatchUpload";
import type { ApplicationData, VerificationResult, ExtractedLabelData } from "@/types/label";

const BLANK_APP_DATA: ApplicationData = {
  brandName: "", classType: "", alcoholContent: "", netContents: "",
  producerName: "", producerAddress: "", countryOfOrigin: "",
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

const EDITABLE_FIELDS: { key: keyof ApplicationData; label: string }[] = [
  { key: "brandName", label: "Brand Name" },
  { key: "classType", label: "Class / Type" },
  { key: "alcoholContent", label: "Alcohol Content" },
  { key: "netContents", label: "Net Contents" },
  { key: "producerName", label: "Producer / Bottler Name" },
  { key: "producerAddress", label: "Producer / Bottler Address" },
  { key: "countryOfOrigin", label: "Country of Origin" },
];

interface ImageSlot {
  preview: string;
  base64: string;
  mimeType: string;
}

function ConfidenceDot({ confidence }: { confidence?: string }) {
  if (!confidence) return null;
  const colors = { high: "bg-emerald-400", medium: "bg-amber-400", low: "bg-red-400" };
  const labels = { high: "High confidence", medium: "Medium confidence — verify", low: "Low confidence — verify carefully" };
  return <span title={labels[confidence as keyof typeof labels]} className={`inline-block w-2 h-2 rounded-full ml-1.5 ${colors[confidence as keyof typeof colors] ?? "bg-slate-300"}`} />;
}

function ImageDropZone({
  slot, label, onFile, disabled,
}: {
  slot: ImageSlot | null;
  label: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

  const handle = (file: File) => {
    if (!ALLOWED.has(file.type) || file.size > 5 * 1024 * 1024) return;
    onFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handle(f); }}
      onClick={() => { if (!disabled) document.getElementById(`slot-${label}`)?.click(); }}
      className={`relative border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
        disabled ? "opacity-50 cursor-not-allowed border-slate-200" :
        dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-indigo-400"
      }`}
    >
      {slot ? (
        <div className="p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.preview} alt={label} className="max-h-52 mx-auto object-contain rounded" />
          {!disabled && <p className="text-xs text-center text-slate-400 mt-1">Click or drag to replace</p>}
        </div>
      ) : (
        <div className="p-6 text-center">
          <svg className="mx-auto h-8 w-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP — max 5 MB</p>
        </div>
      )}
      <input id={`slot-${label}`} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} disabled={disabled} />
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("single");
  const [frontSlot, setFrontSlot] = useState<ImageSlot | null>(null);
  const [backSlot, setBackSlot] = useState<ImageSlot | null>(null);
  const [extractionState, setExtractionState] = useState<ExtractionState>("idle");
  const [extracted, setExtracted] = useState<ExtractedLabelData | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [appData, setAppData] = useState<ApplicationData>(BLANK_APP_DATA);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const fileToSlot = (file: File): Promise<ImageSlot> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve({ preview: dataUrl, base64: dataUrl.split(",")[1], mimeType: file.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const mergeIntoForm = useCallback((front: ExtractedLabelData, back?: ExtractedLabelData) => {
    const pick = (fVal: { value: string | null; confidence: string } | null, bVal: { value: string | null; confidence: string } | null) => {
      if (!bVal?.value) return fVal?.value ?? "";
      if (!fVal?.value) return bVal?.value ?? "";
      const order = { high: 0, medium: 1, low: 2 };
      return (order[fVal.confidence as keyof typeof order] ?? 2) <= (order[bVal.confidence as keyof typeof order] ?? 2)
        ? fVal.value : bVal.value;
    };

    const f = front;
    const b = back;

    setAppData((prev) => ({
      ...prev,
      brandName: pick(f.brandName, b?.brandName ?? null),
      classType: pick(f.classType, b?.classType ?? null),
      alcoholContent: pick(f.alcoholContent, b?.alcoholContent ?? null),
      netContents: pick(f.netContents, b?.netContents ?? null),
      producerName: pick(f.producerName, b?.producerName ?? null),
      producerAddress: pick(f.producerAddress, b?.producerAddress ?? null),
      countryOfOrigin: pick(f.countryOfOrigin, b?.countryOfOrigin ?? null),
    }));

    // Merge for confidence display — gov warning from back
    setExtracted({
      ...f,
      governmentWarning: b?.governmentWarning?.value ? b.governmentWarning : f.governmentWarning,
      imageQuality: f.imageQuality === "poor" || b?.imageQuality === "poor" ? "poor"
        : f.imageQuality === "degraded" || b?.imageQuality === "degraded" ? "degraded" : "good",
      imageQualityNotes: [...(f.imageQualityNotes ?? []), ...(b?.imageQualityNotes ?? [])],
    });
  }, []);

  const runExtraction = useCallback(async (front: ImageSlot, back: ImageSlot | null, beverageType: ApplicationData["beverageType"]) => {
    setExtractionState("extracting");
    setExtractionError(null);
    setResult(null);
    setVerifyState("idle");

    try {
      const [frontRes, backRes] = await Promise.all([
        fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: front.base64, imageMimeType: front.mimeType, beverageType }) }).then(r => r.json()),
        back ? fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: back.base64, imageMimeType: back.mimeType, beverageType }) }).then(r => r.json()) : Promise.resolve(null),
      ]);

      if (frontRes.error) { setExtractionError(frontRes.error); setExtractionState("error"); return; }

      mergeIntoForm(frontRes, backRes ?? undefined);
      setExtractionState("extracted");
    } catch {
      setExtractionError("Network error during extraction.");
      setExtractionState("error");
    }
  }, [mergeIntoForm]);

  const handleFrontFile = useCallback(async (file: File) => {
    const slot = await fileToSlot(file);
    setFrontSlot(slot);
    setAppData(BLANK_APP_DATA);
    runExtraction(slot, backSlot, appData.beverageType);
  }, [backSlot, appData.beverageType, runExtraction]);

  const handleBackFile = useCallback(async (file: File) => {
    const slot = await fileToSlot(file);
    setBackSlot(slot);
    if (frontSlot) runExtraction(frontSlot, slot, appData.beverageType);
  }, [frontSlot, appData.beverageType, runExtraction]);

  const handleVerify = async () => {
    if (!frontSlot || extractionState !== "extracted") return;
    setVerifyState("verifying");
    setVerifyError(null);
    setResult(null);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationData: appData,
          imageBase64: frontSlot.base64,
          imageMimeType: frontSlot.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setVerifyError(data.error ?? "Verification failed."); setVerifyState("error"); return; }
      setResult(data);
      setVerifyState("done");
    } catch {
      setVerifyError("Network error. Try again.");
      setVerifyState("error");
    }
  };

  const handleReset = () => {
    setFrontSlot(null); setBackSlot(null);
    setExtracted(null); setExtractionState("idle"); setExtractionError(null);
    setAppData(BLANK_APP_DATA);
    setResult(null); setVerifyState("idle"); setVerifyError(null);
  };

  const getFieldConfidence = (key: keyof ApplicationData) => {
    if (!extracted) return undefined;
    const map: Partial<Record<keyof ApplicationData, keyof ExtractedLabelData>> = {
      brandName: "brandName", classType: "classType", alcoholContent: "alcoholContent",
      netContents: "netContents", producerName: "producerName",
      producerAddress: "producerAddress", countryOfOrigin: "countryOfOrigin",
    };
    const extKey = map[key];
    if (!extKey) return undefined;
    const f = extracted[extKey];
    if (!f || typeof f !== "object" || !("confidence" in f)) return undefined;
    return (f as { confidence: string }).confidence;
  };

  return (
    <div className="min-h-screen bg-slate-50">
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
        {verifyState !== "done" && (
          <div className="flex gap-1 mb-6 border-b border-slate-200">
            {(["single", "batch"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                {t === "single" ? "Single Label" : "Batch Upload"}
                {t === "batch" && <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">up to 300</span>}
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
            {/* LEFT: Images */}
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Label Images</h2>
                <p className="text-sm text-slate-500 mt-0.5">Upload front and back — fields extract automatically.</p>
              </div>

              {/* Beverage type */}
              <div className="flex gap-2 flex-wrap">
                {BEVERAGE_TYPES.map(({ value, label }) => (
                  <label key={value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                    appData.beverageType === value ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}>
                    <input type="radio" name="beverageType" value={value} checked={appData.beverageType === value}
                      onChange={() => setAppData((d) => ({ ...d, beverageType: value }))} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>

              {/* Front + Back side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Front Label</p>
                  <ImageDropZone slot={frontSlot} label="Drop front label" onFile={handleFrontFile}
                    disabled={extractionState === "extracting"} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Back Label <span className="text-slate-400 normal-case font-normal">(gov. warning)</span>
                  </p>
                  <ImageDropZone slot={backSlot} label="Drop back label" onFile={handleBackFile}
                    disabled={extractionState === "extracting" || !frontSlot} />
                </div>
              </div>

              {/* Extraction status */}
              {extractionState === "extracting" && (
                <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Reading label{backSlot ? "s" : ""}…
                </div>
              )}
              {extractionState === "extracted" && (
                <p className="text-sm text-emerald-600 font-medium">✓ Fields extracted — review then verify</p>
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
                    {extracted.imageQuality === "poor" ? "⚠ Poor image quality" : "⚠ Degraded image quality — verify flagged fields"}
                  </p>
                  {extracted.imageQualityNotes.map((n, i) => <p key={i} className="text-xs opacity-80">• {n}</p>)}
                </div>
              )}
            </div>

            {/* RIGHT: Extracted fields */}
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Extracted Fields</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {extractionState === "idle" && "Upload a front label to begin."}
                  {extractionState === "extracting" && "Extracting fields…"}
                  {extractionState === "extracted" && "Review and correct any errors before verifying."}
                  {extractionState === "error" && "Extraction failed. Try a clearer image."}
                </p>
              </div>

              <div className="space-y-3">
                {EDITABLE_FIELDS.map(({ key, label }) => {
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
                        placeholder={extractionState === "idle" ? "Upload a label first" : "Not detected"}
                        disabled={extractionState === "idle" || extractionState === "extracting"}
                        className={`w-full rounded-md border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400 transition-colors ${
                          isLow ? "border-red-300 bg-red-50" : isMedium ? "border-amber-300 bg-amber-50" : "border-slate-200"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-200">
                {verifyError && <p className="text-sm text-red-600 mb-2">⚠ {verifyError}</p>}
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
