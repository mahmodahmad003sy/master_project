# Stage 5 — Benchmarks: batch runs, progress, aggregated reports

> **Goal:** Turn a folder of images plus a ground‑truth JSON map into a named
> benchmark that runs all three pipelines end‑to‑end and produces one
> aggregated report you can paste into your thesis (CSV + LaTeX).

**Estimated time for a beginner:** 10 – 16 hours split over 3 sessions.

**Dependencies:** Stage 4 done — metrics work on a single run.

**Affected areas:** `api/` (new entity, new routes, worker) and `react/`
(new pages + slice).

---

## 5.1 Prerequisites

- Metrics library from Stage 4 is working.
- A small test set ready on disk: 5–20 receipts + a `ground_truth.json`
  mapping filenames to expected JSON.

Install these backend helpers:

```powershell
cd D:/Master/service/application/api
yarn add adm-zip
yarn add -D @types/adm-zip
```

Branch:

```powershell
cd D:/Master/service/application
git checkout -b stage-05-benchmarks
```

---

## 5.2 Data model and files

```
api/src/
  entities/
    Benchmark.ts                   NEW
    BenchmarkItem.ts               NEW   (optional — can be kept as ComparisonRun.benchmarkId FK)
  services/
    benchmarkStorage.ts            NEW (wrappers around runStorage for the benchmarks/ subfolder)
    benchmarkWorker.ts             NEW (in-process worker, one run at a time)
    reportExport.ts                NEW (CSV + LaTeX emitters)
  controllers/
    benchmarkController.ts         NEW
  routes/
    benchmarks.ts                  NEW
  entities/ComparisonRun.ts        MODIFY — add `benchmarkId` column

react/src/
  api/benchmarks.js                NEW
  features/benchmarks/benchmarksSlice.js   NEW
  features/store/store.js          MODIFY
  pages/
    BenchmarksPage.jsx             NEW (list + create)
    BenchmarkDetailPage.jsx        NEW (items, progress, report, exports)
  App.js                           MODIFY (nav + routes)
```

We intentionally keep the model **simple**: a Benchmark owns many
`ComparisonRun` rows (via a new `benchmarkId` FK). No separate `BenchmarkItem`
table is needed; items are just runs that happen to belong to a benchmark.

---

## 5.3 Backend: entity and FK

### File to modify: `api/src/entities/ComparisonRun.ts`

Add:

```ts
@Column({ name: "benchmark_id", type: "int", nullable: true })
benchmarkId!: number | null;
```

### File to create: `api/src/entities/Benchmark.ts`

```ts
// api/src/entities/Benchmark.ts
import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";

export type BenchmarkStatus =
  | "draft"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

@Entity("benchmarks")
export class Benchmark extends BaseEntity {
  @PrimaryGeneratedColumn() id!: number;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Column() name!: string;
  @Column({ name: "document_type" }) documentType!: string;
  @Column({ name: "storage_dir" }) storageDir!: string;

  @Column({ type: "varchar", default: "draft" })
  status!: BenchmarkStatus;

  @Column({ name: "total_items", default: 0 })
  totalItems!: number;

  @Column({ name: "done_items", default: 0 })
  doneItems!: number;

  @Column({ name: "failed_items", default: 0 })
  failedItems!: number;

  /** Path to report.json once the run finishes. Relative to storage dir. */
  @Column({ name: "summary_path", type: "varchar", nullable: true })
  summaryPath!: string | null;

  @CreateDateColumn({ name: "created_at" }) createdAt!: Date;
}
```

Register in `api/src/data-source.ts`:

```ts
import { Benchmark } from "./entities/Benchmark";
// ...
entities: [Model, User, ModelFile, TestRun, DocumentType, ComparisonRun, Benchmark],
```

Restart the API to let TypeORM create the table and the new column.
If the column does not appear (sometimes TypeORM skips on change), manually:

```sql
ALTER TABLE comparison_runs ADD COLUMN benchmark_id INTEGER NULL;
```

---

## 5.4 Storage helper for benchmarks

### File to create: `api/src/services/benchmarkStorage.ts`

