# Master's Project — Document Extraction Approaches Comparison

> **Goal:** Turn the existing React + Express app into a web application that
> compares **three** document‑extraction approaches on structured documents
> (receipts, invoices, ...) and produces thesis‑grade evidence.

The three approaches being compared:

1. **Classical** — object detection (YOLO / FRCNN) + OCR engines (EasyOCR / Tesseract).
2. **OCR‑free VLM** — a single Vision‑Language Model (Qwen) extracts fields directly.
3. **Hybrid** — object detection crops regions, then a VLM reads each region.

The Python comparison API already returns a unified response with
`main` (classical), `qwen` (VLM), `hybrid`, timings, and a
`recommended_for_production` hint.

---

## 0. Current state of the repo

- `api/` — Node.js + Express 5 + TypeORM + PostgreSQL, JWT auth, Swagger, multer uploads.
  - Entities: `User`, `Model`, `ModelFile`, `TestRun`.
  - Routes: `/api/auth`, `/api/detect`, `/api/models`, `/api/model-files`,
    `/api/test-runs`, `/api/download`.
  - Detection is proxied to a Python FastAPI service at `DETECTION_SERVICE_URL`.
- `react/` — CRA + Redux Toolkit + Ant Design + react-router 7.
  - Pages: `LoginPage`, `RegisterPage`, `DetectTabsPage`, `ModelsPage`,
    `ModelFilesPage`, `ResultsPage`.

What we will keep:
- Auth flow, Axios client, RequireAuth guard, AntD shell, upload helpers.

What we will repurpose/replace:
- `/detect` single‑model flow → `/compare` three‑approach flow.
- `ModelFile` / `TestRun` → `ComparisonRun` (primary) + optional `Benchmark`.
- `ModelsPage` stays but becomes secondary (classical pipeline config only).

---

## 1. Rename / pivot

- Rename `main` / `qwen` / `hybrid` → `classical` / `vlm` / `hybrid` in the UI
  (keep raw keys in stored JSON for traceability with the Python API).
- Primary nav becomes: **Compare · Runs · Benchmarks · Analytics · Models**.
- `Detect` page is removed (or hidden behind a dev flag).

---

## 2. Data model (backend)

### Storage strategy — disk first, DB lean

Large payloads (full Python API response, per‑approach result JSON, ground
truth, computed metrics, and the original image) are **persisted on disk**.
The database only stores small scalar fields + **relative paths** pointing
into the run folder. This keeps the DB small, makes backups trivial (copy
the folder), and lets you inspect artifacts with any file browser.

Folder layout on disk, rooted at `config.RUNS_BASE_PATH`:

```
<RUNS_BASE_PATH>/
  <runId>/
    image<ext>              # original uploaded image (name preserved via DB row)
    raw_response.json       # full unmodified response from the Python compare API
    classical.json          # response.main          (extracted for easy reads)
    vlm.json                # response.qwen
    hybrid.json             # response.hybrid
    ground_truth.json       # present once the user attaches GT
    metrics.json            # computed after GT is attached
```

A small helper `api/src/services/runStorage.ts` centralises path resolution
(`runDir(runId)`, `artifactPath(runId, name)`), atomic writes, and safe
reads (returns `null` when a file is missing).

### New entity: `ComparisonRun` (lean)

```ts
id              number (PK)
user            User (FK)
filename        string          // original uploaded filename (display only)
storageDir      string          // relative path under RUNS_BASE_PATH, e.g. "42"
imageName       string          // "image.jpg" — the file inside storageDir
imageW          number
imageH          number
device          number | string
documentType    string          // "receipt" | "invoice" | ...
timings         jsonb           // small: { classical, vlm, hybrid } in ms
recommended     string | null   // response.recommended_for_production
hasGroundTruth  boolean         // true when ground_truth.json exists (for fast filtering)
summary         jsonb | null    // small scoreboard for list view (accuracy per approach)
createdAt       Date
```

