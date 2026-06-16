# TTB Label Verification Tool

AI-powered alcohol beverage label verification prototype for the TTB Compliance Division.

## What it does

Agents upload front and back label images. The tool extracts regulated fields from the label using Claude Vision, compares them against the COLA application data, and returns a structured pass/fail/review result per field — including strict government warning statement validation per 27 CFR 16.21.

Agents can review extracted fields before verification runs, record override decisions on flagged fields, and finalize an approval or rejection once all fields have been reviewed.

---

## Setup

### Prerequisites

- Node.js 18+
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

### Install

```bash
git clone <repo-url>
cd ttb-label-verify
npm install
```

### Environment

Copy `.env.example` to `.env.local` and add your API key:

```bash
cp .env.example .env.local
```

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
npm start
```

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Import it at [vercel.com/new](https://vercel.com/new)
3. Add `ANTHROPIC_API_KEY` under **Settings → Environment Variables**
4. Deploy — Vercel provides the public URL

> **Note:** Vercel hobby plan has a 10s serverless function timeout. Extraction targets 2–4s with the current model. If timeouts occur under load, upgrade to Vercel Pro (60s timeout, no cold starts).

---

## Architecture

```
/types/label.ts                    Shared TypeScript types
/lib/constants/warnings.ts         Regulatory constants (gov warning, CFR refs, ABV patterns)
/lib/validation/fieldValidator.ts  Pure comparison logic — testable in isolation
/lib/extraction/labelExtractor.ts  Claude Vision API call — server-side only
/app/api/extract/route.ts          POST endpoint — extracts fields from image only
/app/api/verify/route.ts           POST endpoint — validates pre-extracted data against application
/app/api/verify/batch/route.ts     POST endpoint — batch verification (up to 300 labels)
/components/
  LabelUpload.tsx                  Drag-and-drop image upload
  ApplicationForm.tsx              COLA application data entry
  VerificationResult.tsx           Field-by-field results with override controls