```ts
// api/src/services/benchmarkStorage.ts
import path from "path";
import fs from "fs";
import { RUNS_ROOT } from "./runStorage";

export function benchmarkDir(id: number | string) {
  return path.join(RUNS_ROOT, "benchmarks", String(id));
}
export function benchmarkImagesDir(id: number | string) {
  return path.join(benchmarkDir(id), "images");
}
export function benchmarkGtPath(id: number | string) {
  return path.join(benchmarkDir(id), "ground_truth.json");
}
export function benchmarkReportPath(id: number | string) {
  return path.join(benchmarkDir(id), "report.json");
}
export async function ensureBenchmarkDir(id: number | string) {
  await fs.promises.mkdir(benchmarkImagesDir(id), { recursive: true });
}
```

---

## 5.5 Worker: run the benchmark in the background

### File to create: `api/src/services/benchmarkWorker.ts`

```ts
// api/src/services/benchmarkWorker.ts
import fs from "fs";
import path from "path";
import { Benchmark } from "../entities/Benchmark";
import { ComparisonRun } from "../entities/ComparisonRun";
import { runCompare } from "../controllers/compareController";
import { artifactPath, readJson, writeJson } from "./runStorage";
import {
  benchmarkImagesDir,
  benchmarkGtPath,
  benchmarkReportPath,
} from "./benchmarkStorage";
import { scoreRun, Schema } from "./metrics";
import { DocumentType } from "../entities/DocumentType";

/**
 * Emit SSE-compatible events. Each call pushes one JSON object to every
 * subscriber. We keep the subscriber map in-memory; serverless users would
 * need Redis pub/sub instead.
 */
type Subscriber = (evt: any) => void;
const subs: Map<number, Set<Subscriber>> = new Map();

export function subscribe(benchmarkId: number, cb: Subscriber): () => void {
  if (!subs.has(benchmarkId)) subs.set(benchmarkId, new Set());
  subs.get(benchmarkId)!.add(cb);
  return () => subs.get(benchmarkId)?.delete(cb);
}

function emit(benchmarkId: number, evt: any) {
  subs.get(benchmarkId)?.forEach((cb) => cb(evt));
}

/** Running benchmarks tracked so we can cancel. */
const cancelFlags: Map<number, boolean> = new Map();
export function cancelBenchmark(id: number) {
  cancelFlags.set(id, true);
}

export async function startBenchmark(benchmarkId: number) {
  const bm = await Benchmark.findOne({ id: benchmarkId });
  if (!bm) throw new Error("Benchmark not found");
  if (bm.status === "running") return;

  cancelFlags.set(benchmarkId, false);

  bm.status = "running";
  await bm.save();
  emit(benchmarkId, { type: "status", status: "running" });

  const dt = await DocumentType.findOne({ key: bm.documentType });
  if (!dt) {
    bm.status = "failed";
    await bm.save();
    emit(benchmarkId, { type: "error", error: "Unknown document type" });
    return;
  }
  const schema = dt.schema as Schema;

  const gtMap = ((await readJson(benchmarkGtPath(benchmarkId))) ||
    {}) as Record<string, any>;
  const imagesDir = benchmarkImagesDir(benchmarkId);
  const files = (await fs.promises.readdir(imagesDir)).filter((f) =>
    /\.(jpe?g|png|webp|bmp)$/i.test(f),
  );

  bm.totalItems = files.length;
  bm.doneItems = 0;
  bm.failedItems = 0;
  await bm.save();
  emit(benchmarkId, { type: "progress", done: 0, total: files.length });

  try {
    for (const filename of files) {
      if (cancelFlags.get(benchmarkId)) {
        bm.status = "cancelled";
        break;
      }

      const abs = path.join(imagesDir, filename);
      const stat = await fs.promises.stat(abs);
      const fakeFile: Express.Multer.File = {
        fieldname: "file",
        originalname: filename,
        encoding: "7bit",
        mimetype: "image/jpeg",
        destination: imagesDir,
        filename,
        path: abs,
        size: stat.size,
        stream: fs.createReadStream(abs) as any,
        buffer: Buffer.alloc(0),
      };

      try {
        const { run, response } = await runCompare({
          file: fakeFile,
          documentTypeKey: bm.documentType,
          userId: bm.user?.id ?? null,
        });
        run.benchmarkId = benchmarkId;
        await run.save();

        // If GT present for this filename, persist it per-run + recompute metrics.
        const gt = gtMap[filename];
        if (gt) {
          await writeJson(artifactPath(run.id, "ground_truth"), gt);
          const [classical, vlm, hybrid] = await Promise.all([
            readJson(artifactPath(run.id, "classical")),
            readJson(artifactPath(run.id, "vlm")),
            readJson(artifactPath(run.id, "hybrid")),
          ]);
          const metrics = scoreRun({ classical, vlm, hybrid }, gt, schema);
          await writeJson(artifactPath(run.id, "metrics"), metrics);
          run.hasGroundTruth = true;
          run.summary = metrics.summary;
          await run.save();
        }

        bm.doneItems++;
        emit(benchmarkId, { type: "item", filename, runId: run.id, ok: true });
      } catch (err: any) {
        bm.failedItems++;
        emit(benchmarkId, {
          type: "item",
          filename,
          ok: false,
          error: err?.message ?? String(err),
        });
      }

      await bm.save();
      emit(benchmarkId, {
        type: "progress",
        done: bm.doneItems + bm.failedItems,
        total: bm.totalItems,
      });
    }

    // Build the aggregated report.
    const runs = await ComparisonRun.findBy({ benchmarkId });
    const report = aggregateReport(runs);
    await writeJson(benchmarkReportPath(benchmarkId), report);
    bm.summaryPath = "report.json";
    if (bm.status !== "cancelled") bm.status = "done";
    await bm.save();
    emit(benchmarkId, { type: "done", report });
  } catch (err: any) {
    bm.status = "failed";
    await bm.save();
    emit(benchmarkId, { type: "error", error: err?.message ?? String(err) });
  }
}

export function aggregateReport(runs: ComparisonRun[]) {
  const approaches = ["classical", "vlm", "hybrid"] as const;
  const timings: Record<string, number[]> = {
    classical: [],
    vlm: [],
    hybrid: [],
  };
  const scores: Record<string, number[]> = {
    classical: [],
    vlm: [],
    hybrid: [],
  };

  for (const r of runs) {
    for (const a of approaches) {
      if (r.timings?.[a] != null) timings[a].push(r.timings[a]);
      if (r.summary?.[a] != null) scores[a].push(r.summary[a]);
    }
  }

  const pct = (arr: number[], p: number) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((x, y) => x - y);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  };
  const mean = (arr: number[]) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  return {
    total: runs.length,
    perApproach: approaches.map((a) => ({
      approach: a,
      accuracy_mean: mean(scores[a]),
      latency_mean_ms: mean(timings[a]),
      latency_p50_ms: pct(timings[a], 0.5),
      latency_p95_ms: pct(timings[a], 0.95),
      scored_count: scores[a].length,
    })),
  };
}
```

