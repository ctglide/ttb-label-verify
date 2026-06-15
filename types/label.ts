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

export interface ExtractedLabelData {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null;
  netContents: string | null;
  producerName: string | null;
  producerAddress: string | null;
  countryOfOrigin: string | null;
  governmentWarning: string | null;
  extractionNotes: string[];
}

export type FieldStatus = "pass" | "fail" | "warning" | "not_checked";

export interface FieldResult {
  field: string;
  label: string;
  applicationValue: string;
  extractedValue: string | null;
  status: FieldStatus;
  note: string;
}

export interface VerificationResult {
  overallStatus: "approved" | "rejected" | "needs_review";
  fields: FieldResult[];
  governmentWarningResult: {
    status: FieldStatus;
    extracted: string | null;
    note: string;
  };
  processingMs: number;
  sessionId: string;
}

export interface VerifyRequest {
  applicationData: ApplicationData;
  imageBase64: string;
  imageMimeType: string;
}
