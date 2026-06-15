/**
 * Field-level validation logic for TTB label verification.
 * All functions are pure — no side effects, no API calls.
 * Designed to be testable in isolation.
 */

import {
  GOVERNMENT_WARNING_TEXT,
  GOVERNMENT_WARNING_PREFIX,
  ABV_PATTERN,
} from "../constants/warnings";
import type {
  ApplicationData,
  ExtractedLabelData,
  FieldResult,
  FieldStatus,
  VerificationResult,
} from "../../types/label";

// ---------------------------------------------------------------------------
// String normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a string for comparison: trim whitespace, collapse internal
 * whitespace runs, and convert to lowercase.
 * Does NOT strip punctuation — punctuation differences are surfaced as warnings.
 */
function normalizeForComparison(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Check if two strings match with case/whitespace normalization.
 * Returns "pass" for exact normalized match, "warning" for matches that
 * differ only in case or internal whitespace (e.g., Dave's "STONE'S THROW"
 * vs "Stone's Throw"), "fail" for substantive mismatch.
 */
function compareField(
  applicationValue: string,
  extractedValue: string | null
): { status: FieldStatus; note: string } {
  if (!extractedValue) {
    return {
      status: "fail",
      note: "Field not detected on label.",
    };
  }

  const appNorm = normalizeForComparison(applicationValue);
  const extNorm = normalizeForComparison(extractedValue);

  if (appNorm === extNorm) {
    // Check if the raw values differ (case or whitespace only)
    if (applicationValue.trim() !== extractedValue.trim()) {
      return {
        status: "warning",
        note: `Values match when normalized but differ in casing or spacing. Application: "${applicationValue}" / Label: "${extractedValue}". Agent review recommended.`,
      };
    }
    return { status: "pass", note: "Exact match." };
  }

  return {
    status: "fail",
    note: `Mismatch. Application states "${applicationValue}" — label shows "${extractedValue}".`,
  };
}

// ---------------------------------------------------------------------------
// ABV-specific validation
// ---------------------------------------------------------------------------

/**
 * Alcohol content comparison extracts the numeric ABV from both strings
 * before comparing, accounting for formatting variation (spaces, periods,
 * "Alc./Vol." vs "Alc/Vol" etc.).
 */
function compareAlcoholContent(
  applicationValue: string,
  extractedValue: string | null
): { status: FieldStatus; note: string } {
  if (!extractedValue) {
    return { status: "fail", note: "Alcohol content not detected on label." };
  }

  const appMatch = applicationValue.match(ABV_PATTERN);
  const extMatch = extractedValue.match(ABV_PATTERN);

  if (!appMatch) {
    return {
      status: "warning",
      note: `Application ABV format unrecognized: "${applicationValue}". Manual review required.`,
    };
  }

  if (!extMatch) {
    return {
      status: "warning",
      note: `Label ABV format unrecognized: "${extractedValue}". Manual review required.`,
    };
  }

  const appAbv = parseFloat(appMatch[1]);
  const extAbv = parseFloat(extMatch[1]);

  if (Math.abs(appAbv - extAbv) < 0.01) {
    return { status: "pass", note: `ABV matches: ${appAbv}%.` };
  }

  return {
    status: "fail",
    note: `ABV mismatch. Application: ${appAbv}% / Label: ${extAbv}%.`,
  };
}

// ---------------------------------------------------------------------------
// Government warning validation (strict per 27 CFR 16.21)
// ---------------------------------------------------------------------------

/**
 * Validates the government warning statement.
 * Rules per 27 CFR 16.21:
 *   1. "GOVERNMENT WARNING:" must appear in all caps and bold (bold verified visually by agent)
 *   2. Full statement must be present verbatim
 *   3. We surface case issues explicitly as a fail, not a warning
 */
export function validateGovernmentWarning(extracted: string | null): {
  status: FieldStatus;
  extracted: string | null;
  note: string;
} {
  if (!extracted) {
    return {
      status: "fail",
      extracted: null,
      note: "Government warning statement not detected on label. This is a mandatory field.",
    };
  }

  const trimmed = extracted.trim().replace(/\s+/g, " ");

  // Check prefix casing first (common violation per Jenny's interview notes)
  if (!trimmed.startsWith(GOVERNMENT_WARNING_PREFIX)) {
    const lowerStart = trimmed.toLowerCase().startsWith("government warning:");
    if (lowerStart) {
      return {
        status: "fail",
        extracted,
        note: `"GOVERNMENT WARNING:" prefix must appear in all caps and bold per 27 CFR 16.21. Label shows incorrect casing.`,
      };
    }
    return {
      status: "fail",
      extracted,
      note: `Government warning does not begin with required "GOVERNMENT WARNING:" prefix.`,
    };
  }

  // Normalize body for comparison (spacing only, preserve case)
  const expectedNorm = GOVERNMENT_WARNING_TEXT.replace(/\s+/g, " ").trim();
  const extractedNorm = trimmed.replace(/\s+/g, " ");

  if (extractedNorm === expectedNorm) {
    return {
      status: "pass",
      extracted,
      note: "Government warning matches required text exactly.",
    };
  }

  // Check if it matches case-insensitively (still a fail per regulations)
  if (extractedNorm.toLowerCase() === expectedNorm.toLowerCase()) {
    return {
      status: "fail",
      extracted,
      note: "Government warning text matches but casing differs from required statement. Must be exact per 27 CFR 16.21.",
    };
  }

  return {
    status: "fail",
    extracted,
    note: "Government warning text does not match required statement per 27 CFR 16.21.",
  };
}

// ---------------------------------------------------------------------------
// Main verification engine
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  brandName: "Brand Name",
  classType: "Class / Type",
  alcoholContent: "Alcohol Content",
  netContents: "Net Contents",
  producerName: "Producer Name",
  producerAddress: "Producer Address",
  countryOfOrigin: "Country of Origin",
};

export function runVerification(
  applicationData: ApplicationData,
  extracted: ExtractedLabelData,
  processingMs: number,
  sessionId: string
): VerificationResult {
  const fieldResults: FieldResult[] = [];

  const fieldKeys: (keyof ApplicationData)[] = [
    "brandName",
    "classType",
    "alcoholContent",
    "netContents",
    "producerName",
    "producerAddress",
    "countryOfOrigin",
  ];

  for (const key of fieldKeys) {
    const appVal = applicationData[key] as string;
    if (!appVal || appVal.trim() === "") continue; // skip unprovided optional fields

    const extVal = extracted[key as keyof ExtractedLabelData] as string | null;

    const result =
      key === "alcoholContent"
        ? compareAlcoholContent(appVal, extVal)
        : compareField(appVal, extVal);

    fieldResults.push({
      field: key,
      label: FIELD_LABELS[key] ?? key,
      applicationValue: appVal,
      extractedValue: extVal,
      ...result,
    });
  }

  const warningResult = validateGovernmentWarning(extracted.governmentWarning);

  // Determine overall status
  const hasFail = fieldResults.some((r) => r.status === "fail") || warningResult.status === "fail";
  const hasWarning = fieldResults.some((r) => r.status === "warning") || warningResult.status === "warning";

  const overallStatus = hasFail
    ? "rejected"
    : hasWarning
    ? "needs_review"
    : "approved";

  return {
    overallStatus,
    fields: fieldResults,
    governmentWarningResult: warningResult,
    processingMs,
    sessionId,
  };
}