**Beginner notes:**

- We run items **sequentially**, not in parallel, because the GPU‑bound
  Python service can't handle much concurrency and thesis reproducibility is
  easier with a stable order.
- The worker is in‑memory. If the Node process restarts mid‑run, the
  benchmark stays in "running" status. A small Stage 8 cleanup can mark
  orphaned running benchmarks as `failed` on boot.
- The fake `Express.Multer.File` object mimics what multer gives us so we
  can reuse `runCompare`. The `path` field is what matters; other fields are
  placeholders.

---

## 5.6 Report exports

### File to create: `api/src/services/reportExport.ts`

```ts
// api/src/services/reportExport.ts
import { ComparisonRun } from "../entities/ComparisonRun";

export function toCsv(runs: ComparisonRun[]): string {
  const header = [
    "runId",
    "filename",
    "hasGroundTruth",
    "score_classical",
    "score_vlm",
    "score_hybrid",
    "time_classical_ms",
    "time_vlm_ms",
    "time_hybrid_ms",
    "recommended",
  ];
  const rows = runs.map((r) =>
    [
      r.id,
      JSON.stringify(r.filename),
      r.hasGroundTruth,
      r.summary?.classical ?? "",
      r.summary?.vlm ?? "",
      r.summary?.hybrid ?? "",
      r.timings?.classical ?? "",
      r.timings?.vlm ?? "",
      r.timings?.hybrid ?? "",
      JSON.stringify(r.recommended ?? ""),
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function toLatex(report: ReturnType<typeof makeSummary>): string {
  const rows = report.perApproach
    .map(
      (p) =>
        `${p.approach} & ${fmtPct(p.accuracy_mean)} & ${fmt(p.latency_mean_ms)} & ${fmt(p.latency_p50_ms)} & ${fmt(p.latency_p95_ms)} \\\\`,
    )
    .join("\n");
  return [
    "\\begin{tabular}{lcccc}",
    "\\hline",
    "Approach & Mean Acc. & Mean (ms) & p50 (ms) & p95 (ms) \\\\",
    "\\hline",
    rows,
    "\\hline",
    "\\end{tabular}",
  ].join("\n");
}

function fmt(n: number | null | undefined) {
  return n == null ? "--" : n.toFixed(0);
}
function fmtPct(n: number | null | undefined) {
  return n == null ? "--" : (n * 100).toFixed(1) + "\\%";
}

/** Convenience re-export for the route to call. */
export function makeSummary(report: any) {
  return report;
}
```

