# Stages Simplification Plan

> **Goal:** Keep all 8 stages as scaffolding, but trim expensive/flashy
> features out of each so the final app is a **simple, effective master
> project demo**. Fold a legacy cleanup pass into stages 1 and 3 so the
> final app contains only **Auth + Models (classical weights) + Compare +
> Runs + light metrics/benchmark/analytics**.
>
> The 8 `stages/STAGE_*.md` files will be edited in place to match this
> simpler scope. No new stage files are added; no stage is removed.

---

## Guiding principle

Every feature that is **evidence for the thesis** stays.
Every feature that is **polish, streaming, or CI** gets cut or replaced with
the simplest equivalent.

---

## Todo tracker

- [ ] **Stage 0** — drop optional smoke-test script section only
- [ ] **Stage 1** — add `1.x Legacy backend cleanup` (delete ModelFile/TestRun entities, detect/files/tests routes+controllers, fix 500->404)
- [ ] **Stage 2** — remove hotkey mentions (hotkeys belong to Stage 7, which is itself trimmed)
- [ ] **Stage 3** — add `3.x Legacy frontend cleanup` (delete `DetectTabsPage`, `ModelFilesPage`, `ResultsPage`, `modelFiles` slice, stale `routes.js`; rewrite `App.js` nav)
- [ ] **Stage 4** — leave intact (core thesis evidence); only prune DoD bullets that reference removed Stage 7 polish
- [ ] **Stage 5** — remove SSE + cancel + LaTeX; replace streaming with client polling; keep zip upload, sequential worker, aggregate report, CSV
- [ ] **Stage 6** — keep KPIs + one per-field accuracy bar chart; remove calibration chart, stylized boxplot, benchmark filter
- [ ] **Stage 7** — keep share-token + public read-only run + `PresentationPage` + query-token image auth; remove bbox overlay, dark mode, hotkeys, JSON tree
- [ ] **Stage 8** — keep `metrics.test.ts` + 404/error handler + prod build/static serve + `run.ps1` + README; remove supertest suite, test DB, e2e, `ErrorBoundary`, `run.sh`
- [ ] **Index** — update `stages/README.md` progress tracker/descriptions; verify no cross-stage references dangle

---

## Per-stage scope

### Stage 0 — [`stages/STAGE_00_setup_and_storage.md`](stages/STAGE_00_setup_and_storage.md)

Already minimal. Keep as-is.

- Drop the optional smoke-test script section (§0.6) to shorten the file.

### Stage 1 — [`stages/STAGE_01_backend_core.md`](stages/STAGE_01_backend_core.md)

Keep the whole stage and **add a new section `1.x Legacy backend cleanup`** that removes everything the new design no longer needs:

- Delete entities: [`api/src/entities/ModelFile.ts`](api/src/entities/ModelFile.ts), [`api/src/entities/TestRun.ts`](api/src/entities/TestRun.ts).
- Delete controllers: `fileController.ts`, `testController.ts`, `detectController.ts`.
- Delete routes: `files.ts`, `tests.ts`, `detect.ts`.
- Remove their mounts from [`api/src/routes/index.ts`](api/src/routes/index.ts) (keep `/auth`, `/models`, `/download`, plus the new `/compare`, `/runs`, `/document-types`).
- Fix the 500-on-not-found middleware at the bottom of `routes/index.ts` (it currently returns 500 with text "Not found"; make it a proper 404).

**Keeps:** `DocumentType` + `ComparisonRun` entities, `receipt` seed, `POST /compare`, `GET/DELETE /runs`, `GET /runs/:id/artifacts/:name`, `GET /runs/:id/image`.

### Stage 2 — [`stages/STAGE_02_frontend_compare_page.md`](stages/STAGE_02_frontend_compare_page.md)

Keep. Only defer/cut the nice-to-haves that belong to polish:

- Move hotkeys (`1` / `2` / `3` / `g`) into Stage 7 and remove any mention from Stage 2.
- Keep 3-column layout, `TimingBar`, `RecommendedBanner`, `FieldCell` agreement coloring, `ORDER` nested tables, ground-truth drawer stub (written for real in Stage 4), schema-driven field rendering.

### Stage 3 — [`stages/STAGE_03_runs_history_page.md`](stages/STAGE_03_runs_history_page.md)

Keep, and **add a section `3.x Legacy frontend cleanup`**:

- Delete pages: `DetectTabsPage.jsx`, `ModelFilesPage.jsx`, `ResultsPage.jsx`.
- Delete feature slice folder: `react/src/features/modelFiles/`.
- Delete the stale [`react/src/routes.js`](react/src/routes.js) (it imports a non-existent `UploadPage`).
- Rewrite [`react/src/App.js`](react/src/App.js) nav to **Compare · Runs · Models** and default route to `/compare`.

**Keeps:** `RunsPage` (filters, pagination, thumbnails via `GET /runs/:id/image`), `RunDetailPage` that reuses the 3-column layout in read-only mode, `runsSlice`.

