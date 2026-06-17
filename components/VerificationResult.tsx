"use client";

import { useState } from "react";
import type { VerificationResult, FieldResult, FieldStatus, FieldConfidence } from "@/types/label";
import { GOVERNMENT_WARNING_TEXT } from "@/lib/constants/warnings";
import { runVerification } from "@/lib/validation/fieldValidator";

interface VerificationResultProps {
  result: VerificationResult;
  applicationData: import("@/types/label").ApplicationData;
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<FieldStatus, string> = {
  pass: "bg-emerald-50 border-emerald-200 text-emerald-800",
  fail: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  not_checked: "bg-slate-50 border-slate-200 text-slate-600",
};

const STATUS_BADGE: Record<FieldStatus, string> = {
  pass: "bg-emerald-100 text-emerald-700",
  fail: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  not_checked: "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<FieldStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  warning: "Review",
  not_checked: "Not Checked",
};

const CONFIDENCE_STYLES: Record<FieldConfidence, string> = {
  high: "text-emerald-600",
  medium: "text-amber-600",
  low: "text-red-600",
};

const CONFIDENCE_LABEL: Record<FieldConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence — verify manually",
};

const OVERALL_STYLES = {
  approved: { banner: "bg-emerald-600", label: "APPROVED", description: "All fields verified. Label matches application data." },
  rejected: { banner: "bg-red-600", label: "REJECTED", description: "One or more fields do not match the application. See details below." },
  needs_review: { banner: "bg-amber-500", label: "NEEDS REVIEW", description: "Potential discrepancies detected. Agent review required before decision." },
};

// ---------------------------------------------------------------------------
// Field row with edit + override
// ---------------------------------------------------------------------------

