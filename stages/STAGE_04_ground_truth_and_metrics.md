# Stage 4 — Ground truth editor and metrics library

> **Goal:** Let the user enter a "correct answer" for any run, score every
> approach against it with a proper metrics library (exact / fuzzy / numeric /
> date / order lines), and persist `ground_truth.json` + `metrics.json` on
> disk. The UI shows per‑field ticks and crosses and an overall score per
> approach.

**Estimated time for a beginner:** 10 – 14 hours split over 3 sessions.

**Dependencies:** Stage 3 done.

**Affected areas:** `api/` (metrics library, GT endpoint) and `react/`
(editor drawer, status chips in columns, summary on runs list).

---

## 4.1 Prerequisites

- Runs list shows at least 3 runs, some clearly "wrong" in some field so
  the UI actually has colour to display.
- Install one small dependency for the Hungarian algorithm:

  ```powershell
  cd D:/Master/service/application/api
  yarn add munkres-js
  yarn add -D @types/munkres-js    # types may not exist; see note below
  ```

  If `@types/munkres-js` is missing, create a stub
  `api/src/types/munkres-js.d.ts`:

  ```ts
  declare module "munkres-js" {
    const munkres: (matrix: number[][]) => number[][];
    export default munkres;
  }
  ```

Create a branch:

```powershell
cd D:/Master/service/application
git checkout -b stage-04-ground-truth-metrics
```

---

## 4.2 Plan of files

```
api/src/
  services/
    metrics.ts              NEW — normalize, fieldMatch, cer, orderMatch, scoreRun, aggregate
  controllers/
    runsController.ts       MODIFY — add putGroundTruth handler; on compare, compute metrics if GT exists
  routes/
    runs.ts                 MODIFY — PUT /runs/:id/ground-truth
  types/
    munkres-js.d.ts         NEW (if @types/munkres-js unavailable)

react/src/
  api/compare.js            MODIFY — putGroundTruthApi
  features/runs/runsSlice.js MODIFY — saveGroundTruth thunk
  components/compare/
    FieldCell.jsx           MODIFY — show GT tick/cross overlay
    GroundTruthDrawer.jsx   NEW — JSON editor side panel
    ScoreBadge.jsx          NEW — small accuracy % badge per approach
  pages/
    ComparePage.jsx         MODIFY — open drawer button, show scores
    RunDetailPage.jsx       MODIFY — same
    RunsPage.jsx            MODIFY — show best-approach column + score
```

---

## 4.3 Metrics library

### File to create: `api/src/services/metrics.ts`