Rules:
- **Nothing large goes into the DB.** `rawResponse`, `classicalResult`,
  `vlmResult`, `hybridResult`, `groundTruth`, `metrics` all live as JSON
  files on disk.
- `timings` and `summary` are kept in the DB because they are tiny and
  drive the list/history UI and analytics queries.
- `hasGroundTruth` is a denormalized boolean so `GET /runs` can filter
  without touching the filesystem.
- Controllers load artifacts lazily from disk only when the detail view
  or metrics recomputation needs them.

### New entity: `DocumentType`

```ts
id         number (PK)
key        string (unique)      // "receipt"
name       string                // "Receipt"
schema     jsonb                 // declarative field schema (see §4)
createdAt  Date
```

Seed: one row for `receipt` matching the example response
(`DATE`, `FB`, `FD`, `SUM`, `ORDER[{NAME, PRICE, QUANTITY}]`).

### New entity: `Benchmark` (phase 2)

```ts
id          number (PK)
user        User (FK)
name        string
documentType string
storageDir  string               // relative path for batch artifacts (ground_truth.json, report.json, exports)
createdAt   Date
runs        ComparisonRun[] (OneToMany via benchmarkId column)
summaryPath string | null        // path to report.json on disk (aggregated metrics)
```

Large benchmark artifacts (uploaded ground‑truth map, per‑run detail,
aggregated report, LaTeX/CSV exports) also live on disk under
`<RUNS_BASE_PATH>/benchmarks/<benchmarkId>/` following the same principle.

### Kept entities

- `User` — unchanged.
- `Model` — kept; only relevant to the classical pipeline's YOLO/FRCNN weights.
- `ModelFile`, `TestRun` — **optional removal** after migration, or keep behind
  a legacy flag. See §9.

---

## 3. Backend routes

All under `/api`, all JWT‑protected unless stated.

### Comparison (new)
- `POST /compare` — multipart upload: `file`, `documentType`. Flow:
  1. Save the image to `<RUNS_BASE_PATH>/<runId>/image<ext>`.
  2. Call the Python compare API.
  3. Write `raw_response.json`, `classical.json`, `vlm.json`, `hybrid.json`
     to the run folder.
  4. Persist a lean `ComparisonRun` row with `timings`, `recommended`,
     `filename`, `storageDir`, `imageName`, `imageW/H`, `device`.
  5. Return the full response plus the new `runId`.
- `GET /runs` — list `ComparisonRun` (DB only, no disk reads) with filters:
  `search`, `documentType`, `dateFrom`, `dateTo`, `hasGroundTruth`,
  `limit`, `offset`. Each row carries its `summary` for quick rendering.
- `GET /runs/:id` — reads the DB row **and** the on‑disk artifacts
  (`raw_response.json`, `metrics.json` if present, `ground_truth.json` if
  present) and returns them merged.
- `GET /runs/:id/artifacts/:name` — stream a single artifact by name
  (`raw`, `classical`, `vlm`, `hybrid`, `ground-truth`, `metrics`). Useful
  for debugging and for the UI's "raw JSON" toggle.
- `DELETE /runs/:id` — removes the DB row **and** the whole `<runId>/` folder.
- `PUT /runs/:id/ground-truth` — writes `ground_truth.json` to disk,
  recomputes `metrics.json`, updates `hasGroundTruth` + `summary` in the DB.
- `GET /runs/:id/image` — streams the original image from disk (authenticated).

### Document types (new)
- `GET /document-types` · `POST /document-types` · `PUT /document-types/:id`.

### Benchmarks (phase 2)
- `POST /benchmarks` — create named benchmark.
- `POST /benchmarks/:id/items` — bulk upload zip of images (+optional GT map).
- `POST /benchmarks/:id/run` — kicks off processing; streams SSE progress.
- `GET /benchmarks/:id/report` — aggregated metrics (accuracy, CER, F1, p50/p95).

### Analytics (phase 3)
- `GET /analytics/summary?from=&to=&documentType=` — per‑approach aggregates
  for the dashboard charts.

### Kept
- `/auth/*`, `/models/*`, `/download/*`.

---

