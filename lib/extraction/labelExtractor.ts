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

const EXTRACTION_SYSTEM_PROMPT = `You are a TTB (Alcohol and Tobacco Tax and Trade Bureau) label data extraction assistant.
Your sole job is to read an alcohol beverage label image and extract specific regulated fields.
Return ONLY a valid JSON object. No preamble, no explanation, no markdown fences.

Extract these fields exactly as they appear on the label:
- brandName: The brand name of the product
- classType: The class and type designation (e.g., "Kentucky Straight Bourbon Whiskey")
- alcoholContent: The full alcohol content string as printed (e.g., "45% Alc./Vol. (90 Proof)")
- netContents: Net contents as printed (e.g., "750 mL")
- producerName: Name of bottler, producer, or importer
- producerAddress: Full address of bottler/producer/importer
- countryOfOrigin: Country of origin if stated (null if not present)
- governmentWarning: The complete government warning statement, character-for-character as it appears

For any field you cannot read or is not present, return null.
Add any extraction caveats (image quality, partial occlusion, ambiguity) to the extractionNotes array.

Return format:
{
  "brandName": string | null,
  "classType": string | null,
  "alcoholContent": string | null,
  "netContents": string | null,
  "producerName": string | null,
  "producerAddress": string | null,
  "countryOfOrigin": string | null,
  "governmentWarning": string | null,
  "extractionNotes": string[]
}`;

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
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
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

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from extraction model.");
  }

  // Strip any accidental markdown fences before parsing
  const raw = textBlock.text.replace(/```(?:json)?/g, "").trim();

  let parsed: ExtractedLabelData;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Extraction model returned non-JSON response: ${raw.slice(0, 200)}`
    );
  }

  // Ensure extractionNotes is always an array
  if (!Array.isArray(parsed.extractionNotes)) {
    parsed.extractionNotes = [];
  }

  return parsed;
}