```ts
// api/src/services/metrics.ts
import munkres from "munkres-js";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type FieldType = "text" | "number" | "money" | "date";

export interface FieldSpec {
  key: string;
  type: FieldType;
  formats?: string[];    // for dates
  tolerance?: number;    // for numbers / money
}

export interface ArraySpec {
  key: string;
  rowKey: string;
  match?: "hungarian";
  fields: FieldSpec[];
}

export interface Schema {
  fields: FieldSpec[];
  arrays: ArraySpec[];
}

export type MatchStatus = "exact" | "fuzzy" | "miss" | "missing_gt" | "missing_pred";

export interface FieldScore {
  key: string;
  status: MatchStatus;
  predicted: any;
  expected: any;
  score: number;  // 0..1
}

export interface ArrayRowScore {
  index: number;
  fields: FieldScore[];
  score: number; // mean of per-field scores
}

export interface ApproachScore {
  fields: FieldScore[];          // top-level fields
  arrays: Record<string, ArrayRowScore[]>;
  meanFieldScore: number;        // average over fields + array rows
  counts: { exact: number; fuzzy: number; miss: number; total: number };
}

export type ApproachKey = "classical" | "vlm" | "hybrid";

export interface RunMetrics {
  perApproach: Record<ApproachKey, ApproachScore | null>;
  summary: Record<ApproachKey, number>;  // 0..1 accuracy for the list UI
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                      */
/* ------------------------------------------------------------------ */

export function normalizeText(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = String(v).replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse dates in the formats declared on the schema. We only support the
 * common shapes used in receipts here; extend as needed.
 */
export function normalizeDate(v: unknown, _formats?: string[]): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();

  // DD.MM.YY or DD.MM.YYYY
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
    const d = parseInt(dd, 10);
    const mo = parseInt(mm, 10);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${year.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }

  // ISO yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;

  return null;
}

/* ------------------------------------------------------------------ */
/* Distance utilities                                                 */
/* ------------------------------------------------------------------ */

/** Levenshtein distance. O(|a|*|b|) — fine for short strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0);
  const cur = new Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** Character Error Rate normalised to [0, 1]. 0 is perfect. */
export function cer(pred: string, gt: string): number {
  if (!gt) return pred ? 1 : 0;
  const d = levenshtein(pred, gt);
  return Math.min(1, d / Math.max(1, gt.length));
}

/* ------------------------------------------------------------------ */
/* Field matching                                                     */
/* ------------------------------------------------------------------ */

export function fieldMatch(pred: any, gt: any, spec: FieldSpec): FieldScore {
  const base: Omit<FieldScore, "status" | "score"> = {
    key: spec.key,
    predicted: pred,
    expected: gt,
  };

  const gtMissing = gt === undefined || gt === null || gt === "";
  const predMissing = pred === undefined || pred === null || pred === "";

  if (gtMissing) return { ...base, status: "missing_gt", score: 0 };
  if (predMissing) return { ...base, status: "missing_pred", score: 0 };

  if (spec.type === "number" || spec.type === "money") {
    const p = normalizeNumber(pred);
    const g = normalizeNumber(gt);
    if (p == null || g == null) return { ...base, status: "miss", score: 0 };
    const tol = spec.tolerance ?? 0;
    if (Math.abs(p - g) <= tol) return { ...base, status: "exact", score: 1 };
    const diff = Math.abs(p - g) / Math.max(1, Math.abs(g));
    return { ...base, status: "miss", score: Math.max(0, 1 - diff) };
  }

  if (spec.type === "date") {
    const p = normalizeDate(pred, spec.formats);
    const g = normalizeDate(gt, spec.formats);
    if (p && g && p === g) return { ...base, status: "exact", score: 1 };
    return { ...base, status: "miss", score: 0 };
  }

  // text
  const p = normalizeText(pred);
  const g = normalizeText(gt);
  if (p === g) return { ...base, status: "exact", score: 1 };
  const e = cer(p, g);
  if (e <= 0.2) return { ...base, status: "fuzzy", score: 1 - e };
  return { ...base, status: "miss", score: 1 - e };
}

/* ------------------------------------------------------------------ */
/* Array (line items) matching via Hungarian assignment               */
/* ------------------------------------------------------------------ */

export function orderMatch(
  predRows: any[],
  gtRows: any[],
  spec: ArraySpec
): ArrayRowScore[] {
  const n = Math.max(predRows.length, gtRows.length);
  if (n === 0) return [];

  // Build cost matrix: cost = 1 - similarity(NAME), extended with padding.
  const cost: number[][] = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < predRows.length; i++) {
    for (let j = 0; j < gtRows.length; j++) {
      const a = normalizeText(predRows[i]?.[spec.rowKey]);
      const b = normalizeText(gtRows[j]?.[spec.rowKey]);
      cost[i][j] = a && b ? cer(a, b) : 1;
    }
  }

  const assignment: number[][] = munkres(cost);

  const rows: ArrayRowScore[] = [];
  for (const [i, j] of assignment) {
    const predRow = predRows[i];
    const gtRow = gtRows[j];
    if (!predRow || !gtRow) continue;

    const fieldScores = spec.fields.map((f) =>
      fieldMatch(predRow[f.key], gtRow[f.key], f)
    );
    const mean =
      fieldScores.reduce((s, f) => s + f.score, 0) /
      Math.max(1, fieldScores.length);
    rows.push({ index: i, fields: fieldScores, score: mean });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/* Per-approach scoring                                               */
/* ------------------------------------------------------------------ */

export function scoreApproach(
  approachResult: any,
  gt: any,
  schema: Schema
): ApproachScore {
  const predFields = approachResult?.fields ?? {};
  const gtFields = gt ?? {};

  const fieldScores = schema.fields.map((f) =>
    fieldMatch(predFields[f.key], gtFields[f.key], f)
  );

  const arrays: Record<string, ArrayRowScore[]> = {};
  for (const a of schema.arrays) {
    arrays[a.key] = orderMatch(
      Array.isArray(predFields[a.key]) ? predFields[a.key] : [],
      Array.isArray(gtFields[a.key])   ? gtFields[a.key]   : [],
      a
    );
  }

  const arrayAllScores = Object.values(arrays).flat().map((r) => r.score);
  const all = [...fieldScores.map((f) => f.score), ...arrayAllScores];

  const counts = fieldScores.reduce(
    (acc, f) => {
      acc.total++;
      if (f.status === "exact") acc.exact++;
      else if (f.status === "fuzzy") acc.fuzzy++;
      else if (f.status === "miss" || f.status === "missing_pred") acc.miss++;
      return acc;
    },
    { exact: 0, fuzzy: 0, miss: 0, total: 0 }
  );

  return {
    fields: fieldScores,
    arrays,
    meanFieldScore: all.length ? all.reduce((s, v) => s + v, 0) / all.length : 0,
    counts,
  };
}

/* ------------------------------------------------------------------ */
/* Full run metrics                                                   */
/* ------------------------------------------------------------------ */

export function scoreRun(
  artifacts: { classical: any; vlm: any; hybrid: any },
  gt: any,
  schema: Schema
): RunMetrics {
  const perApproach: RunMetrics["perApproach"] = {
    classical: artifacts.classical ? scoreApproach(artifacts.classical, gt, schema) : null,
    vlm:       artifacts.vlm       ? scoreApproach(artifacts.vlm,       gt, schema) : null,
    hybrid:    artifacts.hybrid    ? scoreApproach(artifacts.hybrid,    gt, schema) : null,
  };
  const summary: RunMetrics["summary"] = {
    classical: perApproach.classical?.meanFieldScore ?? 0,
    vlm:       perApproach.vlm?.meanFieldScore       ?? 0,
    hybrid:    perApproach.hybrid?.meanFieldScore    ?? 0,
  };
  return { perApproach, summary };
}
```