## 4. Field schema (per document type)

Declarative schema lets the UI render columns and lets the metrics library
compare values correctly.

```json
{
  "fields": [
    { "key": "DATE",  "label": "Date",   "type": "date",  "formats": ["DD.MM.YY", "DD.MM.YYYY"] },
    { "key": "FB",    "label": "FB",     "type": "text"  },
    { "key": "FD",    "label": "FD",     "type": "text"  },
    { "key": "SUM",   "label": "Sum",    "type": "money", "tolerance": 0.01 }
  ],
  "arrays": [
    {
      "key": "ORDER",
      "label": "Order lines",
      "rowKey": "NAME",
      "match": "hungarian",
      "fields": [
        { "key": "NAME",     "type": "text"  },
        { "key": "PRICE",    "type": "money", "tolerance": 0.01 },
        { "key": "QUANTITY", "type": "number" }
      ]
    }
  ]
}
```

Field types supported by metrics: `text`, `number`, `money`, `date`.

---

## 5. Metrics library

Single module `api/src/services/metrics.ts` used both by `POST /compare`
(when GT is present) and the benchmark runner.

Functions:

- `normalize(value, type, opts)` — lowercase/strip, parse numbers/dates.
- `fieldMatch(pred, gt, type, tolerance)` → `"exact" | "fuzzy" | "miss"`.
- `cer(a, b)` — Levenshtein / length(gt).
- `orderMatch(predRows, gtRows, schema)` — Hungarian assignment on `NAME`
  similarity, then per‑field scoring.
- `scoreRun(result, gt, schema)` → per‑field status + per‑approach summary.
- `aggregate(runs)` → precision / recall / F1 per field per approach,
  mean confidence, p50/p95 latency.

Outputs are stored on `ComparisonRun.metrics` so charts are cheap.

---

## 6. Frontend pages

### A. `ComparePage` (hero page)

Route: `/compare`.

Layout (4 columns, sticky left):

| Left | Col 1 Classical | Col 2 VLM | Col 3 Hybrid |
| ---- | --------------- | --------- | ------------ |
| Image + zoom + optional bbox overlay. Meta block (size, device). | Field table, confidence bar, time, raw JSON toggle. | Field table, confidence bar, time. | Field table + per‑field confidence, receipt/grouping confidence, time. |

Behaviour:
- Upload → `POST /compare` → renders three columns.
- **Diff highlighting**: green = all three agree, amber = two agree, red = all disagree, blue = matches ground truth (if provided).
- **Timing bar** at the top (horizontal stacked bar).
- **Recommended banner** using `response.recommended_for_production`.
- **ORDER tables** nested under each column (hybrid rows may include `ROW_Y`).
- Ground‑truth editor drawer: edit JSON → `PUT /runs/:id/ground-truth` → metrics refresh live.
- **Per‑field ensemble picker** — pick the winning value per field → "final JSON" preview (copy/download).
- Hotkeys: `1` / `2` / `3` to focus an approach column, `g` to open GT editor.

### B. `RunsPage` (history)

Route: `/runs`. Rebuild of `ModelFilesPage`.

- Columns: thumbnail, date, filename, document type, best approach, receipt
  confidence, GT status chip, actions.
- Filters: date range, search, document type, approach, `hasGroundTruth`.
- Pagination + CSV export (already wired in the old page).
- Row action: "Open in Compare".

### C. `BenchmarkPage` (phase 2)

Route: `/benchmarks` (list) and `/benchmarks/:id` (detail).

- Create benchmark → upload zip of images → optional `ground_truth.json`.
- Run button → SSE progress bar, cancel.
- Report tab: per‑approach aggregate table + exports (CSV, **LaTeX**).

### D. `AnalyticsPage` (phase 3)

Route: `/analytics`.

- Grouped bar: accuracy per field per approach.
- Box plot: latency per approach.
- Confusion‑style matrix: which approach caught which field.
- Confidence calibration curve (predicted vs empirical accuracy).
- Cost estimate: latency × $/GPU‑hour (configurable).

