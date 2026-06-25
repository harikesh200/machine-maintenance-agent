# Machine Maintenance Workflow Backend

Job-based TypeScript/Express backend converted from `Agentic_Manufacturing_singlebtn.ipynb`.

## Setup

```bash
bun install
copy .env.example .env
bun run dev
```

Set `OPENAI_API_KEY` in `.env`. SMTP credentials are intentionally provided per workflow request and are not written to disk.

Useful commands:

- `bun run dev` starts the API with Bun watch mode.
- `bun run start` starts through `src/bootstrap.ts`, matching the reference POC's hosted/Lambda temp-dir handling.
- `bun run typecheck` runs TypeScript validation.
- `bun run build` bundles the backend for Bun into `dist/server.js`.

## Source Layout

The backend follows the same high-level layout as `D:\Mail Automation POC`:

- `src/controllers`: HTTP request/response translation
- `src/routes`: route wiring only
- `src/schemas`: Zod request contracts
- `src/services`: workflow orchestration and external service clients
- `src/repositories`: local file-backed job persistence
- `src/types`: workflow domain and API types
- `src/utils`: shared CSV and filename helpers

## Create Workflow

```http
POST /v1/workflows
Content-Type: multipart/form-data
```

Fields:

- `machineLogs`: CSV file with `timestamp`, `machine_id`, `machine_name`, `error_code`
- `errorManual`: PDF file using the notebook's `Error Code: E###` manual format
- `vendorCatalog`: CSV file with `part_name`, `vendor`, `price`, `delivery_time`
- `senderEmail`: SMTP sender email
- `senderPassword`: SMTP sender password
- `vendorEmails`: JSON array string, mapped to generated invoice vendors in the same ordered style as the notebook
- `plantHeadEmail`: report recipient email

Response:

```json
{
  "data": {
    "id": "wf_...",
    "status": "queued",
    "currentStep": "queued",
    "progress": 0
  }
}
```

## Poll Workflow

```http
GET /v1/workflows/:id
```

Returns job status, progress, resolved vendor-email mapping, generated artifact names, and errors.

## Download Artifacts

```http
GET /v1/workflows/:id/artifacts/:name
```

Common artifact names:

- `agent1-output`
- `invoice-<vendor>`
- `tabular-summary`
- `text-summary`