**Beginner notes:**
- `fieldMatch` returns a rich object so the UI can colour cells exactly
  (exact = green, fuzzy = amber, miss = red, `missing_pred` = grey cross,
  `missing_gt` = info icon meaning "we can't score this one").
- `orderMatch` uses Hungarian assignment so rows don't have to be in the
  same order across approaches. If the classical approach returns order
  lines in a different order from ground truth, rows are paired by name
  similarity before scoring.
- All thresholds (0.2 CER for fuzzy text match, `tolerance` per numeric
  field) live in one place and can be tweaked later.

---

## 4.4 Hook metrics into the runs controller

### File to modify: `api/src/controllers/runsController.ts`

Add a helper to (re)compute metrics for a run and a new handler for the
ground‑truth endpoint.

Add imports:

```ts
import { artifactPath } from "../services/runStorage";
import { readJson, writeJson } from "../services/runStorage";
import { scoreRun, Schema } from "../services/metrics";
import { DocumentType } from "../entities/DocumentType";
```

Add helper below the existing handlers:

```ts
async function recomputeAndPersistMetrics(runId: number) {
  const run = await ComparisonRun.findOneBy({ id: runId });
  if (!run) return;

  const gt = await readJson(artifactPath(runId, "ground_truth"));
  if (!gt) {
    run.hasGroundTruth = false;
    run.summary = null;
    await run.save();
    return;
  }

  const dt = await DocumentType.findOneBy({ key: run.documentType });
  if (!dt) return;
  const schema = dt.schema as Schema;

  const [classical, vlm, hybrid] = await Promise.all([
    readJson(artifactPath(runId, "classical")),
    readJson(artifactPath(runId, "vlm")),
    readJson(artifactPath(runId, "hybrid")),
  ]);

  const metrics = scoreRun({ classical, vlm, hybrid }, gt, schema);
  await writeJson(artifactPath(runId, "metrics"), metrics);

  run.hasGroundTruth = true;
  run.summary = metrics.summary;
  await run.save();
}
```

