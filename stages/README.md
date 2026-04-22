# Implementation Stages — Index

This folder splits `PROJECT_PLAN.md` into small, ordered stages. Each stage is
**self‑contained** and has everything a beginner developer needs to finish it:
what to create, what to modify, code snippets, test steps, and a final
acceptance checklist.

> **How to use this folder**
>
> - Do one stage at a time, in order. **Never skip a stage.**
> - When a stage is done, tick its checkbox in that stage's file and in this
>   index. Commit with the message pattern `stage-<NN>: <short summary>`.
> - If a step does not work, stop and ask before improvising. The stages build
>   on each other — a shaky foundation breaks later stages.
> - Every stage ends with a **Definition of Done** section. The stage is not
>   finished until every item is ticked.

---

## Conventions used in every stage file

- **Absolute paths** use forward slashes (`api/src/...`, `react/src/...`)
  relative to the workspace root `D:/Master/service/application/`.
- Code fences show **full file contents** when a new file is being created,
  and **diff‑style snippets** when an existing file is being modified.
- **Terminal commands** assume PowerShell on Windows. Use forward slashes in
  paths; PowerShell accepts them.
- **Do not paste code you do not understand.** Each snippet is followed by a
  short "why" explanation.
- When the text says "restart the dev server", stop the running `nodemon` or
  `react-scripts start` with `Ctrl+C` and start it again.

---

## Stage order

| # | File | Scope | Depends on |
|---|------|-------|------------|
| 0 | [`STAGE_00_setup_and_storage.md`](./STAGE_00_setup_and_storage.md) | Config keys, `RUNS_BASE_PATH`, `runStorage` helper, cleanup prep | — |
| 1 | [`STAGE_01_backend_core.md`](./STAGE_01_backend_core.md) | `DocumentType` + `ComparisonRun` entities, seed script, `POST /compare`, `GET /runs`, `GET /runs/:id`, artifact streaming | Stage 0 |
| 2 | [`STAGE_02_frontend_compare_page.md`](./STAGE_02_frontend_compare_page.md) | React `ComparePage` with 3‑column layout, diff highlighting, timing bar | Stage 1 |
| 3 | [`STAGE_03_runs_history_page.md`](./STAGE_03_runs_history_page.md) | Runs list page, navigation rework, remove legacy Detect | Stage 2 |
| 4 | [`STAGE_04_ground_truth_and_metrics.md`](./STAGE_04_ground_truth_and_metrics.md) | Metrics library, `PUT /runs/:id/ground-truth`, GT editor drawer, per‑field diff against GT | Stage 3 |
| 5 | [`STAGE_05_benchmarks.md`](./STAGE_05_benchmarks.md) | Batch upload, SSE progress, aggregate report, CSV + LaTeX export | Stage 4 |
| 6 | [`STAGE_06_analytics.md`](./STAGE_06_analytics.md) | Analytics dashboard with grouped bars, box plots, confidence calibration | Stage 5 |
| 7 | [`STAGE_07_polish.md`](./STAGE_07_polish.md) | Presentation mode, shareable tokens, bbox overlay, hotkeys, dark mode | Stage 6 |
| 8 | [`STAGE_08_testing_and_deployment.md`](./STAGE_08_testing_and_deployment.md) | Unit + e2e tests, hardened error handling, production build, deployment notes | Stage 7 |

## Progress tracker

Tick here when a stage is fully done (matches the Definition of Done in its file):

- [ ] Stage 0 — Setup and storage
- [ ] Stage 1 — Backend core
- [ ] Stage 2 — Compare page
- [ ] Stage 3 — Runs history page + nav
- [ ] Stage 4 — Ground truth + metrics
- [ ] Stage 5 — Benchmarks
- [ ] Stage 6 — Analytics dashboard
- [ ] Stage 7 — Polish
- [ ] Stage 8 — Testing & deployment

---

## Where to look when stuck

- Architecture + data model: `../PROJECT_PLAN.md`
- Existing auth flow: `api/src/controllers/authController.ts`, `api/src/utils/authMiddleware.ts`
- Existing upload pattern: `api/src/routes/detect.ts`, `api/src/controllers/detectController.ts`
- Existing Redux pattern: `react/src/features/models/modelsSlice.js`
- Existing AntD page pattern: `react/src/pages/ModelFilesPage.jsx`