### E. `PresentationPage` (defense mode)

Route: `/demo/:runId`. No header, no menu. Clean 3‑column comparison for
screensharing. Shareable token (no login required) if opened with `?token=`.

### F. `ModelsPage`

Kept as‑is; relevant only to the classical pipeline's YOLO weights.

---

## 7. Redux slices (frontend)

- `comparisonSlice` — `currentRun`, `loading`, `error`, thunks:
  `runComparison`, `fetchRun`, `saveGroundTruth`.
- `runsSlice` — list + filters + pagination (clone of existing modelFilesSlice).
- `benchmarksSlice` — phase 2.
- `analyticsSlice` — phase 3.
- `documentTypesSlice` — fetched once on app load.

Keep `authSlice` and `modelsSlice` unchanged.

---

## 8. UI polish / "defense mode" touches

- Dark mode toggle (AntD v5 theme switch).
- Keyboard hotkeys (documented in a `?` overlay).
- Bounding‑box overlay on the image (if the Python API can return boxes).
- "Explain the difference" popover — shows raw OCR tokens vs raw VLM output
  so you can argue *why* an approach failed.
- Shareable public link for a single run (token‑gated, read‑only).
- Export to **LaTeX table** (ready to paste into thesis).

---

## 9. Migration plan

1. Add `RUNS_BASE_PATH` to `api/config/default.json` (e.g.
   `"D:/Master/service/application/api/tmp/runs"`). Create the folder if
   missing on boot.
2. Add new entities (`ComparisonRun`, `DocumentType`, later `Benchmark`)
   alongside existing ones — TypeORM `synchronize: true` handles creation.
3. Add `api/src/services/runStorage.ts` (path helpers + atomic read/write).
4. Seed one `DocumentType` row: `receipt` with the schema from §4.
5. Add `POST /compare` route + compare controller. Flow: save image to
   disk → call Python compare API → dump `raw_response.json` +
   `classical/vlm/hybrid.json` → insert a lean `ComparisonRun` row.
6. Build `ComparePage` consuming `POST /compare`.
7. Replace nav with Compare · Runs · Models.
8. Build `RunsPage` by cloning `ModelFilesPage` against `/runs`.
9. Ground‑truth editor + server‑side metrics (writes `ground_truth.json`
   and `metrics.json` to the run folder, refreshes `summary` +
   `hasGroundTruth` in the DB).
10. Benchmarks (phase 2).
11. Analytics (phase 3).
12. Presentation mode + exports (phase 4).
13. Decide whether to delete `ModelFile` / `TestRun` or keep them behind a
    legacy flag.

---

## 10. Suggested delivery order

- [ ] **Step 1** — backend: `ComparisonRun` + `DocumentType` entities, `POST /compare`, `GET /runs`, `GET /runs/:id`.
- [ ] **Step 2** — frontend: `ComparePage` (upload → 3‑column layout + diff highlighting + timing bar + recommended banner).
- [ ] **Step 3** — `RunsPage` + navigation rework.
- [ ] **Step 4** — ground‑truth editor + metrics library + per‑field diff against GT.
- [ ] **Step 5** — benchmarks (batch upload, SSE progress, aggregate report, LaTeX export).
- [ ] **Step 6** — analytics dashboard.
- [ ] **Step 7** — presentation mode, shareable links, bbox overlay, dark mode.

---

## 11. Open questions for you

1. **Python API endpoint + contract** — what URL and multipart field names does the compare API expect? (We'll wire `POST /compare` to it.)
2. **Document types** — just `receipt` for now, or do you also need `invoice`, `passport`, etc.?
3. **Auth** — keep JWT login (current behaviour) or allow anonymous demo access for the defense?
4. **Ground truth** — inline editing in the UI only, or also bulk import via JSON files?
5. **Benchmarks** — is a batch runner in scope for the thesis, or is single‑image comparison enough?
6. **Deployment** — local only (defense laptop) or also a hosted demo URL?
7. **Legacy `ModelFile` / `TestRun`** — drop them, or keep for backwards compatibility?
