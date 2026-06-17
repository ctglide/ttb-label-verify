/**
 * Label field extraction using Claude Vision.
 * This module runs SERVER-SIDE ONLY. The Anthropic API key never reaches
 * the client. Images are processed in-memory and not persisted.
 *
 * FISMA note: No label image data is stored or logged. Processing is
 * stateless. Audit trail (sessionId + result) is caller's responsibility.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedLabelData, BeverageType } from "../../types/label";
import { getValidatedApiKey, redactApiKey } from "../config/apiKey";

const EXTRACTION_SYSTEM_PROMPT = `You are a TTB (Alcohol and Tobacco Tax and Trade Bureau) label data extraction assistant.
Your sole job is to read an alcohol beverage label image and extract specific regulated fields.
For countryOfOrigin: if the label shows no explicit country but the producer address contains a US state name or abbreviation (e.g. "Kentucky", "KY", "Tennessee", "TX"), set value to "USA" with high confidence and note "Inferred from US address".\n\nReturn ONLY a valid JSON object. No preamble, no explanation, no markdown fences.

For each field, extract the value exactly as it appears and rate your confidence:
- "high": text is clear, unambiguous, fully readable
- "medium": text is readable but partially obscured, small, stylized, or at a mild angle
- "low": text is barely readable due to glare, fading, damage, extreme angle, or decorative fonts

Also assess overall image quality:
- "good": label is clearly photographed, all areas readable
- "degraded": some areas difficult to read (glare, angle, shadows, fading)
- "poor": significant portions unreadable, results may be unreliable

Return format (all fields required):
{
  "brandName": { "value": string | null, "confidence": "high"|"medium"|"low", "confidenceNote": string | null },
  "classType": { "value": string | null, "confidence": "high"|"medium"|"low", "confidenceNote": string | null },
  "alcoholContent": { "value": string | null, "confidence": "high"|"medium"|"low", "confidenceNote": string | null },
  "netContents": { "value": string | null, "confidence": "high"|"medium"|"low", "confidenceNote": string | null },
  "producerName": { "value": string | null, "confidence": "high"|"medium"|"low", "confidenceNote": string | null },
  "producerAddress": { "value": string | null, "confidence": "high"|"medium"|"low", "confidenceNote": string | null },
  "countryOfOrigin": { "value": string | null, "confidence": "high"|"medium"|"low", "confidenceNote": string | null },
  "governmentWarning": { "value": string | null, "confidence": "high"|"medium"|"low", "confidenceNote": string | null },
  "imageQuality": "good"|"degraded"|"poor",
  "imageQualityNotes": string[]
}

confidenceNote should explain WHY confidence is medium or low (e.g. "Text rendered in decorative script font", "Partial glare obscures last two digits", "Label photographed at angle"). Set to null for high confidence fields.`;

function buildUserPrompt(beverageType: BeverageType): string {
  const typeNote =
    beverageType === "distilled_spirits"
      ? "This is a distilled spirits label. Proof statement may accompany ABV."
      : beverageType === "wine"
      ? "This is a wine label. ABV may be optional for some categories under 7% or over 14%."
      : "This is a malt beverage/beer label. ABV statement requirements vary by state.";

  return `Extract all regulated TTB label fields from this image. ${typeNote} Return only the JSON object.`;
}

export async function extractLabelFields(
  imageBase64: string,
  imageMimeType: string,
  beverageType: BeverageType
): Promise<ExtractedLabelData> {
  const apiKey = getValidatedApiKey();
  const client = new Anthropic({ apiKey });

  let response;
  try {
    response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1500,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageMimeType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: buildUserPrompt(beverageType),
          },
        ],
      },
    ],
  });
  } catch (err: unknown) {
    // Sanitize Anthropic SDK errors — they can include request metadata.
    // Never surface raw API errors to the caller; log a redacted version only.
    const redacted = redactApiKey(apiKey);
    const message = err instanceof Error ? err.message : String(err);
    // Strip any accidental key leakage from the error message before logging.
    const sanitized = message.replace(apiKey, redacted);
    console.error(`[extraction] Anthropic API error (key ${redacted}): ${sanitized}`);
    throw new Error("Label extraction failed. Check image quality and try again.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from extraction model.");
  }

  const raw = textBlock.text.replace(/```(?:json)?/g, "").trim();

  let parsed: ExtractedLabelData;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Extraction model returned non-JSON response: ${raw.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed.imageQualityNotes)) {
    parsed.imageQualityNotes = [];
  }

  return parsed;
}
