/**
 * POST /api/verify/batch
 *
 * Accepts up to 20 label verification requests and processes them in parallel.
 * Each item is the same shape as the single /api/verify endpoint.
 *
 * Response: array of results in the same order as the request.
 * Items that fail extraction return an error string instead of a result.
 *
 * FISMA note: Same data handling as single verify — no persistence,
 * in-memory only, per-item sessionIds for audit trail.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { extractLabelFields } from "@/lib/extraction/labelExtractor";
import { runVerification } from "@/lib/validation/fieldValidator";
import type { VerifyRequest, VerificationResult } from "@/types/label";

const MAX_BATCH_SIZE = 300;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type BatchItemResult =
  | { success: true; result: VerificationResult }
  | { success: false; error: string; index: number };

async function processOne(
  item: VerifyRequest,
  index: number
): Promise<BatchItemResult> {
  const sessionId = randomUUID();
  const startMs = Date.now();

  if (!item.imageBase64 || !ALLOWED_MIME_TYPES.has(item.imageMimeType)) {
    return { success: false, error: "Invalid image.", index };
  }

  const estimatedBytes = (item.imageBase64.length * 3) / 4;
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return { success: false, error: "Image exceeds 5 MB limit.", index };
  }

  if (!item.applicationData?.brandName?.trim()) {
    return { success: false, error: "brandName is required.", index };
  }

  try {
    const extracted = await extractLabelFields(
      item.imageBase64,
      item.imageMimeType,
      item.applicationData.beverageType ?? "distilled_spirits"
    );
    const result = runVerification(
      item.applicationData,
      extracted,
      Date.now() - startMs,
      sessionId
    );
    return { success: true, result };
  } catch {
    return { success: false, error: "Extraction failed. Check image quality.", index };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let items: VerifyRequest[];

  try {
    items = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!Array.isArray(items)) {
    return NextResponse.json(
      { error: "Request body must be an array of verification items." },
      { status: 400 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Batch must contain at least one item." }, { status: 400 });
  }

  if (items.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} items.` },
      { status: 400 }
    );
  }

  // Process in chunks of 10 to avoid overwhelming the API and hitting
  // Vercel's request body/timeout limits with very large batches
  const CHUNK_SIZE = 10;
  const allResults: BatchItemResult[] = [];

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(chunk.map((item, j) => processOne(item, i + j)));
    allResults.push(...chunkResults);
  }

  return NextResponse.json(allResults);
}