Add the PUT handler:

```ts
export const putGroundTruth = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const run = await ComparisonRun.findOneBy({ id });
  if (!run) return res.status(404).json({ error: "Not found" });

  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Body must be a JSON object" });
  }

  await writeJson(artifactPath(id, "ground_truth"), body);
  await recomputeAndPersistMetrics(id);

  const updated = await ComparisonRun.findOneBy({ id });
  const [gt, metrics] = await Promise.all([
    readJson(artifactPath(id, "ground_truth")),
    readJson(artifactPath(id, "metrics")),
  ]);
  res.json({ run: updated, groundTruth: gt, metrics });
};

export const deleteGroundTruth = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const run = await ComparisonRun.findOneBy({ id });
  if (!run) return res.status(404).json({ error: "Not found" });

  const fs = await import("fs");
  for (const name of ["ground_truth", "metrics"] as const) {
    const p = artifactPath(id, name);
    if (fs.existsSync(p)) await fs.promises.unlink(p);
  }
  run.hasGroundTruth = false;
  run.summary = null;
  await run.save();
  res.json({ run });
};
```

### File to modify: `api/src/routes/runs.ts`

```ts
import { putGroundTruth, deleteGroundTruth } from "../controllers/runsController";
// ...
router.put("/runs/:id/ground-truth", asyncHandler(putGroundTruth));
router.delete("/runs/:id/ground-truth", asyncHandler(deleteGroundTruth));
```

### Test with curl

```powershell
$token = "<JWT>"
$body = '{ "DATE":"27.12.25", "FB":"11722", "FD":"11733", "SUM":"329.00", "ORDER":[{"NAME":"Tsingtao Premium Lager","PRICE":"329.00","QUANTITY":1}] }'
curl.exe -X PUT "http://localhost:3000/api/runs/1/ground-truth" `
  -H "Authorization: Bearer $token" -H "Content-Type: application/json" `
  -d $body
```

Response must include `run.summary` like `{ classical: 0.7, vlm: 0.95, hybrid: 0.85 }`.

Verify on disk:

```
api/tmp/runs/1/
  ground_truth.json
  metrics.json
```

`DELETE /api/runs/1/ground-truth` must remove both files and set
`has_ground_truth=false`, `summary=null`.

---

## 4.5 Frontend: API + slice

### File to modify: `react/src/api/compare.js`

```js
export const putGroundTruthApi = (id, groundTruth) =>
  client.put(`/api/runs/${id}/ground-truth`, groundTruth);

export const deleteGroundTruthApi = (id) =>
  client.delete(`/api/runs/${id}/ground-truth`);
```

### File to modify: `react/src/features/runs/runsSlice.js`

Add the thunks:

```js
import { putGroundTruthApi, deleteGroundTruthApi } from "../../api/compare";

export const saveGroundTruth = createAsyncThunk(
  "runs/saveGroundTruth",
  async ({ id, groundTruth }, { rejectWithValue }) => {
    try {
      const { data } = await putGroundTruthApi(id, groundTruth);
      return data; // { run, groundTruth, metrics }
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const clearGroundTruth = createAsyncThunk(
  "runs/clearGroundTruth",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await deleteGroundTruthApi(id);
      return data.run;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);
```

Extend `extraReducers`:

