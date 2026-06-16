# TTB Label Verification Tool

AI-powered alcohol beverage label verification prototype for the TTB Compliance Division.

## What it does

Agents upload a label image and enter the corresponding COLA application data. The tool extracts regulated fields from the label using Claude Vision, compares them against the application, and returns a structured pass/fail/review result per field — including strict government warning statement validation per 27 CFR 16.21.

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

---

## Architecture

```
/types/label.ts                    Shared TypeScript types
/lib/constants/warnings.ts         Regulatory constants (gov warning, CFR refs)
/lib/validation/fieldValidator.ts  Pure comparison logic — testable in isolation
/lib/extraction/labelExtractor.ts  Claude Vision API call — server-side only
/app/api/verify/route.ts           POST endpoint — API key never reaches browser
/components/
  LabelUpload.tsx                  Drag-and-drop image upload
  ApplicationForm.tsx              COLA application data entry
  VerificationResult.tsx           Field-by-field results display
/app/page.tsx                      Main page / state orchestration
```

---

## Approach

**Extraction:** Claude Vision reads the label image and returns structured JSON with all regulated TTB fields (brand name, class/type, ABV, net contents, producer info, country of origin, government warning). The prompt instructs the model to transcribe field values exactly as they appear — no interpretation.

**Validation:** A pure TypeScript validation layer (no AI involved) compares extracted values against application data:

- **Exact match** → Pass
- **Case/whitespace difference only** → Warning (agent review recommended, per Dave Morrison's "STONE'S THROW" example from stakeholder notes)
- **Substantive mismatch** → Fail
- **ABV:** Numeric value extracted from both strings before comparison to handle format variation
- **Government warning:** Strict character-level validation against statutory text (27 CFR 16.21). Casing errors on "GOVERNMENT WARNING:" are a hard fail.

**Performance:** Single API call per verification. Claude Sonnet returns results in 2–4 seconds for standard label images, meeting the ~5 second requirement.

---

## Tools used

- **Next.js 15** (App Router) — full-stack framework, server routes keep API key server-side
- **TypeScript** — end-to-end type safety
- **Tailwind CSS** — utility styling
- **Anthropic Claude Sonnet** (`claude-sonnet-4-6`) — vision extraction
- **Vercel** — deployment

---

## FISMA / Security considerations

This is a prototype. The following decisions were made with federal security posture in mind:

| Concern | Decision |
|---|---|
| API key exposure | All Anthropic calls happen in `/app/api/verify/route.ts` (server-side). The key is never sent to the browser. |
| Data persistence | **No label images or application data are stored or logged.** Processing is stateless and in-memory only. |
| PII handling | No PII is persisted. Session IDs are ephemeral UUIDs generated per request. |
| Audit trail | `sessionId` + `overallStatus` + field results returned in response. Production deployment would write to FedRAMP-compliant logging (marked in code). |
| HTTPS | Enforced by Vercel by default. |
| Input validation | Image type, size (5 MB max), and required fields validated server-side before API call. |
| Third-party analytics | None. No data leaves the app except to `api.anthropic.com`. |
| Network restrictions | Only outbound dependency is `api.anthropic.com`. |

For production: FedRAMP-authorized hosting, formal ATO process, RBAC, and integration with TTB audit logging infrastructure would be required.

### Network requirement

This prototype makes outbound calls to `api.anthropic.com` (port 443/HTTPS). This is the **only** external dependency — no analytics, no CDN, no other third-party endpoints. If your network restricts outbound traffic, this domain will need to be allowlisted for the tool to function.

---

## API Reference

The verification logic is exposed as a standard REST API returning JSON. Any HTTP client can call it — including .NET applications via `HttpClient`. This makes future integration with COLA or other internal systems straightforward without changes to this codebase.

### POST /api/verify

Verify a single label against application data.

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
    "countryOfOrigin": "",
    "beverageType": "distilled_spirits"
  },
  "imageBase64": "<base64-encoded image>",
  "imageMimeType": "image/jpeg"
}
```

**Response body:**
```json
{
  "overallStatus": "approved | rejected | needs_review",
  "sessionId": "uuid",
  "processingMs": 2341,
  "fields": [
    {
      "field": "brandName",
      "label": "Brand Name",
      "applicationValue": "OLD TOM DISTILLERY",
      "extractedValue": "OLD TOM DISTILLERY",
      "status": "pass | fail | warning | not_checked",
      "note": "Exact match."
    }
  ],
  "governmentWarningResult": {
    "status": "pass | fail | warning",
    "extracted": "<text found on label>",
    "note": "Government warning matches required text exactly."
  }
}
```

**Example .NET call:**
```csharp
using var client = new HttpClient();
var response = await client.PostAsJsonAsync(
    "https://your-app.vercel.app/api/verify",
    new { applicationData, imageBase64, imageMimeType }
);
var result = await response.Content.ReadFromJsonAsync<VerificationResult>();
```

---

### POST /api/verify/batch

Verify up to 300 labels in a single request. Request body is an array of the same shape as the single verify endpoint. Processed in parallel chunks of 10.

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

**Example .NET call:**
```csharp
using var client = new HttpClient();
var response = await client.PostAsJsonAsync(
    "https://your-app.vercel.app/api/verify/batch",
    payloadArray
);
var results = await response.Content.ReadFromJsonAsync<BatchResult[]>();
```

---

## Assumptions and limitations

- **Image quality:** Extraction quality depends on label readability. Glare or extreme angles may reduce accuracy; surfaced as `extractionNotes`.
- **Batch upload:** Not in this prototype. The stateless architecture supports it — a batch endpoint would call extraction/validation in parallel per label.
- **Bold detection:** Government warning "GOVERNMENT WARNING:" must appear bold. The tool checks casing (enforceable); bold weight requires agent visual confirmation.
- **COLA integration:** Standalone prototype per Marcus Williams' IT notes. Live COLA integration is out of scope.

## CFR compliance notes

### ABV tolerances (enforced)
- Distilled spirits: ±0.3% per 27 CFR 5.65
- Malt beverages: ±0.3% per 27 CFR 7.65
- Wine under 14% ABV: ±1.5% per 27 CFR 4.36
- Wine over 14% ABV: ±1.0% per 27 CFR 4.36

Values within tolerance return `needs_review` (not `rejected`) so agents can confirm.

### Wine ABV exceptions (enforced)
- Wine under 7% ABV: outside TTB jurisdiction (FDA regulates per FAA Act). Tool flags and skips validation.
- Wine 7–14% ABV labeled "Table Wine" or "Light Wine": ABV statement is optional per 27 CFR 4.36(a). Tool passes if ABV is absent and class/type matches.
- Wine over 14% ABV: ABV statement is mandatory.

### "ABV" abbreviation (enforced)
The abbreviation "ABV" is explicitly prohibited for wine (27 CFR 4.36) and malt beverages (27 CFR 7.65). The tool flags this as a hard fail.

### Malt beverage ABV (enforced as conditional)
ABV is only mandatory for malt beverages when the product contains alcohol from added flavors or non-beverage ingredients (27 CFR 7.65). The tool surfaces a review note when ABV is absent, directing the agent to verify via application notes.

### Allergen labeling (not enforced — monitoring required)
TTB published proposed rulemaking in January 2025 (Notice No. 232) that would mandate allergen disclosures on labels for malt beverages, most wine, and all distilled spirits. As of April 2026, **this has not been enacted as a binding legal requirement**. The tool does not enforce allergen checks. Monitor [ttb.gov](https://www.ttb.gov) for final rule publication.
