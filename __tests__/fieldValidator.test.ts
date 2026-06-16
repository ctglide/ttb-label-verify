/**
 * Unit tests for fieldValidator.ts
 * Pure functions — no API calls, no mocking required.
 */

import { validateGovernmentWarning, runVerification } from "@/lib/validation/fieldValidator";
import { GOVERNMENT_WARNING_TEXT } from "@/lib/constants/warnings";
import type { ApplicationData, ExtractedLabelData, ExtractedField } from "@/types/label";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function field(
  value: string | null,
  confidence: ExtractedField["confidence"] = "high",
  confidenceNote: string | null = null
): ExtractedField {
  return { value, confidence, confidenceNote };
}

const BASE_EXTRACTED: ExtractedLabelData = {
  brandName: field("OLD TOM DISTILLERY"),
  classType: field("Kentucky Straight Bourbon Whiskey"),
  alcoholContent: field("45% Alc./Vol. (90 Proof)"),
  netContents: field("750 mL"),
  producerName: field("Old Tom Distillery LLC"),
  producerAddress: field("Louisville, KY 40202"),
  countryOfOrigin: field(null),
  governmentWarning: field(GOVERNMENT_WARNING_TEXT),
  imageQuality: "good",
  imageQualityNotes: [],
};

const BASE_APP_DATA: ApplicationData = {
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  producerName: "Old Tom Distillery LLC",
  producerAddress: "Louisville, KY 40202",
  countryOfOrigin: "",
  beverageType: "distilled_spirits",
};

// ---------------------------------------------------------------------------
// Government warning
// ---------------------------------------------------------------------------

describe("validateGovernmentWarning", () => {
  test("passes on exact match", () => {
    expect(validateGovernmentWarning(field(GOVERNMENT_WARNING_TEXT)).status).toBe("pass");
  });

  test("passes when whitespace differs", () => {
    const withExtraSpaces = GOVERNMENT_WARNING_TEXT.replace(/\s+/g, "  ");
    expect(validateGovernmentWarning(field(withExtraSpaces)).status).toBe("pass");
  });

  test("fails on title case prefix (Jenny Park scenario)", () => {
    const titleCase = GOVERNMENT_WARNING_TEXT.replace("GOVERNMENT WARNING:", "Government Warning:");
    const result = validateGovernmentWarning(field(titleCase));
    expect(result.status).toBe("fail");
    expect(result.note).toMatch(/all caps/i);
  });

  test("fails when body text is altered", () => {
    const altered = GOVERNMENT_WARNING_TEXT.replace("Surgeon General", "surgeon general");
    expect(validateGovernmentWarning(field(altered)).status).toBe("fail");
  });

  test("fails when null", () => {
    const result = validateGovernmentWarning(null);
    expect(result.status).toBe("fail");
    expect(result.note).toMatch(/mandatory/i);
  });

  test("fails when truncated", () => {
    expect(validateGovernmentWarning(field("GOVERNMENT WARNING: (1) According to the Surgeon General")).status).toBe("fail");
  });

  test("passes confidence through to result", () => {
    const result = validateGovernmentWarning(field(GOVERNMENT_WARNING_TEXT, "low", "Text very small"));
    expect(result.confidence).toBe("low");
    expect(result.confidenceNote).toBe("Text very small");
  });
});

// ---------------------------------------------------------------------------
// Overall status
// ---------------------------------------------------------------------------

