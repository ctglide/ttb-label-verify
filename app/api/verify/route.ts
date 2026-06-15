/**
 * POST /api/verify
 *
 * Accepts a label image (base64) and application data, returns verification
 * results. All Claude API calls happen here — the API key never reaches
 * the browser.
 *
 * FISMA note: No request data is persisted. Images are processed in-memory
 * only. sessionId is generated per-request for audit trail support.
 * In a production FedRAMP deployment, audit records would be written to a
 * compliant logging service here.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { extractLabelFields } from "@/lib/extraction/labelExtractor";
import { runVerification } from "@/lib/validation/fieldValidator";
import type { VerifyRequest } from "@/types/label";

// Max image size: 5MB (base64 encoded = ~6.7MB string)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessionId = randomUUID();
  const startMs = Date.now();

  let body: VerifyRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  // --- Input validation ---
  const { applicationData, imageBase64, imageMimeType } = body;

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json(
      { error: "imageBase64 is required." },
      { status: 400 }
    );
  }

  if (!imageMimeType || !ALLOWED_MIME_TYPES.has(imageMimeType)) {
    return NextResponse.json(
      {
        error: `Unsupported image type. Accepted: ${[...ALLOWED_MIME_TYPES].join(", ")}.`,
      },
      { status: 400 }
    );
  }

  // Rough size check on base64 string
  const estimatedBytes = (imageBase64.length * 3) / 4;
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image exceeds 5MB limit. Please upload a smaller file." },
      { status: 413 }
    );
  }

  if (!applicationData || typeof applicationData !== "object") {
    return NextResponse.json(
      { error: "applicationData is required." },
      { status: 400 }
    );
  }

  if (!applicationData.brandName?.trim()) {
    return NextResponse.json(
      { error: "applicationData.brandName is required." },
      { status: 400 }
    );
  }

  // --- Extraction ---
  let extracted;
  try {
    extracted = await extractLabelFields(
      imageBase64,
      imageMimeType,
      applicationData.beverageType ?? "distilled_spirits"
    );
  } catch (err) {
    console.error(`[${sessionId}] Extraction error:`, err);
    return NextResponse.json(
      {
        error:
          "Label extraction failed. Check image quality and try again.",
      },
      { status: 502 }
    );
  }

  const processingMs = Date.now() - startMs;

  // --- Validation ---
  const result = runVerification(
    applicationData,
    extracted,
    processingMs,
    sessionId
  );

  // Production note: write audit record here (sessionId, timestamp,
  // overallStatus, field statuses) to FedRAMP-compliant logging.

  return NextResponse.json(result);
}