function FieldRow({
  fieldResult,
  onOverride,
  onEditValue,
}: {
  fieldResult: FieldResult;
  onOverride: (decision: "accepted" | "rejected", reason: string) => void;
  onEditValue: (newValue: string) => void;
}) {
  const { label, applicationValue, extractedValue, confidence, confidenceNote, status, note, agentOverride } = fieldResult;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(extractedValue ?? "");
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingDecision, setPendingDecision] = useState<"accepted" | "rejected" | null>(null);

  const effectiveStatus = agentOverride
    ? agentOverride.decision === "accepted" ? "pass" : "fail"
    : status;

  const handleSaveEdit = () => {
    onEditValue(editValue);
    setEditing(false);
  };

  const handleOverrideSubmit = () => {
    if (!pendingDecision || !overrideReason.trim()) return;
    onOverride(pendingDecision, overrideReason.trim());
    setShowOverride(false);
    setOverrideReason("");
    setPendingDecision(null);
  };

  const needsReview = status === "warning" || status === "fail";

  return (
    <div className={`rounded-lg border p-4 ${STATUS_STYLES[effectiveStatus]}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
        <div className="flex items-center gap-2">
          {agentOverride && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
              Agent {agentOverride.decision === "accepted" ? "Accepted" : "Rejected"}
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[effectiveStatus]}`}>
            {STATUS_LABEL[effectiveStatus]}
          </span>
        </div>
      </div>

      {/* Values */}
      <div className="grid grid-cols-2 gap-3 text-sm mb-2">
        <div>
          <p className="text-xs opacity-60 mb-0.5">Application</p>
          <p className="font-medium">{applicationValue || "—"}</p>
        </div>
        <div>
          <p className="text-xs opacity-60 mb-0.5">
            Label
            {!agentOverride && (
              <button
                onClick={() => { setEditing(!editing); setEditValue(extractedValue ?? ""); }}
                className="ml-2 underline text-xs opacity-60 hover:opacity-100"
              >
                {editing ? "cancel" : "edit"}
              </button>
            )}
          </p>
          {editing ? (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 rounded border border-current/30 bg-white/60 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                autoFocus
              />
              <button
                onClick={handleSaveEdit}
                className="text-xs font-semibold px-2 py-1 rounded bg-brand-600 text-white hover:bg-brand-700"
              >
                Re-validate
              </button>
            </div>
          ) : (
            <p className="font-medium">
              {agentOverride?.correctedValue ?? extractedValue ?? (
                <span className="italic opacity-50">Not detected</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Confidence indicator */}
      <div className={`text-xs mb-2 ${CONFIDENCE_STYLES[confidence]}`}>
        ● {CONFIDENCE_LABEL[confidence]}
        {confidenceNote && <span className="opacity-75"> — {confidenceNote}</span>}
      </div>

      {/* Validation note */}
      {note && !agentOverride && <p className="text-xs opacity-75 mb-2">{note}</p>}

      {/* Agent override note */}
      {agentOverride && (
        <div className="text-xs bg-white/40 rounded p-2 border border-current/20">
          <span className="font-semibold">Agent note:</span> {agentOverride.reason}
          <span className="opacity-50 ml-2">{new Date(agentOverride.timestamp).toLocaleTimeString()}</span>
        </div>
      )}

      {/* Override controls — only for fields needing review */}
      {needsReview && !agentOverride && !editing && (
        <div className="mt-3 pt-3 border-t border-current/20">
          {!showOverride ? (
            <button
              onClick={() => setShowOverride(true)}
              className="text-xs font-semibold underline opacity-70 hover:opacity-100"
            >
              Record agent decision
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold">Agent decision</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingDecision("accepted")}
                  className={`text-xs px-3 py-1.5 rounded font-semibold border transition-colors ${
                    pendingDecision === "accepted"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "border-current/30 hover:bg-white/30"
                  }`}
                >
                  Accept
                </button>
                <button
                  onClick={() => setPendingDecision("rejected")}
                  className={`text-xs px-3 py-1.5 rounded font-semibold border transition-colors ${
                    pendingDecision === "rejected"
                      ? "bg-red-600 text-white border-red-600"
                      : "border-current/30 hover:bg-white/30"
                  }`}
                >
                  Reject
                </button>
              </div>
              <input
                type="text"
                placeholder="Reason for decision (required)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full rounded border border-current/30 bg-white/60 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleOverrideSubmit}
                  disabled={!pendingDecision || !overrideReason.trim()}
                  className="text-xs px-3 py-1.5 rounded bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save decision
                </button>
                <button
                  onClick={() => { setShowOverride(false); setPendingDecision(null); setOverrideReason(""); }}
                  className="text-xs px-3 py-1.5 rounded border border-current/30 hover:bg-white/30"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VerificationResultDisplay({ result: initialResult, applicationData }: VerificationResultProps) {
  const [result, setResult] = useState(initialResult);
  const [finalized, setFinalized] = useState(false);
  const [finalDecision, setFinalDecision] = useState<"approved" | "rejected" | null>(null);

  // Recompute overall status dynamically based on current agent overrides
  const effectiveOverallStatus = (() => {
    if (finalized && finalDecision) return finalDecision;

    const hasFail = result.fields.some((f) => {
      const s = f.agentOverride ? (f.agentOverride.decision === "accepted" ? "pass" : "fail") : f.status;
      return s === "fail";
    }) || (
      result.governmentWarningResult.agentOverride
        ? result.governmentWarningResult.agentOverride.decision === "rejected"
        : result.governmentWarningResult.status === "fail"
    );

    const hasWarning = !hasFail && (
      result.fields.some((f) => {
        if (f.agentOverride) return false; // agent reviewed — no longer a warning
        return f.status === "warning";
      }) ||
      (result.governmentWarningResult.status === "warning" && !result.governmentWarningResult.agentOverride) ||
      (result.imageQuality !== "good" && result.fields.some((f) => !f.agentOverride && (f.status === "fail" || f.status === "warning")))
    );

    return hasFail ? "rejected" : hasWarning ? "needs_review" : "approved";
  })();

  const overall = OVERALL_STYLES[effectiveOverallStatus];

  const handleFieldOverride = (fieldKey: string, decision: "accepted" | "rejected", reason: string) => {
    setResult((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.field === fieldKey
          ? { ...f, agentOverride: { decision, reason, timestamp: new Date().toISOString() } }
          : f
      ),
    }));
  };

  const handleEditValue = (fieldKey: string, newValue: string) => {
    // Re-run validation with the corrected extracted value
    const updatedExtracted = {
      brandName: { value: null, confidence: "high" as const, confidenceNote: null },
      classType: { value: null, confidence: "high" as const, confidenceNote: null },
      alcoholContent: { value: null, confidence: "high" as const, confidenceNote: null },
      netContents: { value: null, confidence: "high" as const, confidenceNote: null },
      producerName: { value: null, confidence: "high" as const, confidenceNote: null },
      producerAddress: { value: null, confidence: "high" as const, confidenceNote: null },
      countryOfOrigin: { value: null, confidence: "high" as const, confidenceNote: null },
      governmentWarning: { value: null, confidence: "high" as const, confidenceNote: null },
      imageQuality: result.imageQuality,
      imageQualityNotes: result.imageQualityNotes,
    };

    // Populate from current result fields
    type ExtractedFieldMap = Record<string, { value: string | null; confidence: FieldConfidence; confidenceNote: string | null }>;
    const fieldMap = updatedExtracted as unknown as ExtractedFieldMap;
    for (const f of result.fields) {
      if (f.field in fieldMap) {
        fieldMap[f.field] = {
          value: f.field === fieldKey ? newValue : f.extractedValue,
          confidence: f.confidence,
          confidenceNote: f.confidenceNote,
        };
      }
    }
    // Handle government warning via fieldMap to avoid type conflicts
    fieldMap["governmentWarning"] = {
      value: result.governmentWarningResult.extracted ?? null,
      confidence: result.governmentWarningResult.confidence,
      confidenceNote: result.governmentWarningResult.confidenceNote ?? null,
    };

    const revalidated = runVerification(
      applicationData,
      updatedExtracted,
      result.processingMs,
      result.sessionId
    );

    // Preserve existing agent overrides for unchanged fields
    const mergedFields = revalidated.fields.map((f) => {
      const existing = result.fields.find((ef) => ef.field === f.field);
      return existing?.agentOverride && f.field !== fieldKey
        ? { ...f, agentOverride: existing.agentOverride }
        : f;
    });

    setResult({ ...revalidated, fields: mergedFields });
  };

  const handleWarningOverride = (decision: "accepted" | "rejected", reason: string) => {
    setResult((prev) => ({
      ...prev,
      governmentWarningResult: {
        ...prev.governmentWarningResult,
        agentOverride: { decision, reason, timestamp: new Date().toISOString() },
      },
    }));
  };

  const [showWarningOverride, setShowWarningOverride] = useState(false);
  const [warningOverrideReason, setWarningOverrideReason] = useState("");
  const [warningDecision, setWarningDecision] = useState<"accepted" | "rejected" | null>(null);

  const pendingReviewCount = result.fields.filter(
    (f) => (f.status === "fail" || f.status === "warning") && !f.agentOverride
  ).length + (
    result.governmentWarningResult.status !== "pass" && !result.governmentWarningResult.agentOverride ? 1 : 0
  );

  return (
    <div className="space-y-5">
      {/* Overall status banner */}
      <div className={`${overall.banner} text-white rounded-xl p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest opacity-80 mb-1">VERIFICATION RESULT</p>
            <p className="text-2xl font-bold">{overall.label}</p>
            <p className="text-sm opacity-90 mt-1">{overall.description}</p>
            {effectiveOverallStatus === "needs_review" && pendingReviewCount > 0 && (
              <p className="text-xs opacity-75 mt-1">{pendingReviewCount} field{pendingReviewCount !== 1 ? "s" : ""} pending agent review</p>
            )}
          </div>
          <div className="text-right space-y-2">
            <div className="text-xs opacity-70 space-y-1">
              <p>Session: {result.sessionId.slice(0, 8).toUpperCase()}</p>
              <p>Processed in {result.processingMs}ms</p>
            </div>
            {!finalized && pendingReviewCount === 0 && (
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => { setFinalDecision("approved"); setFinalized(true); }}
                  className="text-xs font-bold px-3 py-1.5 rounded bg-white text-emerald-700 hover:bg-emerald-50"
                >
                  ✓ Finalize: Approve
                </button>
                <button
                  onClick={() => { setFinalDecision("rejected"); setFinalized(true); }}
                  className="text-xs font-bold px-3 py-1.5 rounded bg-white/20 border border-white/40 text-white hover:bg-white/30"
                >
                  ✗ Finalize: Reject
                </button>
              </div>
            )}
            {finalized && (
              <div className="text-xs font-bold bg-white/20 rounded px-3 py-1.5 border border-white/40">
                Decision recorded: {finalDecision === "approved" ? "APPROVED" : "REJECTED"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image quality warning */}
      {result.imageQuality !== "good" && (
        <div className={`rounded-lg border p-4 flex gap-3 ${
          result.imageQuality === "poor"
            ? "bg-red-50 border-red-200 text-red-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <span className="text-lg leading-none">⚠</span>
          <div>
            <p className="text-sm font-semibold mb-1">
              {result.imageQuality === "poor" ? "Poor image quality — results may be unreliable" : "Degraded image quality — verify flagged fields manually"}
            </p>
            {result.imageQualityNotes.map((note, i) => (
              <p key={i} className="text-xs opacity-80">• {note}</p>
            ))}
          </div>
        </div>
      )}

      {/* Government warning */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Government Warning Statement <span className="text-slate-400">(27 CFR 16.21 — mandatory)</span>
        </h3>
        <div className={`rounded-lg border p-4 ${STATUS_STYLES[result.governmentWarningResult.agentOverride ? (result.governmentWarningResult.agentOverride.decision === "accepted" ? "pass" : "fail") : result.governmentWarningResult.status]}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-70">Government Warning</span>
            <div className="flex gap-2 items-center">
              {result.governmentWarningResult.agentOverride && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
                  Agent {result.governmentWarningResult.agentOverride.decision === "accepted" ? "Accepted" : "Rejected"}
                </span>
              )}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[result.governmentWarningResult.status]}`}>
                {STATUS_LABEL[result.governmentWarningResult.status]}
              </span>
            </div>
          </div>

          <div className="text-sm space-y-2">
            <div>
              <p className="text-xs opacity-60 mb-0.5">Required text</p>
              <p className="text-xs font-mono bg-white/50 rounded p-2 border leading-relaxed">{GOVERNMENT_WARNING_TEXT}</p>
            </div>
            {result.governmentWarningResult.extracted && (
              <div>
                <p className="text-xs opacity-60 mb-0.5">Extracted from label</p>
                <p className="text-xs font-mono bg-white/50 rounded p-2 border leading-relaxed">{result.governmentWarningResult.extracted}</p>
              </div>
            )}
            <div className={`text-xs ${CONFIDENCE_STYLES[result.governmentWarningResult.confidence]}`}>
              ● {CONFIDENCE_LABEL[result.governmentWarningResult.confidence]}
              {result.governmentWarningResult.confidenceNote && (
                <span className="opacity-75"> — {result.governmentWarningResult.confidenceNote}</span>
              )}
            </div>
            <p className="text-xs opacity-75">{result.governmentWarningResult.note}</p>

            {result.governmentWarningResult.agentOverride && (
              <div className="text-xs bg-white/40 rounded p-2 border border-current/20">
                <span className="font-semibold">Agent note:</span> {result.governmentWarningResult.agentOverride.reason}
                <span className="opacity-50 ml-2">{new Date(result.governmentWarningResult.agentOverride.timestamp).toLocaleTimeString()}</span>
              </div>
            )}

            {result.governmentWarningResult.status !== "pass" && !result.governmentWarningResult.agentOverride && (
              <div className="pt-2 border-t border-current/20">
                {!showWarningOverride ? (
                  <button onClick={() => setShowWarningOverride(true)} className="text-xs font-semibold underline opacity-70 hover:opacity-100">
                    Record agent decision
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold">Agent decision</p>
                    <div className="flex gap-2">
                      {(["accepted", "rejected"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setWarningDecision(d)}
                          className={`text-xs px-3 py-1.5 rounded font-semibold border transition-colors capitalize ${
                            warningDecision === d
                              ? d === "accepted" ? "bg-emerald-600 text-white border-emerald-600" : "bg-red-600 text-white border-red-600"
                              : "border-current/30 hover:bg-white/30"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Reason for decision (required)"
                      value={warningOverrideReason}
                      onChange={(e) => setWarningOverrideReason(e.target.value)}
                      className="w-full rounded border border-current/30 bg-white/60 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { if (warningDecision && warningOverrideReason.trim()) { handleWarningOverride(warningDecision, warningOverrideReason.trim()); setShowWarningOverride(false); } }}
                        disabled={!warningDecision || !warningOverrideReason.trim()}
                        className="text-xs px-3 py-1.5 rounded bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Save decision
                      </button>
                      <button onClick={() => { setShowWarningOverride(false); setWarningDecision(null); setWarningOverrideReason(""); }} className="text-xs px-3 py-1.5 rounded border border-current/30 hover:bg-white/30">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Field results */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Field Verification</h3>
        <div className="space-y-3">
          {result.fields.map((f) => (
            <FieldRow
              key={f.field}
              fieldResult={f}
              onOverride={(decision, reason) => handleFieldOverride(f.field, decision, reason)}
              onEditValue={(newValue) => handleEditValue(f.field, newValue)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
