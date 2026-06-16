/**
 * POST /api/extract
 *
 * Accepts a label image and returns extracted fields only — no comparison.
 * Used to auto-populate the review form on upload.
 *
 * FISMA note: No image data is persisted. Stateless, in-memory only.
 */

import { NextRequest, NextResponse } from "next/server";
import { extractLabelFields } from "@/lib/extraction/labelExtractor";
import type { BeverageType } from "@/types/label";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { imageBase64: string; imageMimeType: string; beverageType?: BeverageType };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { imageBase64, imageMimeType, beverageType = "distilled_spirits" } = body;

  if (!imageBase64 || !ALLOWED_MIME_TYPES.has(imageMimeType)) {
    return NextResponse.json({ error: "Invalid or missing image." }, { status: 400 });
  }

  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image exceeds 5 MB limit." }, { status: 413 });
  }

  try {
    const extracted = await extractLabelFields(imageBase64, imageMimeType, beverageType);
    return NextResponse.json(extracted);
  } catch (err) {
    console.error("Extraction error:", err);
    return NextResponse.json(
      { error: "Extraction failed. Check image quality and try again." },
      { status: 502 }
    );
  }
}
