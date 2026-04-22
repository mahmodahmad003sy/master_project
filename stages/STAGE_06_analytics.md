# Stage 6 — Analytics dashboard

> **Goal:** One page that summarises every comparison run across all time
> (or a date range, or a benchmark) using charts that answer the key thesis
> questions: *Which approach is most accurate per field? Which is fastest?
> Are the confidences calibrated?*

**Estimated time for a beginner:** 6 – 10 hours.

**Dependencies:** Stage 4 metrics exist on many runs, Stage 5 benchmarks optional.

**Affected areas:** `api/` (one new read‑only endpoint) and `react/`
(one new page + charts library).

---

## 6.1 Prerequisites

- At least 10 runs with ground truth (for the accuracy numbers to be
  meaningful).
- Install a chart library on the frontend:

  ```powershell
  cd D:/Master/service/application/react
  yarn add recharts
  ```

Create a branch:

```powershell
cd D:/Master/service/application
git checkout -b stage-06-analytics
```

---

## 6.2 Plan of files

```
api/src/
  services/analytics.ts            NEW — aggregation queries (reads DB + reads metrics.json per run)
  controllers/analyticsController.ts NEW
  routes/analytics.ts              NEW

react/src/
  api/analytics.js                 NEW
  features/analytics/analyticsSlice.js NEW
  pages/AnalyticsPage.jsx          NEW
  components/analytics/            NEW  (AccuracyPerField, LatencyBoxplot, CalibrationChart, ApproachKpis)
  App.js                           MODIFY (nav + route)
```

---

## 6.3 Backend aggregation

### File to create: `api/src/services/analytics.ts`

```ts
// api/src/services/analytics.ts
import { Between, FindOptionsWhere, IsNull, Not } from "typeorm";
import { ComparisonRun } from "../entities/ComparisonRun";
import { artifactPath, readJson } from "./runStorage";

export interface AnalyticsFilter {
  from?: Date;
  to?: Date;
  documentType?: string;
  benchmarkId?: number;
}

export async function fetchRuns(filter: AnalyticsFilter) {
  const where: FindOptionsWhere<ComparisonRun> = {};
  if (filter.documentType) where.documentType = filter.documentType;
  if (filter.benchmarkId)  where.benchmarkId = filter.benchmarkId;
  if (filter.from && filter.to) where.createdAt = Between(filter.from, filter.to);

  return ComparisonRun.find({ where, order: { id: "ASC" } });
}

/** Top-level KPIs per approach. */
export function computeKpis(runs: ComparisonRun[]) {
  const approaches = ["classical", "vlm", "hybrid"] as const;
  return approaches.map((a) => {
    const accs = runs.map((r) => r.summary?.[a]).filter((v): v is number => v != null);
    const lats = runs.map((r) => r.timings?.[a]).filter((v): v is number => v != null);
    return {
      approach: a,
      scoredCount: accs.length,
      meanAccuracy: mean(accs),
      meanLatencyMs: mean(lats),
      p50LatencyMs: percentile(lats, 0.5),
      p95LatencyMs: percentile(lats, 0.95),
    };
  });
}

/** Per-field accuracy per approach. Needs metrics.json on disk. */
export async function computePerFieldAccuracy(runs: ComparisonRun[]) {
  const acc: Record<string, Record<string, { sum: number; n: number }>> = {};
  for (const run of runs) {
    if (!run.hasGroundTruth) continue;
    const metrics = await readJson<any>(artifactPath(run.id, "metrics"));
    if (!metrics) continue;
    for (const approach of ["classical", "vlm", "hybrid"] as const) {
      const fields = metrics.perApproach?.[approach]?.fields ?? [];
      for (const f of fields) {
        acc[f.key] ??= {};
        acc[f.key][approach] ??= { sum: 0, n: 0 };
        acc[f.key][approach].sum += f.score;
        acc[f.key][approach].n   += 1;
      }
    }
  }
  return Object.entries(acc).map(([field, byApproach]) => ({
    field,
    classical: byApproach.classical ? byApproach.classical.sum / byApproach.classical.n : null,
    vlm:       byApproach.vlm       ? byApproach.vlm.sum       / byApproach.vlm.n       : null,
    hybrid:    byApproach.hybrid    ? byApproach.hybrid.sum    / byApproach.hybrid.n    : null,
  }));
}

/** Confidence vs correctness: bin confidence, plot accuracy per bin. */
export async function computeCalibration(runs: ComparisonRun[]) {
  const bins = Array.from({ length: 10 }, (_, i) => ({
    min: i / 10, max: (i + 1) / 10,
    classical: { sum: 0, n: 0 }, vlm: { sum: 0, n: 0 }, hybrid: { sum: 0, n: 0 },
  }));

  const confOf = (run: any, approach: string): number | null => {
    // classical/vlm: top-level confidence; hybrid: meta.confidence.receipt_confidence.
    // We don't have the raw response on the DB row; we read the artifact.
    return null; // placeholder, replaced below by reading artifact
  };

  for (const run of runs) {
    if (!run.hasGroundTruth) continue;
    const [metrics, classical, vlm, hybrid] = await Promise.all([
      readJson<any>(artifactPath(run.id, "metrics")),
      readJson<any>(artifactPath(run.id, "classical")),
      readJson<any>(artifactPath(run.id, "vlm")),
      readJson<any>(artifactPath(run.id, "hybrid")),
    ]);
    if (!metrics) continue;

    const conf: Record<string, number | null> = {
      classical: typeof classical?.confidence === "number" ? classical.confidence : null,
      vlm:       typeof vlm?.confidence       === "number" ? vlm.confidence       : null,
      hybrid:    typeof hybrid?.meta?.confidence?.receipt_confidence === "number"
                  ? hybrid.meta.confidence.receipt_confidence : null,
    };
    const score: Record<string, number> = metrics.summary ?? {};

    for (const a of ["classical", "vlm", "hybrid"] as const) {
      const c = conf[a];
      const s = score[a];
      if (c == null || s == null) continue;
      const bin = bins.find((b) => c >= b.min && c < b.max) ?? bins[bins.length - 1];
      bin[a].sum += s;
      bin[a].n   += 1;
    }
  }

  return bins.map((b) => ({
    bin: `${(b.min).toFixed(1)}–${(b.max).toFixed(1)}`,
    classical: b.classical.n ? b.classical.sum / b.classical.n : null,
    vlm:       b.vlm.n       ? b.vlm.sum       / b.vlm.n       : null,
    hybrid:    b.hybrid.n    ? b.hybrid.sum    / b.hybrid.n    : null,
  }));
}

/** Latency distributions suitable for a simple box plot on the client. */
export function computeLatencyDistributions(runs: ComparisonRun[]) {
  const approaches = ["classical", "vlm", "hybrid"] as const;
  return approaches.map((a) => {
    const arr = runs.map((r) => r.timings?.[a]).filter((v): v is number => v != null).sort((x, y) => x - y);
    return {
      approach: a,
      count: arr.length,
      min: arr[0] ?? null,
      max: arr[arr.length - 1] ?? null,
      p25: percentile(arr, 0.25),
      p50: percentile(arr, 0.5),
      p75: percentile(arr, 0.75),
      p95: percentile(arr, 0.95),
      mean: mean(arr),
      samples: arr,  // for histograms if you want
    };
  });
}

/* utils */
function mean(a: number[]) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function percentile(a: number[], p: number) {
  if (!a.length) return null;
  const sorted = [...a].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
```

