"use client";

import type { VerificationResult, FieldStatus } from "@/types/label";
import { GOVERNMENT_WARNING_TEXT } from "@/lib/constants/warnings";

interface VerificationResultProps {
  result: VerificationResult;
}

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

const OVERALL_STYLES = {
  approved: {
    banner: "bg-emerald-600",
    label: "APPROVED",
    description: "All fields verified. Label matches application data.",
  },
  rejected: {
    banner: "bg-red-600",
    label: "REJECTED",
    description: "One or more fields do not match the application. See details below.",
  },
  needs_review: {
    banner: "bg-amber-500",
    label: "NEEDS REVIEW",
    description: "Potential discrepancies detected. Agent review required before decision.",
  },
};

function FieldRow({
  label,
  applicationValue,
  extractedValue,
  status,
  note,
}: {
  label: string;
  applicationValue: string;
  extractedValue: string | null;
  status: FieldStatus;
  note: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${STATUS_STYLES[status]}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm mb-2">
        <div>
          <p className="text-xs opacity-60 mb-0.5">Application</p>
          <p className="font-medium">{applicationValue || "—"}</p>
        </div>
        <div>
          <p className="text-xs opacity-60 mb-0.5">Label</p>
          <p className="font-medium">{extractedValue || <span className="italic opacity-50">Not detected</span>}</p>
        </div>
      </div>
      {note && <p className="text-xs opacity-75">{note}</p>}
    </div>
  );
}

export default function VerificationResultDisplay({ result }: VerificationResultProps) {
  const overall = OVERALL_STYLES[result.overallStatus];

  return (
    <div className="space-y-5">
      {/* Overall status banner */}
      <div className={`${overall.banner} text-white rounded-xl p-5`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-widest opacity-80 mb-1">VERIFICATION RESULT</p>
            <p className="text-2xl font-bold">{overall.label}</p>
            <p className="text-sm opacity-90 mt-1">{overall.description}</p>
          </div>
          <div className="text-right text-xs opacity-70 space-y-1">
            <p>Session: {result.sessionId.slice(0, 8).toUpperCase()}</p>
            <p>Processed in {result.processingMs}ms</p>
          </div>
        </div>
      </div>

      {/* Government warning — always shown first, it's the most critical */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Government Warning Statement <span className="text-slate-400">(27 CFR 16.21 — mandatory)</span>
        </h3>
        <div className={`rounded-lg border p-4 ${STATUS_STYLES[result.governmentWarningResult.status]}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-70">Government Warning</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[result.governmentWarningResult.status]}`}>
              {STATUS_LABEL[result.governmentWarningResult.status]}
            </span>
          </div>
          <div className="text-sm space-y-2">
            <div>
              <p className="text-xs opacity-60 mb-0.5">Required text</p>
              <p className="text-xs font-mono bg-white/50 rounded p-2 border leading-relaxed">
                {GOVERNMENT_WARNING_TEXT}
              </p>
            </div>
            {result.governmentWarningResult.extracted && (
              <div>
                <p className="text-xs opacity-60 mb-0.5">Extracted from label</p>
                <p className="text-xs font-mono bg-white/50 rounded p-2 border leading-relaxed">
                  {result.governmentWarningResult.extracted}
                </p>
              </div>
            )}
            <p className="text-xs opacity-75">{result.governmentWarningResult.note}</p>
          </div>
        </div>
      </div>

      {/* Field-by-field results */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Field Verification
        </h3>
        <div className="space-y-3">
          {result.fields.map((field) => (
            <FieldRow key={field.field} {...field} />
          ))}
        </div>
      </div>
    </div>
  );
}