```js
.addCase(saveGroundTruth.fulfilled, (s, a) => {
  if (s.detail && s.detail.run.id === a.payload.run.id) {
    s.detail.run = a.payload.run;
    s.detail.artifacts.groundTruth = a.payload.groundTruth;
    s.detail.artifacts.metrics = a.payload.metrics;
  }
  const idx = s.items.findIndex((r) => r.id === a.payload.run.id);
  if (idx >= 0) s.items[idx] = a.payload.run;
})
.addCase(clearGroundTruth.fulfilled, (s, a) => {
  if (s.detail && s.detail.run.id === a.payload.id) {
    s.detail.run = a.payload;
    s.detail.artifacts.groundTruth = null;
    s.detail.artifacts.metrics = null;
  }
  const idx = s.items.findIndex((r) => r.id === a.payload.id);
  if (idx >= 0) s.items[idx] = a.payload;
});
```

---

## 4.6 Ground‑Truth drawer UI

### File to create: `react/src/components/compare/GroundTruthDrawer.jsx`

```jsx
// react/src/components/compare/GroundTruthDrawer.jsx
import React, { useState, useEffect } from "react";
import { Drawer, Button, Space, Input, Alert, Popconfirm, message } from "antd";
import { useDispatch } from "react-redux";
import { saveGroundTruth, clearGroundTruth } from "../../features/runs/runsSlice";

const { TextArea } = Input;

export default function GroundTruthDrawer({ open, onClose, runId, initialGt }) {
  const dispatch = useDispatch();
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError(null);
    setText(initialGt ? JSON.stringify(initialGt, null, 2) : "{\n  \n}");
  }, [initialGt, open]);

  const onSave = async () => {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { setError("Invalid JSON: " + e.message); return; }
    setSaving(true);
    try {
      await dispatch(saveGroundTruth({ id: runId, groundTruth: parsed })).unwrap();
      message.success("Ground truth saved; metrics recomputed");
      onClose();
    } catch (err) {
      setError(String(err));
    } finally { setSaving(false); }
  };

  const onClear = async () => {
    try {
      await dispatch(clearGroundTruth(runId)).unwrap();
      message.success("Ground truth removed");
      onClose();
    } catch (err) { message.error(String(err)); }
  };

  return (
    <Drawer title={`Ground truth — Run #${runId}`} open={open} onClose={onClose} width={520}>
      <Space direction="vertical" style={{ width: "100%" }}>
        {error && <Alert type="error" message={error} />}
        <TextArea
          rows={20}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          style={{ fontFamily: "monospace" }}
        />
        <Space>
          <Button type="primary" loading={saving} onClick={onSave}>Save</Button>
          <Button onClick={onClose}>Cancel</Button>
          {initialGt && (
            <Popconfirm title="Remove ground truth?" onConfirm={onClear}>
              <Button danger>Remove</Button>
            </Popconfirm>
          )}
        </Space>
      </Space>
    </Drawer>
  );
}
```

### File to create: `react/src/components/compare/ScoreBadge.jsx`

```jsx
// react/src/components/compare/ScoreBadge.jsx
import React from "react";
import { Tag } from "antd";

export default function ScoreBadge({ score }) {
  if (score == null) return <Tag>—</Tag>;
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? "green" : pct >= 70 ? "gold" : pct >= 50 ? "orange" : "red";
  return <Tag color={color}>{pct}%</Tag>;
}
```

### File to modify: `react/src/components/compare/FieldCell.jsx`

Accept an optional `fieldScore` (from metrics.json) and render an icon
beside the value:

```jsx
import { CheckCircleTwoTone, CloseCircleTwoTone, MinusCircleTwoTone } from "@ant-design/icons";