### File to create: `api/src/controllers/analyticsController.ts`

```ts
import { Request, Response } from "express";
import {
  fetchRuns, computeKpis, computePerFieldAccuracy,
  computeCalibration, computeLatencyDistributions,
} from "../services/analytics";

function parseFilter(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  return {
    from: q.from ? new Date(q.from) : undefined,
    to:   q.to   ? new Date(q.to)   : undefined,
    documentType: q.documentType,
    benchmarkId: q.benchmarkId ? Number(q.benchmarkId) : undefined,
  };
}

export const analyticsSummary = async (req: Request, res: Response) => {
  const f = parseFilter(req);
  const runs = await fetchRuns(f);
  const [kpis, perField, calibration] = await Promise.all([
    Promise.resolve(computeKpis(runs)),
    computePerFieldAccuracy(runs),
    computeCalibration(runs),
  ]);
  const latency = computeLatencyDistributions(runs);
  res.json({
    totalRuns: runs.length,
    withGroundTruth: runs.filter((r) => r.hasGroundTruth).length,
    kpis, perField, calibration, latency,
  });
};
```

### File to create: `api/src/routes/analytics.ts`

```ts
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { analyticsSummary } from "../controllers/analyticsController";

const router = Router();
router.get("/summary", asyncHandler(analyticsSummary));
export default router;
```

Mount in `routes/index.ts`:

```ts
import analyticsRouter from "./analytics";
router.use("/analytics", requireAuth, analyticsRouter);
```

### Test

```powershell
curl.exe "http://localhost:3000/api/analytics/summary" -H "Authorization: Bearer <TOKEN>"
```

Response must include `kpis[3]`, `perField`, `calibration[10 bins]`, `latency[3]`.

---

## 6.4 Frontend API + slice

### `react/src/api/analytics.js`

```js
import client from "./client";
export const fetchAnalyticsSummary = (params = {}) =>
  client.get("/api/analytics/summary", { params });
```