---

## 5.7 Controller + routes

### File to create: `api/src/controllers/benchmarkController.ts`

```ts
// api/src/controllers/benchmarkController.ts
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { Request, Response } from "express";
import { Benchmark } from "../entities/Benchmark";
import { ComparisonRun } from "../entities/ComparisonRun";
import { User } from "../entities/User";
import { AuthRequest } from "../utils/authMiddleware";
import {
  benchmarkDir,
  benchmarkGtPath,
  benchmarkImagesDir,
  benchmarkReportPath,
  ensureBenchmarkDir,
} from "../services/benchmarkStorage";
import { readJson, writeJson } from "../services/runStorage";
import {
  startBenchmark,
  cancelBenchmark,
  subscribe,
} from "../services/benchmarkWorker";
import { toCsv, toLatex } from "../services/reportExport";

export const createBenchmark = async (req: AuthRequest, res: Response) => {
  const { name, documentType } = req.body;
  if (!name || !documentType) {
    return res
      .status(400)
      .json({ error: "name and documentType are required" });
  }
  const user = req.userId ? await User.findOne({ id: req.userId }) : null;
  const bm = Benchmark.create({ name, documentType, storageDir: "", user });
  await bm.save();
  bm.storageDir = String(bm.id);
  await bm.save();
  await ensureBenchmarkDir(bm.id);
  res.status(201).json(bm);
};

export const listBenchmarks = async (_req: Request, res: Response) => {
  const items = await Benchmark.find({ order: { createdAt: "DESC" } });
  res.json(items);
};

export const getBenchmark = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const bm = await Benchmark.findOne({ id });
  if (!bm) return res.status(404).json({ error: "Not found" });
  const items = await ComparisonRun.find({
    where: { benchmarkId: id },
    order: { id: "ASC" },
  });
  const report = await readJson(benchmarkReportPath(id));
  res.json({ benchmark: bm, items, report });
};

/**
 * Upload a zip containing image files and optionally a `ground_truth.json`
 * at the root. Files inside nested folders are flattened.
 */
export const uploadItems = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const bm = await Benchmark.findOne({ id });
  if (!bm) return res.status(404).json({ error: "Not found" });
  if (!req.file) return res.status(400).json({ error: "Zip file is required" });

  await ensureBenchmarkDir(id);
  const zip = new AdmZip(req.file.path);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const base = path.basename(entry.entryName);
    if (base === "ground_truth.json") {
      const gt = JSON.parse(entry.getData().toString("utf-8"));
      await writeJson(benchmarkGtPath(id), gt);
      continue;
    }
    if (/\.(jpe?g|png|webp|bmp)$/i.test(base)) {
      const dest = path.join(benchmarkImagesDir(id), base);
      await fs.promises.writeFile(dest, entry.getData());
    }
  }
  await fs.promises.unlink(req.file.path).catch(() => {});
  const files = (await fs.promises.readdir(benchmarkImagesDir(id))).filter(
    (f) => /\.(jpe?g|png|webp|bmp)$/i.test(f),
  );
  bm.totalItems = files.length;
  await bm.save();
  res.json({ benchmark: bm, uploadedFiles: files });
};

export const runBenchmark = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const bm = await Benchmark.findOne({ id });
  if (!bm) return res.status(404).json({ error: "Not found" });
  startBenchmark(id).catch((err) => console.error("benchmark failed", err));
  res.json({ started: true });
};

export const cancelBenchmarkRoute = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  cancelBenchmark(id);
  res.json({ cancelRequested: true });
};

/** Server-Sent Events stream. */
export const benchmarkStream = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (evt: any) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  send({ type: "hello" });
  const unsubscribe = subscribe(id, send);
  req.on("close", () => unsubscribe());
};

/** Export CSV of per-run rows. */
export const exportCsv = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const items = await ComparisonRun.find({ where: { benchmarkId: id } });
  const csv = toCsv(items);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="benchmark-${id}.csv"`,
  );
  res.send(csv);
};

