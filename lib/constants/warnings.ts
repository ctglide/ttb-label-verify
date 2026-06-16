/**
 * TTB Mandatory Government Warning Statement
 * Source: 27 CFR Part 16, Section 16.21
 * Effective: November 18, 1989 (Alcoholic Beverage Labeling Act of 1988)
 *
 * This text must appear EXACTLY as specified below.
 * "GOVERNMENT WARNING:" must be in bold and all caps.
 * The full statement must appear on all alcohol beverages containing
 * 0.5% or more alcohol by volume.
 */
export const GOVERNMENT_WARNING_TEXT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export const GOVERNMENT_WARNING_PREFIX = "GOVERNMENT WARNING:";

/**
 * Fields required on ALL alcohol beverage labels per TTB regulations.
 * Some fields have beverage-type-specific requirements (see 27 CFR 4, 5, 7).
 */
export const REQUIRED_FIELDS = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "producerAddress",
] as const;

/**
 * Minimum net content threshold for country of origin requirement (mL).
 * Imports must declare country of origin per 27 CFR 5.36(a).
 */
export const COO_REQUIRED_THRESHOLD_ML = 50;

/**
 * TTB-acceptable alcohol content format patterns.
 *
 * Note: "ABV" as an abbreviation is explicitly PROHIBITED for wine (27 CFR 4.36)
 * and malt beverages (27 CFR 7.65). Only "alc./vol.", "alc/vol", or
 * "alcohol by volume" are permitted. For distilled spirits (27 CFR 5.65),
 * "ABV" is not explicitly prohibited but the above forms are standard.
 *
 * Proof statements are optional for distilled spirits and not used for wine/malt.
 */
export const ABV_PATTERN =
  /(\d+(?:\.\d+)?)\s*%\s*(?:alc\.?\s*(?:\/\s*vol\.?|by\s+vol\.?)|alcohol\s+by\s+volume)/i;

export const ABV_PROHIBITED_ABBREVIATION = /(\d+(?:\.\d+)?)\s*%\s*abv\b/i;

export const PROOF_PATTERN = /\((\d+(?:\.\d+)?)\s*proof\)/i;

/**
 * ABV tolerances by beverage type and alcohol level (CFR-sourced).
 *
 * Distilled spirits: ±0.3% per 27 CFR 5.65
 * Malt beverages:   ±0.3% per 27 CFR 7.65
 * Wine under 14%:   ±1.5% per 27 CFR 4.36
 * Wine over 14%:    ±1.0% per 27 CFR 4.36
 */
export const ABV_TOLERANCES = {
  distilled_spirits: 0.3,
  malt_beverage: 0.3,
  wine_under_14: 1.5,
  wine_over_14: 1.0,
} as const;

/**
 * Wine ABV statement rules (27 CFR 4.36):
 * - Under 7% ABV: out of TTB jurisdiction (FDA regulates). Tool cannot validate.
 * - 7–14% ABV:    Optional IF class/type is "table wine" or "light wine".
 *                 Required otherwise.
 * - Over 14% ABV: Always mandatory.
 *
 * "Table Wine" serving as class/type designation threshold per 27 CFR 4.36(a).
 */
export const WINE_TABLE_WINE_DESIGNATIONS = ["table wine", "light wine"] as const;
export const WINE_MANDATORY_ABV_THRESHOLD = 14.0;
export const WINE_TTB_JURISDICTION_MINIMUM = 7.0;

/**
 * Malt beverage ABV rules (27 CFR 7.65):
 * ABV is mandatory ONLY when the product contains alcohol derived from added
 * flavors or non-beverage ingredients (other than hops extract).
 * Otherwise it is optional — agent must verify via application notes.
 *
 * Allergen labeling: TTB issued proposed rulemaking Jan 2025 (Notice No. 232)
 * that would mandate allergen disclosures. As of April 2026 this has NOT been
 * enacted as a binding legal requirement. Tool does not enforce allergen checks.
 * Monitor ttb.gov for final rule publication.
 */
export const MALT_BEVERAGE_ABV_MANDATORY_NOTE =
  "For malt beverages, ABV is only mandatory when the product contains alcohol " +
  "from added flavors or non-beverage ingredients (27 CFR 7.65). " +
  "Verify with application notes whether ABV statement is required for this product.";