### `react/src/features/analytics/analyticsSlice.js`

```js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchAnalyticsSummary } from "../../api/analytics";

export const loadAnalytics = createAsyncThunk(
  "analytics/load",
  async (filters = {}, { rejectWithValue }) => {
    try { const { data } = await fetchAnalyticsSummary(filters); return data; }
    catch (err) { return rejectWithValue(err.response?.data?.error || err.message); }
  }
);

const slice = createSlice({
  name: "analytics",
  initialState: { data: null, status: "idle", error: null, filters: {} },
  reducers: { setFilters(s, a) { s.filters = a.payload; } },
  extraReducers: (b) => {
    b.addCase(loadAnalytics.pending,   (s) => { s.status = "loading"; s.error = null; })
     .addCase(loadAnalytics.fulfilled, (s, a) => { s.status = "ok"; s.data = a.payload; })
     .addCase(loadAnalytics.rejected,  (s, a) => { s.status = "fail"; s.error = a.payload; });
  },
});
export const { setFilters } = slice.actions;
export default slice.reducer;
```

Register in the store.

---

## 6.5 Chart components

### `react/src/components/analytics/ApproachKpis.jsx`

```jsx
import React from "react";
import { Row, Col, Card, Statistic } from "antd";

export default function ApproachKpis({ kpis }) {
  return (
    <Row gutter={16}>
      {kpis.map((k) => (
        <Col xs={24} md={8} key={k.approach}>
          <Card title={k.approach.toUpperCase()} size="small">
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="Mean accuracy" value={k.meanAccuracy == null ? "—" : (k.meanAccuracy * 100).toFixed(1) + "%"} />
              </Col>
              <Col span={12}>
                <Statistic title="Scored runs" value={k.scoredCount} />
              </Col>
              <Col span={12}>
                <Statistic title="Mean latency" value={k.meanLatencyMs == null ? "—" : k.meanLatencyMs.toFixed(0) + " ms"} />
              </Col>
              <Col span={12}>
                <Statistic title="p95 latency" value={k.p95LatencyMs == null ? "—" : k.p95LatencyMs + " ms"} />
              </Col>
            </Row>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
```

### `react/src/components/analytics/AccuracyPerField.jsx`

Grouped bar chart via Recharts:

```jsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

export default function AccuracyPerField({ data }) {
  const rows = data.map((d) => ({
    field: d.field,
    classical: d.classical == null ? 0 : Math.round(d.classical * 100),
    vlm:       d.vlm       == null ? 0 : Math.round(d.vlm * 100),
    hybrid:    d.hybrid    == null ? 0 : Math.round(d.hybrid * 100),
  }));
  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="field" />
          <YAxis unit="%" domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Bar dataKey="classical" fill="#1677ff" />
          <Bar dataKey="vlm"       fill="#fa8c16" />
          <Bar dataKey="hybrid"    fill="#52c41a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### `react/src/components/analytics/LatencyBoxplot.jsx`

Recharts doesn't ship a box plot out of the box; show a "range bar" with
p25–p75 and a dot at p50:

```jsx
import React from "react";
import { ComposedChart, Bar, Scatter, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function LatencyBoxplot({ latency }) {
  const data = latency.map((l) => ({
    approach: l.approach,
    low: l.p25 ?? 0,
    high: l.p75 ?? 0,
    median: l.p50 ?? 0,
    p95: l.p95 ?? 0,
    mean: l.mean ?? 0,
    range: [l.p25 ?? 0, l.p75 ?? 0],
  }));
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} layout="vertical" margin={{ left: 40 }}>
          <XAxis type="number" unit=" ms" />
          <YAxis type="category" dataKey="approach" />
          <Tooltip />
          <Legend />
          <Bar dataKey="range" fill="#91caff" />
          <Scatter dataKey="median" fill="#1677ff" />
          <Scatter dataKey="p95" fill="#ff4d4f" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### `react/src/components/analytics/CalibrationChart.jsx`

```jsx
import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

export default function CalibrationChart({ data }) {
  const rows = data.map((d) => ({
    bin: d.bin,
    classical: d.classical == null ? null : Math.round(d.classical * 100),
    vlm:       d.vlm       == null ? null : Math.round(d.vlm * 100),
    hybrid:    d.hybrid    == null ? null : Math.round(d.hybrid * 100),
  }));
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bin" />
          <YAxis domain={[0, 100]} unit="%" />
          <Tooltip />
          <Legend />
          <ReferenceLine stroke="#999" strokeDasharray="4 4" ifOverflow="extendDomain" segment={[{x:"0.0–0.1", y:0}, {x:"0.9–1.0", y:100}]} />
          <Line dataKey="classical" stroke="#1677ff" connectNulls />
          <Line dataKey="vlm"       stroke="#fa8c16" connectNulls />
          <Line dataKey="hybrid"    stroke="#52c41a" connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

## 6.6 The AnalyticsPage

### `react/src/pages/AnalyticsPage.jsx`

```jsx
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Space, DatePicker, Select, Button, Typography, Tag, Alert, Spin } from "antd";
import { loadAnalytics, setFilters } from "../features/analytics/analyticsSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";
import ApproachKpis from "../components/analytics/ApproachKpis";
import AccuracyPerField from "../components/analytics/AccuracyPerField";
import LatencyBoxplot from "../components/analytics/LatencyBoxplot";
import CalibrationChart from "../components/analytics/CalibrationChart";