export default function FieldCell({ value, agreement, fieldScore }) {
  const color =
    agreement === "all"   ? "#d9f7be" :
    agreement === "two"   ? "#fff1b8" :
    agreement === "alone" ? "#ffa39e" :
                            "#f5f5f5";

  const icon =
    !fieldScore ? null :
    fieldScore.status === "exact" ? <CheckCircleTwoTone twoToneColor="#52c41a" /> :
    fieldScore.status === "fuzzy" ? <CheckCircleTwoTone twoToneColor="#faad14" /> :
    fieldScore.status === "miss"  ? <CloseCircleTwoTone twoToneColor="#ff4d4f" /> :
    <MinusCircleTwoTone twoToneColor="#bfbfbf" />;

  return (
    <div style={{ background: color, padding: "4px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 8 }}>
      {icon}
      <div style={{ flex: 1, wordBreak: "break-word" }}>
        {value == null || value === "" ? <span style={{ color: "#888" }}>∅</span>
         : typeof value === "object" ? <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(value, null, 2)}</pre>
         : String(value)}
      </div>
    </div>
  );
}
```

### File to modify: `react/src/components/compare/ApproachColumn.jsx`

Accept `fieldScoresByKey` (map `FIELD_KEY -> FieldScore`) and a `score`
number. Render `ScoreBadge` in the header and pass `fieldScore` into
`FieldCell`:

```jsx
import ScoreBadge from "./ScoreBadge";

export default function ApproachColumn({ title, data, timeMs, agreements, schemaFields, schemaArrays, score, fieldScoresByKey }) {
  // ... same as before, but in the header replace the Statistic row with:
  return (
    <Card
      title={<span>{title} <ScoreBadge score={score} /></span>}
      size="small"
    >
      // ... unchanged body, but inside the map:
      schemaFields.map((f) => (
        <Descriptions.Item key={f.key} label={f.label || f.key}>
          <FieldCell
            value={fields[f.key]}
            agreement={agreements[f.key]}
            fieldScore={fieldScoresByKey?.[f.key]}
          />
        </Descriptions.Item>
      ))
      // ...
    </Card>
  );
}
```

---

## 4.7 Compare / detail page integration

### File to modify: `react/src/pages/ComparePage.jsx`

- Import the drawer and `saveGroundTruth`.
- Add a button "Ground truth" next to "Reset".
- After a comparison result, extract metrics from `artifacts` in the Redux
  state — **note**: Compare flow doesn't load metrics directly; it gets
  `response.*` only. To make metrics appear here, dispatch
  `loadRunDetail(runId)` once the comparison is fulfilled, then read
  `runs.detail.artifacts.metrics`. Pattern:

```jsx
import { loadRunDetail, clearDetail } from "../features/runs/runsSlice";

useEffect(() => {
  if (status === "ok" && currentRunId) dispatch(loadRunDetail(currentRunId));
}, [status, currentRunId, dispatch]);
useEffect(() => () => dispatch(clearDetail()), [dispatch]);
```

Read metrics and GT from `useSelector((s) => s.runs.detail)`:

```jsx
const detail = useSelector((s) => s.runs.detail);
const metrics = detail?.artifacts?.metrics || null;
const gt      = detail?.artifacts?.groundTruth || null;

const fieldScoresByKey = (approach) => {
  const list = metrics?.perApproach?.[approach]?.fields || [];
  return Object.fromEntries(list.map((f) => [f.key, f]));
};
const scoreFor = (approach) => metrics?.summary?.[approach] ?? null;
```

Pass `score={scoreFor('classical')}` and
`fieldScoresByKey={fieldScoresByKey('classical')}` (and so on) into each
`ApproachColumn`.

Add a button + drawer:

```jsx
import GroundTruthDrawer from "../components/compare/GroundTruthDrawer";
const [gtOpen, setGtOpen] = useState(false);
// inside the top action bar:
<Button onClick={() => setGtOpen(true)} disabled={!currentRunId}>
  {gt ? "Edit ground truth" : "Add ground truth"}
</Button>
<GroundTruthDrawer
  open={gtOpen}
  onClose={() => setGtOpen(false)}
  runId={currentRunId}
  initialGt={gt}
/>
```

### File to modify: `react/src/pages/RunDetailPage.jsx`

Same pattern: metrics are already in `detail.artifacts.metrics`, GT in
`detail.artifacts.groundTruth`. Wire the badge + drawer + icons. No new
fetch is needed because `loadRunDetail` already returns them.

### File to modify: `react/src/pages/RunsPage.jsx`

Add two columns:

```jsx
{
  title: "Best", key: "best", width: 110,
  render: (_, rec) => {
    const s = rec.summary;
    if (!s) return "—";
    const best = Object.entries(s).reduce((a, b) => (b[1] > a[1] ? b : a), ["-", -Infinity]);
    return <Tag color="geekblue">{best[0]} · {Math.round(best[1] * 100)}%</Tag>;
  },
},
{
  title: "Scores", key: "summary", width: 220,
  render: (_, rec) => !rec.summary ? "—" : (
    <Space size={4}>
      <Tag color="blue">C {Math.round(rec.summary.classical * 100)}%</Tag>
      <Tag color="orange">V {Math.round(rec.summary.vlm * 100)}%</Tag>
      <Tag color="green">H {Math.round(rec.summary.hybrid * 100)}%</Tag>
    </Space>
  ),
},
```

---

## 4.8 Manual test script

1. Restart the API (picks up new metrics library) and React.
2. Open a run detail page (`/runs/:id`) for a run with no GT.
   - Header shows "Run #N — filename".
   - Each approach column header shows `—` for its score badge.
3. Click **Add ground truth**. Drawer opens with `{}`.
4. Paste the correct JSON, e.g.:
   ```json
   {
     "DATE": "27.12.25",
     "FB": "11722",
     "FD": "11733",
     "SUM": "329.00",
     "ORDER": [
       { "NAME": "Tsingtao Premium Lager", "PRICE": "329.00", "QUANTITY": 1 }
     ]
   }
   ```
5. Press **Save**. Drawer closes; message appears. Column headers now show
   accuracy `%`. Each field cell shows a tick/cross icon next to the value.
6. `tmp/runs/<id>/` now contains `ground_truth.json` and `metrics.json`.
7. Navigate to `/runs`. The row has a "Best" column showing the winning
   approach, and the "Scores" column shows three percentages.
8. Change the GT (e.g. set `SUM` to `"999.99"`), save → scores drop.
9. Remove the GT → files gone on disk, badges revert to `—`, row summary
   cleared.
10. Compare page on a fresh run shows the GT button too; after saving the
    GT, the compare page shows badges and icons without navigating away.

---

## 4.9 Common pitfalls

- **Hungarian library absent**: if `yarn add munkres-js` failed, copy the
  algorithm from a simple gist or substitute a "by index" fallback that
  pairs rows in order. The fallback will over‑penalise approaches that
  emit rows in a different order, which is fine to start with — a TODO
  note is enough.
- **`normalizeDate` returns null on locale formats**: the sample data uses
  `DD.MM.YY`. If your dataset uses `MM/DD/YYYY`, extend the regex in
  `normalizeDate` rather than piling on schema hints.
- **Saved GT but metrics stay null**: confirm the run's `documentType`
  exists in the `document_types` table. `recomputeAndPersistMetrics` bails
  out if the document type is missing.
- **Metrics never appear on Compare page**: you probably forgot to
  dispatch `loadRunDetail(currentRunId)` after a successful comparison.
- **Drawer text area is hard to use**: it's a plain textarea. If beginners
  find it rough, swap it for `react-json-view-lite` in Stage 7 polish.

---

## 4.10 Definition of Done

- [ ] `api/src/services/metrics.ts` exists and exports `scoreRun` plus
      internals (`fieldMatch`, `cer`, `orderMatch`, `scoreApproach`).
- [ ] `PUT /api/runs/:id/ground-truth` writes `ground_truth.json` and
      `metrics.json` on disk and updates DB `summary` + `hasGroundTruth`.
- [ ] `DELETE /api/runs/:id/ground-truth` cleans both files and resets the DB fields.
- [ ] Ground‑Truth drawer opens from Compare and Detail pages, validates JSON,
      saves, clears.
- [ ] Each approach column shows a score badge (% 0‑100) with colour.
- [ ] Each field cell shows a tick/cross/minus icon based on the field status.
- [ ] Runs list shows Best + Scores columns for runs with GT.
- [ ] `hasGroundTruth=true` filter on `/api/runs` returns exactly the runs with GT.
- [ ] Commit: `stage-04: ground truth editor and metrics library`.