/app/page.tsx                      Main page / state orchestration
```

---

## Workflow

1. **Upload front label** — fields extract automatically using Claude Vision (`claude-haiku-4-5`)
2. **Upload back label** (optional) — re-extracts and merges; best confidence per field wins
3. **Review extracted fields** — agent corrects any errors; confidence dots indicate reliability
4. **Verify Label** — pre-confirmed extracted data is sent to `/api/verify` alongside application data. No second vision call is made.
5. **Review results** — per-field pass/fail/review with agent override controls
6. **Finalize** — once all flagged fields have agent decisions recorded, approve or reject the label

---

## Approach

**Extraction:** `claude-haiku-4-5` reads the label image and returns structured JSON with all regulated TTB fields. Haiku is used for extraction speed (targets 2–4s); the structured read task does not require Sonnet-level reasoning. The prompt instructs the model to transcribe field values exactly as they appear and to infer `USA` as country of origin when the producer address contains a US state name or abbreviation.

**Two-step API design:** `/api/extract` runs vision extraction only. `/api/verify` accepts the already-confirmed extracted data and runs validation only — no second vision call. This prevents verification from producing different (worse) results than the initial extraction the agent reviewed.

**Validation:** A pure TypeScript validation layer (no AI) compares extracted values against application data:

- **Exact or case-insensitive match** → Pass. TTB does not restrict body text casing; all-caps label text is permitted.
- **Spacing difference only** → Warning (agent review recommended)
- **Substantive mismatch** → Fail
- **ABV:** Numeric value extracted before comparison to handle format variation, including pipe-separated formats (`53.5% ALC BY VOL | 107 PROOF`)
- **Government warning:** Validated against statutory text (27 CFR 16.21). `GOVERNMENT WARNING:` prefix must appear in all caps. Body text in all caps is permitted.

**Agent override flow:** Fields with fail or warning status show "Record agent decision" controls. The agent selects Accept or Reject and enters a reason. The overall status banner updates dynamically as decisions are recorded. Once all flagged fields are resolved, Finalize buttons appear to lock in the final decision.

**Country of origin inference:** If no explicit country is on the label but the producer address contains a US state name or abbreviation (e.g. "Frankfort, Kentucky"), the tool infers `USA` automatically.

---

## Tools used

- **Next.js 15** (App Router) — full-stack framework, server routes keep API key server-side
- **TypeScript** — end-to-end type safety
- **Tailwind CSS** — utility styling
- **Anthropic Claude Haiku** (`claude-haiku-4-5`) — vision extraction (fast, cost-efficient)
- **Vercel** — deployment

---

## FISMA / Security considerations

This is a prototype. The following decisions were made with federal security posture in mind:

| Concern | Decision |
|---|---|
| API key exposure | All Anthropic calls happen in server-side API routes. The key is never sent to the browser. |
| Data persistence | **No label images or application data are stored or logged.** Processing is stateless and in-memory only. |
| PII handling | No PII is persisted. Session IDs are ephemeral UUIDs generated per request. |
| Audit trail | `sessionId` + `overallStatus` + field results returned in response. Production deployment would write to FedRAMP-compliant logging (marked in code). |
| HTTPS | Enforced by Vercel by default. |
| Input validation | Image type, size (5 MB max), and required fields validated server-side before API call. |
| Third-party analytics | None. No data leaves the app except to `api.anthropic.com`. |
| Network restrictions | Only outbound dependency is `api.anthropic.com`. |

For production: FedRAMP-authorized hosting, formal ATO process, RBAC, and integration with TTB audit logging infrastructure would be required.

### Network requirement

This prototype makes outbound calls to `api.anthropic.com` (port 443/HTTPS). This is the **only** external dependency. If your network restricts outbound traffic, this domain will need to be allowlisted.

---

## API Reference

### POST /api/extract

Extract fields from a label image only — no comparison. Used to auto-populate the review form.

**Request body:**
```json
{
  "imageBase64": "<base64-encoded image>",
  "imageMimeType": "image/jpeg",
  "beverageType": "distilled_spirits | wine | malt_beverage"
}
```

**Response body:** `ExtractedLabelData` — all regulated fields with value, confidence, and confidenceNote per field.

---

### POST /api/verify

Validate pre-extracted label data against COLA application data. Skips re-extraction if `extractedData` is provided.

**Request body:**
```json
{
  "applicationData": {
    "brandName": "OLD TOM DISTILLERY",
    "classType": "Kentucky Straight Bourbon Whiskey",
    "alcoholContent": "45% Alc./Vol. (90 Proof)",
    "netContents": "750 mL",
    "producerName": "Old Tom Distillery LLC",
    "producerAddress": "Louisville, KY 40202",
    "countryOfOrigin": "USA",
    "beverageType": "distilled_spirits"
  },
  "imageBase64": "<base64-encoded image>",
  "imageMimeType": "image/jpeg",
  "extractedData": { ... }
}
```

> If `extractedData` is provided, `imageBase64` and `imageMimeType` are optional — no vision call is made.

**Response body:**
```json
{
  "overallStatus": "approved | rejected | needs_review",
  "sessionId": "uuid",
  "processingMs": 44,
  "fields": [
    {
      "field": "brandName",
      "label": "Brand Name",
      "applicationValue": "OLD TOM DISTILLERY",
      "extractedValue": "OLD TOM DISTILLERY",
      "status": "pass | fail | warning | not_checked",
      "note": "Match (casing-insensitive — TTB permits all-caps label text)."
    }
  ],
  "governmentWarningResult": {
    "status": "pass | fail | warning",
    "extracted": "<text found on label>",
    "note": "Government warning text matches required statement."
  }
}
```

**Example .NET call:**
```csharp
using var client = new HttpClient();
var response = await client.PostAsJsonAsync(
    "https://your-app.vercel.app/api/verify",
    new { applicationData, imageBase64, imageMimeType, extractedData }
);
var result = await response.Content.ReadFromJsonAsync<VerificationResult>();
```

---

### POST /api/verify/batch

Verify up to 300 labels in a single request. Processed in parallel chunks of 10.

**Request body:**
```json
[
  { "applicationData": { ... }, "imageBase64": "...", "imageMimeType": "image/jpeg" },
  { "applicationData": { ... }, "imageBase64": "...", "imageMimeType": "image/png" }
]
```

**Response body:**
```json
[
  { "success": true, "result": { ... } },
  { "success": false, "error": "Extraction failed. Check image quality.", "index": 1 }
]
```

Results are returned in the same order as the request. Failed items include an `error` string and do not affect other items in the batch.

---

## Assumptions and limitations

- **Image quality:** Extraction quality depends on label readability. Glare or extreme angles reduce accuracy; surfaced as confidence notes per field.
- **Bold detection:** `GOVERNMENT WARNING:` must appear bold per 27 CFR 16.21. The tool checks casing (enforceable via text); bold weight requires agent visual confirmation.
- **COLA integration:** Standalone prototype. Live COLA integration is out of scope.
- **Performance:** Targets under 5s for extraction on Vercel. Cold starts on the hobby plan may add 2–3s. Upgrade to Vercel Pro to eliminate cold starts if needed.

---

## CFR compliance notes

### ABV tolerances (enforced)
- Distilled spirits: ±0.3% per 27 CFR 5.65
- Malt beverages: ±0.3% per 27 CFR 7.65
- Wine under 14% ABV: ±1.5% per 27 CFR 4.36
- Wine over 14% ABV: ±1.0% per 27 CFR 4.36

Values within tolerance return `needs_review` so agents can confirm.

### Wine ABV exceptions (enforced)
- Wine under 7% ABV: outside TTB jurisdiction (FDA regulates). Tool flags and skips validation.
- Wine 7–14% ABV labeled "Table Wine" or "Light Wine": ABV statement is optional per 27 CFR 4.36(a).
- Wine over 14% ABV: ABV statement is mandatory.

### "ABV" abbreviation (enforced)
Explicitly prohibited for wine (27 CFR 4.36) and malt beverages (27 CFR 7.65). Hard fail.

### Malt beverage ABV (enforced as conditional)
Only mandatory when the product contains alcohol from added flavors or non-beverage ingredients (27 CFR 7.65). Tool surfaces a review note directing the agent to verify via application notes.

### Allergen labeling (not enforced — monitoring required)
TTB published proposed rulemaking in January 2025 (Notice No. 232) that would mandate allergen disclosures. As of April 2026, **this has not been enacted as a binding legal requirement**. Monitor [ttb.gov](https://www.ttb.gov) for final rule publication.