const { RangePicker } = DatePicker;
const { Title } = Typography;

export default function AnalyticsPage() {
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((s) => s.analytics);
  const { items: docTypes } = useSelector((s) => s.documentTypes);
  const [docType, setDocType] = useState(undefined);
  const [range, setRange] = useState([null, null]);

  useEffect(() => { dispatch(loadDocumentTypes()); dispatch(loadAnalytics({})); }, [dispatch]);

  const apply = () => {
    const filters = {};
    if (docType) filters.documentType = docType;
    if (range[0]) filters.from = range[0].toISOString();
    if (range[1]) filters.to   = range[1].toISOString();
    dispatch(setFilters(filters));
    dispatch(loadAnalytics(filters));
  };

  return (
    <div>
      <Title level={3}>Analytics</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Document type" allowClear style={{ width: 180 }}
            value={docType} onChange={setDocType}
            options={docTypes.map((d) => ({ value: d.key, label: d.name }))}
          />
          <RangePicker value={range} onChange={(v) => setRange(v || [null, null])} />
          <Button type="primary" onClick={apply}>Apply</Button>
          <Button onClick={() => { setDocType(undefined); setRange([null, null]); dispatch(loadAnalytics({})); }}>
            Reset
          </Button>
        </Space>
      </Card>

      {status === "loading" && <Spin />}
      {status === "fail" && <Alert type="error" message={String(error)} />}
      {data && (
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <Card>
            <Space>
              <Tag>Total runs: {data.totalRuns}</Tag>
              <Tag color="green">With GT: {data.withGroundTruth}</Tag>
            </Space>
          </Card>
          <ApproachKpis kpis={data.kpis} />
          <Card title="Accuracy per field">
            <AccuracyPerField data={data.perField} />
          </Card>
          <Card title="Latency distribution (p25 – p75 bar, dots at p50 and p95)">
            <LatencyBoxplot latency={data.latency} />
          </Card>
          <Card title="Confidence calibration (confidence bin vs mean accuracy)">
            <CalibrationChart data={data.calibration} />
          </Card>
        </Space>
      )}
    </div>
  );
}
```

Register in `App.js`:

```jsx
<Menu.Item key="/analytics"><Link to="/analytics">Analytics</Link></Menu.Item>
// ...
<Route path="/analytics" element={<AnalyticsPage />} />
```

---

## 6.7 Manual test script

1. Ensure you have 10+ runs with ground truth (benchmark run from Stage 5
   is the easiest way).
2. Open `/analytics`. Three KPI cards appear with mean accuracy, scored
   count, mean latency, p95.
3. The "Accuracy per field" bar chart shows one bar per field, three colours.
   Fields with no GT data appear as 0 (accepted for MVP).
4. Latency box plot shows three horizontal bars with dots for p50 / p95.
5. Calibration chart shows three lines from low to high confidence bins.
   A straight diagonal indicates perfect calibration.
6. Apply a `documentType` filter and/or a date range, press **Apply** — all
   four cards update.

---

## 6.8 Common pitfalls

- **`perField` is empty**: you need runs with ground truth. Without GT there
  are no `FieldScore`s to aggregate.
- **Calibration lines are flat near 0**: normal for small samples. Increase
  the dataset.
- **Recharts boxplot looks weird**: it is a stylised range bar, not a true
  box plot. If you need proper boxes, swap to `@observablehq/plot` or
  `victory-native` — out of scope here.
- **`analytics/summary` is slow**: every call reads `metrics.json` per run.
  For thousands of runs, cache the result per filter key in memory for 60s.

---

## 6.9 Definition of Done

- [ ] `GET /api/analytics/summary` returns KPIs, per-field accuracy,
      latency distributions, and calibration bins.
- [ ] AnalyticsPage loads under `/analytics` and is reachable from the nav.
- [ ] Filters (document type, date range) actually narrow the numbers.
- [ ] The four visual cards render without throwing (even when some data is missing).
- [ ] Commit: `stage-06: analytics dashboard`.
