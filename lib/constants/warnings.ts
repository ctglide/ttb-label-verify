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
 * Must state ABV as a percentage; proof optional for distilled spirits.
 */
export const ABV_PATTERN = /(\d+(?:\.\d+)?)\s*%\s*(?:alc\.?\/vol\.?|alcohol by volume)/i;
export const PROOF_PATTERN = /\((\d+(?:\.\d+)?)\s*proof\)/i;
