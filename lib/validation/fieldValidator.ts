/**
 * Field-level validation logic for TTB label verification.
 * All functions are pure — no side effects, no API calls.
 * Designed to be testable in isolation.
 *
 * CFR references:
 *   Distilled spirits labeling: 27 CFR Part 5
 *   Wine labeling:              27 CFR Part 4
 *   Malt beverage labeling:     27 CFR Part 7
 *   Government warning:         27 CFR Part 16
 */

import {
  GOVERNMENT_WARNING_TEXT,
  GOVERNMENT_WARNING_PREFIX,
  ABV_PATTERN,
  ABV_PROHIBITED_ABBREVIATION,
  ABV_TOLERANCES,
  WINE_TABLE_WINE_DESIGNATIONS,
  WINE_MANDATORY_ABV_THRESHOLD,
  WINE_TTB_JURISDICTION_MINIMUM,
  MALT_BEVERAGE_ABV_MANDATORY_NOTE,
} from "../constants/warnings";
import type {
  ApplicationData,
  ExtractedLabelData,
  ExtractedField,
  FieldResult,
  FieldStatus,
  FieldConfidence,
  BeverageType,
  VerificationResult,
} from "../../types/label";

// ---------------------------------------------------------------------------
// String normalization helpers
// ---------------------------------------------------------------------------