/** Export LaTeX summary table. */
export const exportLatex = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const report = await readJson(benchmarkReportPath(id));
  if (!report) return res.status(404).json({ error: "Report not ready" });
  const latex = toLatex(report as any);
  res.setHeader("Content-Type", "text/plain");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="benchmark-${id}.tex"`,
  );
  res.send(latex);
};

export const deleteBenchmark = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const bm = await Benchmark.findOne({ id });
  if (!bm) return res.status(404).send();
  // delete child runs (and their folders)
  const runs = await ComparisonRun.find({ where: { benchmarkId: id } });
  const { removeRunDir } = await import("../services/runStorage");
  for (const r of runs) {
    await removeRunDir(r.id);
    await r.remove();
  }
  await fs.promises.rm(benchmarkDir(id), { recursive: true, force: true });
  await bm.remove();
  res.status(204).send();
};
```

### File to create: `api/src/routes/benchmarks.ts`

```ts
// api/src/routes/benchmarks.ts
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../utils/asyncHandler";
import {
  createBenchmark,
  listBenchmarks,
  getBenchmark,
  uploadItems,
  runBenchmark,
  cancelBenchmarkRoute,
  benchmarkStream,
  exportCsv,
  exportLatex,
  deleteBenchmark,
} from "../controllers/benchmarkController";

const router = Router();
const upload = multer({ dest: "tmp/" });

router.get("/", asyncHandler(listBenchmarks));
router.post("/", asyncHandler(createBenchmark));
router.get("/:id", asyncHandler(getBenchmark));
router.delete("/:id", asyncHandler(deleteBenchmark));

router.post("/:id/items", upload.single("zip"), asyncHandler(uploadItems));
router.post("/:id/run", asyncHandler(runBenchmark));
router.post("/:id/cancel", asyncHandler(cancelBenchmarkRoute));
router.get("/:id/stream", asyncHandler(benchmarkStream));
router.get("/:id/export/csv", asyncHandler(exportCsv));
router.get("/:id/export/latex", asyncHandler(exportLatex));

export default router;
```

### Register in `api/src/routes/index.ts`

```ts
import benchmarksRouter from "./benchmarks";
// ...
router.use("/benchmarks", requireAuth, benchmarksRouter);
```

---

## 5.8 Frontend: API + slice

### File to create: `react/src/api/benchmarks.js`

```js
import client from "./client";

export const listBenchmarksApi = () => client.get("/api/benchmarks");
export const createBenchmarkApi = (payload) =>
  client.post("/api/benchmarks", payload);
export const getBenchmarkApi = (id) => client.get(`/api/benchmarks/${id}`);
export const deleteBenchmarkApi = (id) =>
  client.delete(`/api/benchmarks/${id}`);

export const uploadBenchmarkZip = (id, zipFile, onProgress) => {
  const form = new FormData();
  form.append("zip", zipFile);
  return client.post(`/api/benchmarks/${id}/items`, form, {
    timeout: 300_000,
    onUploadProgress: (evt) =>
      onProgress && evt.total && onProgress(evt.loaded / evt.total),
  });
};

export const startBenchmarkApi = (id) =>
  client.post(`/api/benchmarks/${id}/run`);
export const cancelBenchmarkApi = (id) =>
  client.post(`/api/benchmarks/${id}/cancel`);
export const downloadCsvUrl = (id) =>
  `${client.defaults.baseURL}/api/benchmarks/${id}/export/csv`;
export const downloadLatexUrl = (id) =>
  `${client.defaults.baseURL}/api/benchmarks/${id}/export/latex`;

/** Open an EventSource for live progress. */
export const openBenchmarkStream = (id, onEvent) => {
  const url = `${client.defaults.baseURL}/api/benchmarks/${id}/stream`;
  const es = new EventSource(url, { withCredentials: false });
  es.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data));
    } catch {}
  };
  return es;
};
```

> **Note about auth for SSE:** `EventSource` cannot send custom headers, so
> the stream is technically JWT‑protected via middleware that accepts the
> token as a query parameter. The simplest workaround for Stage 5 is to
> **remove auth from `/benchmarks/:id/stream` only** and rely on the
> benchmark id being unguessable (acceptable for a thesis demo). Stage 7
> will add a proper short‑lived signed token for public streams.
>
> To allow the stream without auth: split `benchmarks.ts` so the `stream`
> route is mounted **before** `requireAuth`. Example tweak in `routes/index.ts`:
>
> ```ts
> router.get("/benchmarks/:id/stream", asyncHandler(benchmarkStream));
> router.use("/benchmarks", requireAuth, benchmarksRouter);
> ```