### Stage 4 — [`stages/STAGE_04_ground_truth_and_metrics.md`](stages/STAGE_04_ground_truth_and_metrics.md)

Keep — this is the thesis-grade evidence. No trimming. Ensure:

- `metrics.ts` keeps Hungarian `orderMatch` (it's what makes ORDER comparison defensible).
- GT drawer can stay as a JSON textarea (no JSON tree widget).
- `PUT /runs/:id/ground-truth` writes `ground_truth.json` + recomputes `metrics.json` + refreshes `hasGroundTruth` + `summary` in DB.

### Stage 5 — [`stages/STAGE_05_benchmarks.md`](stages/STAGE_05_benchmarks.md) (heaviest trim)

Keep the stage file, but drop the fireworks:

- **Remove SSE:** delete `GET /api/benchmarks/:id/stream`, the `benchmarkWorker` subscriber plumbing, and the "Live events" panel in `BenchmarkDetailPage`. Replace with **client polling** every 2–3 s of `GET /api/benchmarks/:id` while status is `running`.
- **Remove LaTeX export** (`GET .../export/latex`, `reportExport.latex`, nav button). Keep **CSV export only**.
- **Remove cancel** button + `POST .../cancel` route + in-memory cancel token.
- Keep: `Benchmark` entity, `ComparisonRun.benchmarkId`, zip upload (`adm-zip`), sequential worker, aggregated `report.json`, per-item table, CSV export.

### Stage 6 — [`stages/STAGE_06_analytics.md`](stages/STAGE_06_analytics.md)

Keep as a single small dashboard. Trim to:

- Keep: `GET /api/analytics/summary`, KPIs (runs count, mean per-field accuracy per approach, mean latency per approach), and **one** grouped bar chart (per-field accuracy per approach).
- **Remove:** confidence calibration curve + its bin computation in `analytics.ts`, the stylized "box plot" (the stage file itself admits it isn't a real boxplot), the `benchmarkId` filter.

### Stage 7 — [`stages/STAGE_07_polish.md`](stages/STAGE_07_polish.md) (heaviest trim)

Reduce to just what matters for the defense day:

- Keep: share-token → public read-only `GET /api/public/runs/:id` + `.../image`, `PresentationPage` at `/demo/:id?token=...` (no chrome), query-token image loading so thumbnails/public views don't 401.
- **Remove:** bounding-box overlay (depends on Python returning boxes), dark-mode toggle + `uiSlice`, hotkeys + help modal, `react-json-view-lite` raw-JSON viewer.

### Stage 8 — [`stages/STAGE_08_testing_and_deployment.md`](stages/STAGE_08_testing_and_deployment.md)

Reduce to one defensible test + one production boot:

- Keep: Jest + `ts-jest`, **`metrics.test.ts` only** (thesis defensibility), global error handler + 404 in [`api/src/app.ts`](api/src/app.ts), `yarn tsc && yarn build`, static serve of `react/build` from Express, README quick start, pre-defense checklist.
- **Remove:** second Postgres test DB + env-aware `config.ts`, `supertest` + `runs.api.test.ts`, mocked-axios compare test, React frontend test, `ErrorBoundary`, `run.sh` (keep Windows-only `run.ps1`).

---

## Side effects to verify while editing stage files

- The [`stages/README.md`](stages/README.md) progress tracker and table stay valid (no stage numbers change).
- Every "Definition of Done" checklist at the end of each stage file must be pruned to match the trimmed scope (cut bullets that reference removed features).
- Cross-references between stages (e.g. "we'll do X in Stage 7") must be updated when the target was cut.

---

## Out of scope for this task

- Writing any code under `api/` or `react/`. This plan only rewrites markdown under `stages/`.
- Python compare API changes.
- Database migrations beyond the existing `synchronize: true`.

---

## Final app surface (after all stages, simplified)

**Backend routes (`/api`):**

- `/auth/*` (kept)
- `/models/*` (kept — classical YOLO/FRCNN weights)
- `/download/*` (kept — weights download)
- `/document-types/*` (new, Stage 1)
- `POST /compare` (new, Stage 1)
- `/runs/*` (new: list, detail, delete, artifact, image, ground-truth — Stages 1 and 4)
- `/benchmarks/*` (new, trimmed — Stage 5; no SSE, CSV only)
- `/analytics/summary` (new, trimmed — Stage 6)
- `/public/runs/:id` + `/public/runs/:id/image` (new, Stage 7)

**Frontend pages:**

- `/login`, `/register` (kept)
- `/compare` (new, default route — Stage 2)
- `/runs`, `/runs/:id` (new — Stage 3)
- `/benchmarks`, `/benchmarks/:id` (new, trimmed — Stage 5)
- `/analytics` (new, trimmed — Stage 6)
- `/demo/:id?token=...` (new, Stage 7)
- `/models` (kept)

**Removed entirely:** `DetectTabsPage`, `ModelFilesPage`, `ResultsPage`,
`ModelFile`, `TestRun`, `/detect`, `/model-files`, `/test-runs`,
`features/modelFiles/`, `routes.js` (stale).
