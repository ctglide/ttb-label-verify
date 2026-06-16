"use client";

import { useState } from "react";
import LabelUpload from "@/components/LabelUpload";
import ApplicationForm from "@/components/ApplicationForm";
import VerificationResultDisplay from "@/components/VerificationResult";
import BatchUpload from "@/components/BatchUpload";
import type { ApplicationData, VerificationResult } from "@/types/label";

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

type PageState = "idle" | "loading" | "result" | "error";
type Tab = "single" | "batch";

export default function Home() {
  const [tab, setTab] = useState<Tab>("single");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [appData, setAppData] = useState<ApplicationData>(DEFAULT_APP_DATA);
  const [pageState, setPageState] = useState<PageState>("idle");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    imageBase64 &&
    appData.brandName.trim() &&
    appData.classType.trim() &&
    appData.alcoholContent.trim();

  const handleVerify = async () => {
    if (!canSubmit) return;
    setPageState("loading");
    setResult(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationData: appData, imageBase64, imageMimeType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "Verification failed. Please try again.");
        setPageState("error");
        return;
      }
      setResult(data);
      setPageState("result");
    } catch {
      setErrorMessage("Network error. Check your connection and try again.");
      setPageState("error");
    }
  };

  const handleReset = () => {
    setPageState("idle");
    setResult(null);
    setErrorMessage(null);
    setImageBase64(null);
    setImageMimeType(null);
    setAppData(DEFAULT_APP_DATA);
  };

  const isLoading = pageState === "loading";

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
        {/* Tabs */}
        {pageState !== "result" && (
          <div className="flex gap-1 mb-6 border-b border-slate-200">
            {(["single", "batch"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t === "single" ? "Single Label" : "Batch Upload"}
                {t === "batch" && (
                  <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">
                    up to 300
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {pageState === "result" && result ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Verification Complete</h2>
              <button onClick={handleReset} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                ← Verify another label
              </button>
            </div>
            <VerificationResultDisplay result={result} applicationData={appData} />
          </div>
        ) : tab === "batch" ? (
          <BatchUpload />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Label Image</h2>
                <p className="text-sm text-slate-500 mt-0.5">Upload the label artwork submitted with the application.</p>
              </div>
              <LabelUpload
                onImageReady={(b64, mime) => { setImageBase64(b64); setImageMimeType(mime); }}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Application Data</h2>
                <p className="text-sm text-slate-500 mt-0.5">Enter the values from the COLA application form.</p>
              </div>
              <ApplicationForm data={appData} onChange={setAppData} disabled={isLoading} />
            </div>

            <div className="lg:col-span-2 border-t border-slate-200 pt-4 flex items-center justify-between gap-4 flex-wrap">
              {errorMessage && (
                <p role="alert" className="text-sm text-red-600 flex items-center gap-1.5">
                  <span aria-hidden="true">⚠</span> {errorMessage}
                </p>
              )}
              <div className="ml-auto flex items-center gap-3">
                {!canSubmit && (
                  <p className="text-xs text-slate-400">Upload a label image and fill in required fields to continue.</p>
                )}
                <button
                  onClick={handleVerify}
                  disabled={!canSubmit || isLoading}
                  className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading ? (
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
          <a href="https://www.ttb.gov" className="underline hover:text-slate-600" target="_blank" rel="noopener noreferrer">
            ttb.gov
          </a>
        </p>
      </footer>
    </div>
  );
}