### File to create: `react/src/features/benchmarks/benchmarksSlice.js`

```js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  listBenchmarksApi,
  createBenchmarkApi,
  getBenchmarkApi,
  deleteBenchmarkApi,
} from "../../api/benchmarks";

export const loadBenchmarks = createAsyncThunk("benchmarks/load", async () => {
  const { data } = await listBenchmarksApi();
  return data;
});

export const createBenchmark = createAsyncThunk(
  "benchmarks/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await createBenchmarkApi(payload);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  },
);

export const loadBenchmarkDetail = createAsyncThunk(
  "benchmarks/detail",
  async (id) => {
    const { data } = await getBenchmarkApi(id);
    return data;
  },
);

export const deleteBenchmark = createAsyncThunk(
  "benchmarks/delete",
  async (id) => {
    await deleteBenchmarkApi(id);
    return id;
  },
);

const slice = createSlice({
  name: "benchmarks",
  initialState: {
    items: [],
    status: "idle",
    detail: null,
    detailStatus: "idle",
    progressEvents: [], // appended by the stream
  },
  reducers: {
    pushEvent(s, a) {
      s.progressEvents.push(a.payload);
    },
    clearEvents(s) {
      s.progressEvents = [];
    },
    setDetail(s, a) {
      s.detail = a.payload;
    },
  },
  extraReducers: (b) => {
    b.addCase(loadBenchmarks.fulfilled, (s, a) => {
      s.items = a.payload;
      s.status = "ok";
    })
      .addCase(createBenchmark.fulfilled, (s, a) => {
        s.items.unshift(a.payload);
      })
      .addCase(loadBenchmarkDetail.pending, (s) => {
        s.detailStatus = "loading";
      })
      .addCase(loadBenchmarkDetail.fulfilled, (s, a) => {
        s.detailStatus = "ok";
        s.detail = a.payload;
      })
      .addCase(deleteBenchmark.fulfilled, (s, a) => {
        s.items = s.items.filter((b) => b.id !== a.payload);
        if (s.detail?.benchmark?.id === a.payload) s.detail = null;
      });
  },
});

export const { pushEvent, clearEvents, setDetail } = slice.actions;
export default slice.reducer;
```

Register in the store.

---

## 5.9 Pages

### `BenchmarksPage.jsx` — list + create

Minimal skeleton; style to taste:

```jsx
// react/src/pages/BenchmarksPage.jsx
import React, { useEffect, useState } from "react";
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Popconfirm,
  message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  loadBenchmarks,
  createBenchmark,
  deleteBenchmark,
} from "../features/benchmarks/benchmarksSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";

export default function BenchmarksPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items } = useSelector((s) => s.benchmarks);
  const { items: docTypes } = useSelector((s) => s.documentTypes);
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    dispatch(loadBenchmarks());
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  const submit = async () => {
    const vals = await form.validateFields();
    const created = await dispatch(createBenchmark(vals)).unwrap();
    message.success("Benchmark created");
    setOpen(false);
    form.resetFields();
    navigate(`/benchmarks/${created.id}`);
  };

  return (
    <div>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => setOpen(true)}
        style={{ marginBottom: 16 }}
      >
        New benchmark
      </Button>
      <Table
        rowKey="id"
        dataSource={items}
        onRow={(r) => ({
          onDoubleClick: () => navigate(`/benchmarks/${r.id}`),
        })}
        columns={[
          { title: "ID", dataIndex: "id", width: 80 },
          { title: "Name", dataIndex: "name" },
          {
            title: "Doc type",
            dataIndex: "documentType",
            width: 120,
            render: (v) => <Tag>{v}</Tag>,
          },
          {
            title: "Items",
            render: (_, r) =>
              `${r.doneItems}/${r.totalItems} (${r.failedItems} failed)`,
          },
          {
            title: "Status",
            dataIndex: "status",
            render: (v) => <Tag>{v}</Tag>,
          },
          {
            title: "Created",
            dataIndex: "createdAt",
            render: (d) => new Date(d).toLocaleString(),
          },
          {
            title: "Actions",
            render: (_, r) => (
              <Space>
                <Button onClick={() => navigate(`/benchmarks/${r.id}`)}>
                  Open
                </Button>
                <Popconfirm
                  title="Delete benchmark and all its runs?"
                  onConfirm={() => dispatch(deleteBenchmark(r.id))}
                >
                  <Button danger>Delete</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={open}
        onOk={submit}
        onCancel={() => setOpen(false)}
        title="New benchmark"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="documentType"
            label="Document type"
            rules={[{ required: true }]}
          >
            <Select
              options={docTypes.map((d) => ({ value: d.key, label: d.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

### `BenchmarkDetailPage.jsx`

Upload zip → Run → progress bar → Report view with export buttons.

```jsx
// react/src/pages/BenchmarkDetailPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  Card,
  Upload,
  Button,
  Progress,
  Table,
  Tag,
  Space,
  message,
  Statistic,
  Row,
  Col,
  Descriptions,
} from "antd";
import {
  UploadOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FileExcelOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import {
  uploadBenchmarkZip,
  startBenchmarkApi,
  cancelBenchmarkApi,
  openBenchmarkStream,
  downloadCsvUrl,
  downloadLatexUrl,
} from "../api/benchmarks";
import {
  loadBenchmarkDetail,
  pushEvent,
  clearEvents,
} from "../features/benchmarks/benchmarksSlice";

export default function BenchmarkDetailPage() {
  const { id } = useParams();
  const bid = Number(id);
  const dispatch = useDispatch();
  const { detail, progressEvents } = useSelector((s) => s.benchmarks);
  const [zip, setZip] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    dispatch(loadBenchmarkDetail(bid));
    dispatch(clearEvents());
    const es = openBenchmarkStream(bid, (evt) => dispatch(pushEvent(evt)));
    return () => es.close();
  }, [bid, dispatch]);

  const bm = detail?.benchmark;
  const items = detail?.items || [];
  const report = detail?.report;

  const progress = useMemo(() => {
    if (!bm) return 0;
    if (!bm.totalItems) return 0;
    return Math.round(((bm.doneItems + bm.failedItems) / bm.totalItems) * 100);
  }, [bm]);

  if (!bm) return null;

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Card
        title={`${bm.name}  (${bm.documentType})`}
        extra={<Tag>{bm.status}</Tag>}
      >
        <Space wrap>
          <Upload
            accept=".zip"
            maxCount={1}
            beforeUpload={(f) => {
              setZip(f);
              return false;
            }}
            fileList={zip ? [zip] : []}
            onRemove={() => setZip(null)}
          >
            <Button icon={<UploadOutlined />}>Select .zip</Button>
          </Upload>
          <Button
            type="primary"
            disabled={!zip || uploading}
            loading={uploading}
            onClick={async () => {
              setUploading(true);
              try {
                await uploadBenchmarkZip(bid, zip);
                message.success("Zip uploaded");
                setZip(null);
                dispatch(loadBenchmarkDetail(bid));
              } catch (err) {
                message.error(err.response?.data?.error || err.message);
              } finally {
                setUploading(false);
              }
            }}
          >
            Upload
          </Button>
          <Button
            icon={<PlayCircleOutlined />}
            disabled={bm.status === "running"}
            onClick={() => startBenchmarkApi(bid)}
          >
            Run
          </Button>
          <Button
            icon={<StopOutlined />}
            disabled={bm.status !== "running"}
            onClick={() => cancelBenchmarkApi(bid)}
          >
            Cancel
          </Button>
          <a href={downloadCsvUrl(bid)}>
            {" "}
            <Button icon={<FileExcelOutlined />}>Export CSV</Button>{" "}
          </a>
          <a href={downloadLatexUrl(bid)}>
            {" "}
            <Button icon={<FileTextOutlined />}>Export LaTeX</Button>{" "}
          </a>
        </Space>
        <Progress
          percent={progress}
          status={bm.status === "failed" ? "exception" : undefined}
          style={{ marginTop: 16 }}
        />
      </Card>

      {report && (
        <Card title="Aggregate report">
          <Row gutter={16}>
            {report.perApproach.map((p) => (
              <Col xs={24} md={8} key={p.approach}>
                <Card type="inner" title={p.approach.toUpperCase()}>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Mean accuracy">
                      {p.accuracy_mean == null
                        ? "—"
                        : (p.accuracy_mean * 100).toFixed(1) + "%"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Latency mean">
                      {p.latency_mean_ms == null
                        ? "—"
                        : p.latency_mean_ms.toFixed(0) + " ms"}
                    </Descriptions.Item>
                    <Descriptions.Item label="p50 / p95">
                      {p.latency_p50_ms ?? "—"} / {p.latency_p95_ms ?? "—"} ms
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      <Card title={`Items (${items.length})`}>
        <Table
          rowKey="id"
          dataSource={items}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: "Run", dataIndex: "id", width: 80 },
            { title: "File", dataIndex: "filename" },
            {
              title: "GT",
              dataIndex: "hasGroundTruth",
              render: (v) => (v ? "✓" : "—"),
            },
            {
              title: "C",
              width: 70,
              render: (_, r) =>
                r.summary ? (r.summary.classical * 100).toFixed(0) + "%" : "—",
            },
            {
              title: "V",
              width: 70,
              render: (_, r) =>
                r.summary ? (r.summary.vlm * 100).toFixed(0) + "%" : "—",
            },
            {
              title: "H",
              width: 70,
              render: (_, r) =>
                r.summary ? (r.summary.hybrid * 100).toFixed(0) + "%" : "—",
            },
            {
              title: "Rec.",
              dataIndex: "recommended",
              render: (v) => (v ? <Tag color="green">{v}</Tag> : "—"),
            },
          ]}
        />
      </Card>

      <Card title="Live events" size="small">
        <pre
          style={{ maxHeight: 200, overflow: "auto", fontSize: 12, margin: 0 }}
        >
          {progressEvents
            .slice(-200)
            .map((e, i) => JSON.stringify(e))
            .join("\n")}
        </pre>
      </Card>
    </Space>
  );
}
```

### Nav + routes

In `react/src/App.js` add a `Benchmarks` menu item and routes:

```jsx
<Menu.Item key="/benchmarks"><Link to="/benchmarks">Benchmarks</Link></Menu.Item>
// ...
<Route path="/benchmarks" element={<BenchmarksPage />} />
<Route path="/benchmarks/:id" element={<BenchmarkDetailPage />} />
```

---

## 5.10 Manual test script

1. Prepare a folder with 5 receipts and a `ground_truth.json`:
   ```json
   {
     "receipt1.jpg": { "DATE": "27.12.25", "FB": "...", "SUM": "329.00", ... },
     "receipt2.jpg": { ... }
   }
   ```
   Zip the folder (put both the images and `ground_truth.json` at the root).
2. Open `/benchmarks`. Create one named e.g. `receipt-smoke`, doc type `receipt`.
3. On detail page, upload the zip. `uploadedFiles` count matches.
4. Press **Run**. Progress bar fills 20% per image. Live events list grows.
5. At the end, the Aggregate report card appears with mean accuracy, p50/p95.
6. Items table shows per‑file scores for C/V/H.
7. Click **Export CSV** — file downloads.
8. Click **Export LaTeX** — `.tex` file downloads; paste it into Overleaf
   to confirm it compiles.
9. Delete a benchmark — its zip, images, child runs, and DB rows all disappear.

---

## 5.11 Common pitfalls

- **Zip uploads but no images appear**: some zips put everything inside a
  nested folder. Our extractor flattens to the base filename — collisions
  fall back to last‑write‑wins. If you want unique names, add a counter
  suffix in `uploadItems`.
- **SSE disconnects after ~30s on production**: reverse proxies (nginx)
  buffer SSE unless you set `X-Accel-Buffering: no`. We skip this in Stage 5
  because dev is localhost.
- **Worker runs forever after browser closes**: that's the intended
  behaviour — closing the tab must not cancel the benchmark. Use **Cancel**
  explicitly.
- **Process restart in the middle**: any benchmark stuck in `running` on
  boot should be marked `failed`. Add this snippet to `app.ts`:
  ```ts
  await Benchmark.createQueryBuilder()
    .update({ status: "failed" })
    .where({ status: "running" })
    .execute();
  ```

---

## 5.12 Definition of Done

- [ ] `benchmarks` table exists; `comparison_runs` has `benchmark_id` column.
- [ ] `POST /api/benchmarks` creates a benchmark with a `storageDir`.
- [ ] Zip upload extracts images + optional `ground_truth.json` into
      `tmp/runs/benchmarks/<id>/images/` and `ground_truth.json`.
- [ ] `POST /api/benchmarks/:id/run` starts the worker; SSE stream pushes
      `{type:"progress"|"item"|"done"|"error"}` events.
- [ ] On completion, `report.json` is written; `status = done`.
- [ ] Cancel flag cleanly stops mid‑run; status becomes `cancelled`.
- [ ] CSV and LaTeX exports are downloadable.
- [ ] Deleting a benchmark deletes all its runs (DB + disk folders).
- [ ] Commit: `stage-05: benchmarks with progress, report, and exports`.
