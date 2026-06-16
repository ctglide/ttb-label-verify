/**
 * POST /api/verify/batch
 *
 * Accepts up to 150 label pairs (front + back image each).
 * Files are paired sequentially: pair 1 = files[0]+files[1], pair 2 = files[2]+files[3], etc.
 * Each pair is extracted (front and back merged) then verified.
 *
 * Request body: array of pair objects, max 150.
 * FISMA: no data persisted, stateless, in-memory only.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { extractLabelFields } from "@/lib/extraction/labelExtractor";
import { runVerification } from "@/lib/validation/fieldValidator";
import type { VerificationResult, ExtractedLabelData, BeverageType } from "@/types/label";

const MAX_PAIRS = 150; // 150 pairs = up to 300 images
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface BatchPairRequest {
  frontImage: { base64: string; mimeType: string; fileName: string };
  backImage?: { base64: string; mimeType: string; fileName: string } | null;
  beverageType?: BeverageType;
}

type PairResult =
  | { success: true; result: VerificationResult; pairIndex: number }
  | { success: false; error: string; pairIndex: number; frontFileName: string; backFileName?: string };

function mergeExtracted(front: ExtractedLabelData, back: ExtractedLabelData): ExtractedLabelData {
  // Prefer non-null values; for fields present on both, prefer higher confidence
  const mergeField = (
    f: ExtractedLabelData[keyof ExtractedLabelData],
    b: ExtractedLabelData[keyof ExtractedLabelData]
  ) => {
    if (!f || typeof f !== "object" || !("value" in f)) return b;
    if (!b || typeof b !== "object" || !("value" in b)) return f;
    const fField = f as { value: string | null; confidence: string };
    const bField = b as { value: string | null; confidence: string };
    if (!fField.value) return b;
    if (!bField.value) return f;
    const order = { high: 0, medium: 1, low: 2 };
    return (order[fField.confidence as keyof typeof order] ?? 2) <=
      (order[bField.confidence as keyof typeof order] ?? 2)
      ? f
      : b;
  };

  return {
    brandName: mergeField(front.brandName, back.brandName) as ExtractedLabelData["brandName"],
    classType: mergeField(front.classType, back.classType) as ExtractedLabelData["classType"],
    alcoholContent: mergeField(front.alcoholContent, back.alcoholContent) as ExtractedLabelData["alcoholContent"],
    netContents: mergeField(front.netContents, back.netContents) as ExtractedLabelData["netContents"],
    producerName: mergeField(front.producerName, back.producerName) as ExtractedLabelData["producerName"],
    producerAddress: mergeField(front.producerAddress, back.producerAddress) as ExtractedLabelData["producerAddress"],
    countryOfOrigin: mergeField(front.countryOfOrigin, back.countryOfOrigin) as ExtractedLabelData["countryOfOrigin"],
    // Government warning is always on back — prefer back
    governmentWarning: back.governmentWarning?.value
      ? back.governmentWarning
      : front.governmentWarning,
    imageQuality: front.imageQuality === "poor" || back.imageQuality === "poor"
      ? "poor"
      : front.imageQuality === "degraded" || back.imageQuality === "degraded"
      ? "degraded"
      : "good",
    imageQualityNotes: [...(front.imageQualityNotes ?? []), ...(back.imageQualityNotes ?? [])],
  };
}

async function processPair(pair: BatchPairRequest, pairIndex: number): Promise<PairResult> {
  const sessionId = randomUUID();
  const startMs = Date.now();
  const beverageType = pair.beverageType ?? "distilled_spirits";

  // Validate front image
  if (!pair.frontImage?.base64 || !ALLOWED_MIME_TYPES.has(pair.frontImage.mimeType)) {
    return { success: false, error: "Invalid front image.", pairIndex, frontFileName: pair.frontImage?.fileName ?? "unknown" };
  }
  if ((pair.frontImage.base64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return { success: false, error: "Front image exceeds 5 MB.", pairIndex, frontFileName: pair.frontImage.fileName };
  }

  try {
    const frontExtracted = await extractLabelFields(pair.frontImage.base64, pair.frontImage.mimeType, beverageType);

    let merged = frontExtracted;

    // Extract back if provided
    if (pair.backImage?.base64) {
      if (!ALLOWED_MIME_TYPES.has(pair.backImage.mimeType)) {
        return { success: false, error: "Invalid back image.", pairIndex, frontFileName: pair.frontImage.fileName, backFileName: pair.backImage.fileName };
      }
      const backExtracted = await extractLabelFields(pair.backImage.base64, pair.backImage.mimeType, beverageType);
      merged = mergeExtracted(frontExtracted, backExtracted);
    }

    // Build application data from merged extraction
    const applicationData = {
      brandName: merged.brandName?.value ?? "",
      classType: merged.classType?.value ?? "",
      alcoholContent: merged.alcoholContent?.value ?? "",
      netContents: merged.netContents?.value ?? "",
      producerName: merged.producerName?.value ?? "",
      producerAddress: merged.producerAddress?.value ?? "",
      countryOfOrigin: merged.countryOfOrigin?.value ?? "",
      beverageType,
    };

    const result = runVerification(applicationData, merged, Date.now() - startMs, sessionId);
    return { success: true, result, pairIndex };
  } catch {
    return {
      success: false,
      error: "Extraction failed. Check image quality.",
      pairIndex,
      frontFileName: pair.frontImage.fileName,
      backFileName: pair.backImage?.fileName,
    };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let pairs: BatchPairRequest[];
  try {
    pairs = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!Array.isArray(pairs) || pairs.length === 0) {
    return NextResponse.json({ error: "Request body must be a non-empty array of label pairs." }, { status: 400 });
  }

  if (pairs.length > MAX_PAIRS) {
    return NextResponse.json({ error: `Batch exceeds maximum of ${MAX_PAIRS} pairs (${MAX_PAIRS * 2} images).` }, { status: 400 });
  }

  const CHUNK_SIZE = 5; // pairs per chunk (each pair = 2 API calls)
  const allResults: PairResult[] = [];

  for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
    const chunk = pairs.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(chunk.map((pair, j) => processPair(pair, i + j)));
    allResults.push(...chunkResults);
  }

  return NextResponse.json(allResults);
}
