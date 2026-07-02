# Machine Maintenance Workflow API

Job-based machine-maintenance automation built with Bun, TypeScript, and
Express. The service converts the workflow from
`Agentic_Manufacturing_singlebtn.ipynb` into a streaming HTTP API that:

1. analyzes machine-log errors against a PDF maintenance manual;
2. matches recommended replacement parts to a vendor catalog;
3. creates one purchase-order CSV per matched vendor;
4. sends purchase orders through Gmail SMTP;
5. generates executive narrative with OpenAI;
6. renders a two-page plant-head PDF; and
7. emails the executive report to the plant head.

Uploads, intermediate CSVs, invoices, and the executive PDF are processed in
memory and released after email delivery. Compact job status remains in memory
for a limited period so clients can recover state after a stream disconnects.

## Prerequisites

- [Bun](https://bun.sh/) 1.3.14 or later
- An OpenAI API key
- Gmail SMTP sender credentials for email delivery

The API can be used directly or with the companion React operations console.

## Quick Start

Install dependencies and create the local environment file:

```powershell
bun install
Copy-Item .env.example .env
```

Set `OPENAI_API_KEY` in `.env`, then start the development server:

```powershell
bun run dev
```

The API listens on `http://localhost:3000` by default.

| URL | Purpose |
| --- | --- |
| `http://localhost:3000/health` | Liveness check |
| `http://localhost:3000/ready` | Readiness check |
| `http://localhost:3000/v1/workflows` | Workflow API |

The root URL intentionally returns `404`; this project exposes an API rather
than a web page.

### Optional Frontend

If `Training Workflows Frontend` is checked out beside this repository, start
it in a second terminal:

```powershell
Set-Location "..\Training Workflows Frontend"
corepack enable
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The frontend uses
`http://localhost:3000` by default; set `VITE_API_BASE_URL` in its
`.env.local` file to target a different API.

## Environment

Configuration is loaded from `.env` and validated when the process starts.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | — | API key used to generate executive-report narrative |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model passed to the Responses API |
| `JOB_RETENTION_MS` | No | `1800000` | Time completed and failed job status remains available in memory |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `CORS_ORIGIN` | No | `http://localhost:5173,http://localhost:3000` | Comma-separated allowed origins, or `*` |

SMTP credentials are supplied with each workflow request. The password is
held only for the running workflow and is not written to job storage.

## Commands

| Command | Description |
| --- | --- |
| `bun run dev` | Start the API in watch mode |
| `bun run start` | Start through `src/bootstrap.ts`, including AWS Lambda temporary-directory setup |
| `bun run typecheck` | Run strict TypeScript checks |
| `bun run test` | Run the Bun test suite; succeeds when no tests exist |
| `bun run build` | Bundle the API to `dist/server.js` |
| `bun dist/server.js` | Run the generated bundle |

## Workflow Inputs

`POST /v1/workflows` accepts `multipart/form-data`. Each uploaded file is
limited to 10 MiB.

| Field | Type | Requirement |
| --- | --- | --- |
| `machineLogs` | File | CSV with `timestamp`, `machine_id`, `machine_name`, and `error_code` |
| `errorManual` | File | PDF containing the error-manual format described below |
| `vendorCatalog` | File | CSV with `part_name`, `vendor`, `delivery_time`, and numeric `price` |
| `senderEmail` | Text | Gmail SMTP sender address |
| `senderPassword` | Text | SMTP password or app password |
| `vendorEmails` | Text | JSON array of valid email addresses |
| `plantHeadEmail` | Text | Final report recipient |

CSV headers are trimmed and matched case-insensitively. Extra columns are
ignored.

### Machine Logs

```csv
timestamp,machine_id,machine_name,error_code
10-02-2025 07:22,PLT1-Z3-FEEDER-30,Feed Mechanism,E108
10-02-2025 09:51,PLT1-Z3-PRESS-44,Hydraulic Press,None
```

Rows with an empty error code or `None` are skipped.

### Error Manual

The PDF text must contain blocks in this format:

```text
Error Code: E108
1) Error Description: ...
2) Possible Causes: a) ... b) ...
3) Recommended Part Replacement: a) ... b) ...
4) Severity: High
```

Error codes must use the `E` followed by digits format. Recommended part names
are matched case-sensitively to the vendor catalog after whitespace and hyphen
normalization.

### Vendor Catalog

```csv
part_name,vendor,delivery_time,price
Feeder Motor Coupling 12B,VendorA,2 days,4333
Feeder Motor Coupling 12B,VendorB,3 days,4199
```

Generated invoice vendors are sorted alphabetically. `vendorEmails` is mapped
to that sorted list by position, so the first email belongs to the first
vendor, the second email to the second vendor, and so on. Missing addresses
produce a `no_email_configured` status; extra addresses are unused.

## API

Successful JSON responses and workflow events use a `{ "data": ... }`
envelope. Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

### Create a Workflow

```http
POST /v1/workflows
Content-Type: multipart/form-data
```

Example:

```bash
curl -N -X POST http://localhost:3000/v1/workflows \
  -H "Accept: text/event-stream" \
  -F "machineLogs=@machine_logs.csv" \
  -F "errorManual=@error_manual.pdf" \
  -F "vendorCatalog=@vendor_catalog.csv" \
  -F "senderEmail=sender@gmail.com" \
  -F "senderPassword=app-password" \
  -F 'vendorEmails=["vendor-a@example.com","vendor-b@example.com"]' \
  -F "plantHeadEmail=plant-head@example.com"
```

The API returns `200 OK` with `Content-Type: text/event-stream`. It sends each
persisted workflow state as a named Server-Sent Event and closes the stream
after a terminal event. An abridged stream looks like:

```text
: connected

event: progress
data: {"data":{"id":"wf_8b9f8c4a-...","status":"queued","currentStep":"queued","progress":0}}

event: progress
data: {"data":{"id":"wf_8b9f8c4a-...","status":"running","currentStep":"log_analysis","progress":20}}

event: completed
data: {"data":{"id":"wf_8b9f8c4a-...","status":"succeeded","currentStep":"completed","progress":100}}
```

| Event | Workflow state |
| --- | --- |
| `progress` | Queued or running |
| `completed` | Succeeded |
| `failed` | Failed |

The stream also sends a `: keep-alive` comment every 15 seconds. A workflow
failure uses the normal `{ "data": ... }` payload with status `failed`; an
unexpected stream failure uses an `{ "error": ... }` payload.

### Get Workflow Status

```http
GET /v1/workflows/:id
```

Use this endpoint to recover the latest persisted state after a stream
disconnects. The response contains status, progress, vendor-email mappings,
timestamps, and any terminal error:

```json
{
  "data": {
    "id": "wf_8b9f8c4a-...",
    "status": "succeeded",
    "currentStep": "completed",
    "progress": 100,
    "senderEmail": "sender@gmail.com",
    "vendorEmailList": ["vendor-a@example.com"],
    "resolvedVendorEmails": {
      "VendorA": "vendor-a@example.com"
    },
    "plantHeadEmail": "plant-head@example.com",
    "error": null,
    "createdAt": "2026-06-29T10:00:00.000Z",
    "updatedAt": "2026-06-29T10:00:05.000Z",
    "completedAt": "2026-06-29T10:00:05.000Z"
  }
}
```

Workflow statuses are `queued`, `running`, `succeeded`, and `failed`.
Running jobs progress through:

1. `uploads_saved`
2. `log_analysis`
3. `purchase_orders`
4. `vendor_emails`
5. `summary_report`
6. `plant_head_email`

Vendor email failures are recorded in the summary but do not stop the
workflow. A failed OpenAI summary or plant-head email marks the job as
`failed`.

## In-Memory Lifecycle

- Multer holds the three uploaded files in memory.
- CSV parsing, invoice generation, and PDF rendering use buffers.
- Nodemailer sends invoice and executive-report buffers directly.
- File buffers are released when the workflow finishes.
- Completed and failed status remains available for `JOB_RETENTION_MS`.
- The API does not expose artifact download endpoints.

No runtime `data/` directory is created or used. Job status and active file
buffers are lost if the backend process restarts. The in-memory repository is
intended for a single backend instance; shared durable infrastructure is
required for horizontal scaling or restart recovery.

## Project Structure

```text
src/
├── config/          # Validated environment configuration
├── controllers/     # HTTP request and response translation
├── http/            # Validation, errors, request logging, and SSE
├── repositories/    # Expiring in-memory workflow status
├── routes/          # Express route wiring
├── schemas/         # Zod request contracts
├── services/        # Workflow stages and external service adapters
├── types/           # Domain and workflow-state types
└── utils/           # In-memory CSV and workflow helpers
```

`src/app.ts` composes the Express application, `src/server.ts` creates
dependencies and starts the listener, and `src/bootstrap.ts` configures
temporary paths before loading the server in AWS Lambda environments.