describe("runVerification — overall status", () => {
  test("approved when all fields match", () => {
    expect(runVerification(BASE_APP_DATA, BASE_EXTRACTED, 1200, "s1").overallStatus).toBe("approved");
  });

  test("rejected on brand name mismatch", () => {
    const extracted = { ...BASE_EXTRACTED, brandName: field("WRONG BRAND") };
    expect(runVerification(BASE_APP_DATA, extracted, 1200, "s1").overallStatus).toBe("rejected");
  });

  test("rejected when government warning missing", () => {
    const extracted = { ...BASE_EXTRACTED, governmentWarning: field(null) };
    expect(runVerification(BASE_APP_DATA, extracted, 1200, "s1").overallStatus).toBe("rejected");
  });

  test("needs_review on case-only mismatch (Dave Morrison scenario)", () => {
    const appData = { ...BASE_APP_DATA, brandName: "STONE'S THROW" };
    const extracted = { ...BASE_EXTRACTED, brandName: field("Stone's Throw") };
    const result = runVerification(appData, extracted, 1200, "s1");
    expect(result.overallStatus).toBe("needs_review");
    expect(result.fields.find((f) => f.field === "brandName")?.status).toBe("warning");
  });

  test("needs_review when image quality is degraded", () => {
    const extracted = { ...BASE_EXTRACTED, imageQuality: "degraded" as const, imageQualityNotes: ["Glare"] };
    expect(runVerification(BASE_APP_DATA, extracted, 1200, "s1").overallStatus).toBe("needs_review");
  });

  test("needs_review when field matches but confidence is low", () => {
    const extracted = { ...BASE_EXTRACTED, brandName: field("OLD TOM DISTILLERY", "low", "Decorative font") };
    const result = runVerification(BASE_APP_DATA, extracted, 1200, "s1");
    expect(result.overallStatus).toBe("needs_review");
    expect(result.fields.find((f) => f.field === "brandName")?.status).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// ABV — distilled spirits (±0.3% per 27 CFR 5.65)
// ---------------------------------------------------------------------------

describe("ABV — distilled spirits", () => {
  test("passes on exact match", () => {
    const extracted = { ...BASE_EXTRACTED, alcoholContent: field("45% Alc./Vol. (90 Proof)") };
    const f = runVerification(BASE_APP_DATA, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("pass");
  });

  test("passes despite format difference when ABV matches", () => {
    const extracted = { ...BASE_EXTRACTED, alcoholContent: field("45% alcohol by volume") };
    const f = runVerification(BASE_APP_DATA, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("pass");
  });

  test("warns when within tolerance (e.g. 44.9% vs 45%)", () => {
    const appData = { ...BASE_APP_DATA, alcoholContent: "45% Alc./Vol." };
    const extracted = { ...BASE_EXTRACTED, alcoholContent: field("44.8% Alc./Vol.") };
    const f = runVerification(appData, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("warning");
    expect(f?.note).toMatch(/tolerance/i);
  });

  test("fails when outside ±0.3% tolerance", () => {
    const extracted = { ...BASE_EXTRACTED, alcoholContent: field("40% Alc./Vol.") };
    const f = runVerification(BASE_APP_DATA, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("fail");
  });

  test("warns on unrecognized ABV format", () => {
    const extracted = { ...BASE_EXTRACTED, alcoholContent: field("forty-five percent") };
    const f = runVerification(BASE_APP_DATA, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// ABV — wine rules (27 CFR 4.36)
// ---------------------------------------------------------------------------

describe("ABV — wine", () => {
  const wineBase: ApplicationData = {
    ...BASE_APP_DATA,
    beverageType: "wine",
    classType: "Cabernet Sauvignon",
    alcoholContent: "13.5% Alc. by Vol.",
  };
  const wineExtracted: ExtractedLabelData = {
    ...BASE_EXTRACTED,
    classType: field("Cabernet Sauvignon"),
    alcoholContent: field("13.5% Alc. by Vol."),
  };

  test("passes for wine within ±1.5% tolerance (under 14%)", () => {
    const extracted = { ...wineExtracted, alcoholContent: field("12.5% Alc. by Vol.") };
    const f = runVerification(wineBase, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    // 13.5 vs 12.5 = 1.0 difference, within 1.5% tolerance
    expect(f?.status).toBe("warning"); // within tolerance = warning not fail
    expect(f?.note).toMatch(/tolerance/i);
  });

  test("fails for wine outside ±1.5% tolerance (under 14%)", () => {
    const extracted = { ...wineExtracted, alcoholContent: field("11.5% Alc. by Vol.") };
    const f = runVerification(wineBase, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    // 13.5 vs 11.5 = 2.0 difference, outside 1.5% tolerance
    expect(f?.status).toBe("fail");
  });

  test("passes for wine over 14% within ±1.0% tolerance", () => {
    const appData = { ...wineBase, classType: "Port", alcoholContent: "18.5% Alc. by Vol." };
    const extracted = { ...wineExtracted, classType: field("Port"), alcoholContent: field("18.0% Alc. by Vol.") };
    const f = runVerification(appData, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    // 18.5 vs 18.0 = 0.5 difference, within 1.0% tolerance
    expect(f?.status).toBe("warning");
    expect(f?.note).toMatch(/tolerance/i);
  });

  test("passes when table wine ABV is absent and class is 'Table Wine'", () => {
    const appData = { ...wineBase, classType: "Table Wine", alcoholContent: "12% Alc. by Vol." };
    const extracted = { ...wineExtracted, classType: field("Table Wine"), alcoholContent: field(null) };
    const f = runVerification(appData, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("pass");
    expect(f?.note).toMatch(/optional/i);
  });

  test("warns when wine is under 7% (FDA jurisdiction)", () => {
    const appData = { ...wineBase, alcoholContent: "5% Alc. by Vol." };
    const extracted = { ...wineExtracted, alcoholContent: field("5% Alc. by Vol.") };
    const f = runVerification(appData, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("warning");
    expect(f?.note).toMatch(/FDA/i);
  });

  test("fails when wine label uses prohibited ABV abbreviation", () => {
    const extracted = { ...wineExtracted, alcoholContent: field("13.5% ABV") };
    const f = runVerification(wineBase, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("fail");
    expect(f?.note).toMatch(/prohibited/i);
  });
});

// ---------------------------------------------------------------------------
// ABV — malt beverage (27 CFR 7.65)
// ---------------------------------------------------------------------------

describe("ABV — malt beverage", () => {
  const maltBase: ApplicationData = {
    ...BASE_APP_DATA,
    beverageType: "malt_beverage",
    classType: "Ale",
    alcoholContent: "5.2% Alc./Vol.",
  };
  const maltExtracted: ExtractedLabelData = {
    ...BASE_EXTRACTED,
    classType: field("Ale"),
    alcoholContent: field("5.2% Alc./Vol."),
  };

  test("passes within ±0.3% tolerance", () => {
    const extracted = { ...maltExtracted, alcoholContent: field("5.4% Alc./Vol.") };
    const f = runVerification(maltBase, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("warning"); // within tolerance
    expect(f?.note).toMatch(/tolerance/i);
  });

  test("fails outside ±0.3% tolerance", () => {
    const extracted = { ...maltExtracted, alcoholContent: field("6.0% Alc./Vol.") };
    const f = runVerification(maltBase, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("fail");
  });

  test("fails when malt beverage label uses prohibited ABV abbreviation", () => {
    const extracted = { ...maltExtracted, alcoholContent: field("5.2% ABV") };
    const f = runVerification(maltBase, extracted, 1200, "s1").fields.find((f) => f.field === "alcoholContent");
    expect(f?.status).toBe("fail");
    expect(f?.note).toMatch(/prohibited/i);
  });
});

// ---------------------------------------------------------------------------
// Optional fields
// ---------------------------------------------------------------------------

describe("Optional fields", () => {
  test("skips country of origin when not in application", () => {
    const result = runVerification(BASE_APP_DATA, BASE_EXTRACTED, 1200, "s1");
    expect(result.fields.find((f) => f.field === "countryOfOrigin")).toBeUndefined();
  });

  test("checks country of origin when provided", () => {
    const appData = { ...BASE_APP_DATA, countryOfOrigin: "Scotland" };
    const extracted = { ...BASE_EXTRACTED, countryOfOrigin: field("Scotland") };
    const f = runVerification(appData, extracted, 1200, "s1").fields.find((f) => f.field === "countryOfOrigin");
    expect(f?.status).toBe("pass");
  });

  test("fails country of origin mismatch", () => {
    const appData = { ...BASE_APP_DATA, countryOfOrigin: "Scotland" };
    const extracted = { ...BASE_EXTRACTED, countryOfOrigin: field("Ireland") };
    const f = runVerification(appData, extracted, 1200, "s1").fields.find((f) => f.field === "countryOfOrigin");
    expect(f?.status).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// Image quality
// ---------------------------------------------------------------------------

describe("Image quality", () => {
  test("passes image quality notes through", () => {
    const extracted = { ...BASE_EXTRACTED, imageQuality: "degraded" as const, imageQualityNotes: ["Glare on lower third"] };
    const result = runVerification(BASE_APP_DATA, extracted, 1200, "s1");
    expect(result.imageQuality).toBe("degraded");
    expect(result.imageQualityNotes).toContain("Glare on lower third");
  });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe("Result shape", () => {
  test("includes sessionId and processingMs", () => {
    const result = runVerification(BASE_APP_DATA, BASE_EXTRACTED, 1500, "abc-123");
    expect(result.sessionId).toBe("abc-123");
    expect(result.processingMs).toBe(1500);
  });

  test("every field has required properties including confidence", () => {
    const result = runVerification(BASE_APP_DATA, BASE_EXTRACTED, 1200, "test");
    for (const f of result.fields) {
      expect(f).toHaveProperty("field");
      expect(f).toHaveProperty("label");
      expect(f).toHaveProperty("applicationValue");
      expect(f).toHaveProperty("status");
      expect(f).toHaveProperty("note");
      expect(f).toHaveProperty("confidence");
    }
  });
});
