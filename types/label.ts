// TTB label field types aligned with 27 CFR Part 4, 5, and 7 requirements

export type BeverageType = "distilled_spirits" | "wine" | "malt_beverage";

export interface ApplicationData {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  producerName: string;
  producerAddress: string;
  countryOfOrigin: string;
  beverageType: BeverageType;
}

export type FieldConfidence = "high" | "medium" | "low";

export interface ExtractedField {
  value: string | null;
  confidence: FieldConfidence;
  confidenceNote: string | null; // e.g. "Text partially obscured by glare"
}

export interface ExtractedLabelData {
  brandName: ExtractedField;
  classType: ExtractedField;
  alcoholContent: ExtractedField;
  netContents: ExtractedField;
  producerName: ExtractedField;
  producerAddress: ExtractedField;
  countryOfOrigin: ExtractedField;
  governmentWarning: ExtractedField;
  imageQuality: "good" | "degraded" | "poor";
  imageQualityNotes: string[]; // surface to agent: glare, angle, fading, etc.
}

export type FieldStatus = "pass" | "fail" | "warning" | "not_checked";

export interface FieldResult {
  field: string;
  label: string;
  applicationValue: string;
  extractedValue: string | null;
  confidence: FieldConfidence;
  confidenceNote: string | null;
  status: FieldStatus;
  note: string;
  // Set by agent after manual review
  agentOverride?: {
    decision: "accepted" | "rejected";
    correctedValue?: string; // if agent manually edited the extracted value
    reason: string;
    timestamp: string;
  };
}

export interface VerificationResult {
  overallStatus: "approved" | "rejected" | "needs_review";
  fields: FieldResult[];
  governmentWarningResult: {
    status: FieldStatus;
    extracted: string | null;
    confidence: FieldConfidence;
    confidenceNote: string | null;
    note: string;
    agentOverride?: {
      decision: "accepted" | "rejected";
      reason: string;
      timestamp: string;
    };
  };
  imageQuality: "good" | "degraded" | "poor";
  imageQualityNotes: string[];
  processingMs: number;
  sessionId: string;
}

export interface VerifyRequest {
  applicationData: ApplicationData;
  imageBase64: string;
  imageMimeType: string;
  /** Pre-confirmed extracted data from the extract step. If provided, verify skips re-extraction. */
  extractedData?: ExtractedLabelData;
}