function normalizeForComparison(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function compareField(
  applicationValue: string,
  extractedField: ExtractedField
): { status: FieldStatus; note: string } {
  const { value: extractedValue } = extractedField;

  if (!extractedValue) {
    return { status: "fail", note: "Field not detected on label." };
  }

  const appNorm = normalizeForComparison(applicationValue);
  const extNorm = normalizeForComparison(extractedValue);

  if (appNorm === extNorm) {
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
// ABV-specific validation — beverage-type-aware with CFR tolerances
// ---------------------------------------------------------------------------

function getAbvTolerance(beverageType: BeverageType, abv: number): number {
  if (beverageType === "distilled_spirits") return ABV_TOLERANCES.distilled_spirits;
  if (beverageType === "malt_beverage") return ABV_TOLERANCES.malt_beverage;
  // wine
  return abv > WINE_MANDATORY_ABV_THRESHOLD
    ? ABV_TOLERANCES.wine_over_14
    : ABV_TOLERANCES.wine_under_14;
}

function extractAbvValue(value: string): number | null {
  const match = value.match(ABV_PATTERN);
  return match ? parseFloat(match[1]) : null;
}

function compareAlcoholContent(
  applicationValue: string,
  extractedField: ExtractedField,
  beverageType: BeverageType,
  classType: string
): { status: FieldStatus; note: string } {
  const { value: extractedValue } = extractedField;

  // Wine under 7%: outside TTB jurisdiction — cannot validate
  if (beverageType === "wine") {
    const appAbv = extractAbvValue(applicationValue);
    if (appAbv !== null && appAbv < WINE_TTB_JURISDICTION_MINIMUM) {
      return {
        status: "warning",
        note: `Wine under ${WINE_TTB_JURISDICTION_MINIMUM}% ABV falls under FDA jurisdiction (not TTB). ` +
          `TTB label requirements in 27 CFR Part 4 do not apply. Manual review required.`,
      };
    }

    // Wine 7–14%: ABV optional if class/type is "table wine" or "light wine"
    if (appAbv !== null && appAbv <= WINE_MANDATORY_ABV_THRESHOLD) {
      const classNorm = normalizeForComparison(classType);
      const isTableOrLight = WINE_TABLE_WINE_DESIGNATIONS.some((d) =>
        classNorm.includes(d)
      );
      if (isTableOrLight && !extractedValue) {
        return {
          status: "pass",
          note: `ABV statement is optional for table wine/light wine (7–14% ABV) per 27 CFR 4.36. ` +
            `Class/type designation "${classType}" satisfies this requirement.`,
        };
      }
    }
  }

  // Malt beverage: ABV is conditionally mandatory
  if (beverageType === "malt_beverage" && !extractedValue && !applicationValue.trim()) {
    return {
      status: "warning",
      note: MALT_BEVERAGE_ABV_MANDATORY_NOTE,
    };
  }

  if (!extractedValue) {
    return { status: "fail", note: "Alcohol content not detected on label." };
  }

  // Check for prohibited "ABV" abbreviation (wine and malt beverage per CFR)
  if (
    beverageType !== "distilled_spirits" &&
    ABV_PROHIBITED_ABBREVIATION.test(extractedValue)
  ) {
    return {
      status: "fail",
      note: `"ABV" is a prohibited abbreviation for ${beverageType === "wine" ? "wine (27 CFR 4.36)" : "malt beverages (27 CFR 7.65)"}. ` +
        `Use "Alc./Vol.", "Alc/Vol", or "Alcohol by Volume" instead.`,
    };
  }

  const appAbv = extractAbvValue(applicationValue);
  const extAbv = extractAbvValue(extractedValue);

  if (appAbv === null) {
    return {
      status: "warning",
      note: `Application ABV format unrecognized: "${applicationValue}". Manual review required.`,
    };
  }

  if (extAbv === null) {
    return {
      status: "warning",
      note: `Label ABV format unrecognized: "${extractedValue}". Manual review required.`,
    };
  }

  const tolerance = getAbvTolerance(beverageType, appAbv);
  const diff = Math.abs(appAbv - extAbv);

  if (diff <= tolerance) {
    const note =
      diff < 0.001
        ? `ABV matches exactly: ${appAbv}%.`
        : `ABV within permitted tolerance (±${tolerance}%). Application: ${appAbv}% / Label: ${extAbv}% / Difference: ${diff.toFixed(2)}%.`;
    return { status: diff < 0.001 ? "pass" : "warning", note };
  }

  return {
    status: "fail",
    note: `ABV mismatch outside permitted tolerance (±${tolerance}%). ` +
      `Application: ${appAbv}% / Label: ${extAbv}% / Difference: ${diff.toFixed(2)}%.`,
  };
}

// ---------------------------------------------------------------------------
// Government warning validation (strict per 27 CFR 16.21)
// ---------------------------------------------------------------------------

export function validateGovernmentWarning(extractedField: ExtractedField | null): {
  status: FieldStatus;
  extracted: string | null;
  confidence: FieldConfidence;
  confidenceNote: string | null;
  note: string;
} {
  if (!extractedField || !extractedField.value) {
    return {
      status: "fail",
      extracted: null,
      confidence: "high",
      confidenceNote: null,
      note: "Government warning statement not detected on label. This is a mandatory field.",
    };
  }

  const { value: extracted, confidence, confidenceNote } = extractedField;
  const trimmed = extracted.trim().replace(/\s+/g, " ");

  if (!trimmed.startsWith(GOVERNMENT_WARNING_PREFIX)) {
    const lowerStart = trimmed.toLowerCase().startsWith("government warning:");
    return {
      status: "fail",
      extracted,
      confidence,
      confidenceNote,
      note: lowerStart
        ? `"GOVERNMENT WARNING:" prefix must appear in all caps and bold per 27 CFR 16.21. Label shows incorrect casing.`
        : `Government warning does not begin with required "GOVERNMENT WARNING:" prefix.`,
    };
  }

  const expectedNorm = GOVERNMENT_WARNING_TEXT.replace(/\s+/g, " ").trim();
  const extractedNorm = trimmed.replace(/\s+/g, " ");

  if (extractedNorm === expectedNorm) {
    return { status: "pass", extracted, confidence, confidenceNote, note: "Government warning matches required text exactly." };
  }

  if (extractedNorm.toLowerCase() === expectedNorm.toLowerCase()) {
    return {
      status: "fail",
      extracted,
      confidence,
      confidenceNote,
      note: "Government warning text matches but casing differs from required statement. Must be exact per 27 CFR 16.21.",
    };
  }

  return {
    status: "fail",
    extracted,
    confidence,
    confidenceNote,
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
  const { beverageType, classType } = applicationData;

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
    if (!appVal || appVal.trim() === "") continue;

    const extractedField = extracted[key as keyof ExtractedLabelData] as ExtractedField;

    const result =
      key === "alcoholContent"
        ? compareAlcoholContent(appVal, extractedField, beverageType, classType)
        : compareField(appVal, extractedField);

    // Downgrade pass → warning if AI confidence is low
    let { status } = result;
    if (status === "pass" && extractedField?.confidence === "low") {
      status = "warning";
    }

    fieldResults.push({
      field: key,
      label: FIELD_LABELS[key] ?? key,
      applicationValue: appVal,
      extractedValue: extractedField?.value ?? null,
      confidence: extractedField?.confidence ?? "high",
      confidenceNote: extractedField?.confidenceNote ?? null,
      status,
      note:
        status === "warning" && result.status === "pass"
          ? `Extracted value matches but AI confidence is low. ${extractedField?.confidenceNote ?? "Verify manually."}`
          : result.note,
    });
  }

  const warningResult = validateGovernmentWarning(extracted.governmentWarning ?? null);

  const hasFail =
    fieldResults.some((r) => r.status === "fail") ||
    warningResult.status === "fail";
  const hasWarning =
    fieldResults.some((r) => r.status === "warning") ||
    warningResult.status === "warning" ||
    extracted.imageQuality !== "good";

  const overallStatus = hasFail ? "rejected" : hasWarning ? "needs_review" : "approved";

  return {
    overallStatus,
    fields: fieldResults,
    governmentWarningResult: warningResult,
    imageQuality: extracted.imageQuality ?? "good",
    imageQualityNotes: extracted.imageQualityNotes ?? [],
    processingMs,
    sessionId,
  };
}
