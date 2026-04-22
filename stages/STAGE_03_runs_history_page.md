# Stage 3 — Runs history page and navigation rework

> **Goal:** Let users browse every comparison they ever ran, filter/search the
> list, open a run in read‑only mode, delete it, and remove the now‑legacy
> Detect/Models/ModelFiles navigation.

**Estimated time for a beginner:** 5 – 7 hours.

**Dependencies:** Stage 2 done and tested.

**Affected areas:** React (mostly) and a small backend cleanup.

---

## 3.1 Prerequisites

- At least 3 comparison runs exist in the DB (so the list is meaningful).
  If not, run 3 comparisons from the Compare page before starting.
- Branch:

  ```powershell
  cd D:/Master/service/application
  git checkout -b stage-03-runs-history
  ```

---

## 3.2 Plan of files

```
react/src/
  api/
    compare.js            MODIFY — add listRuns and deleteRun helpers
  features/
    runs/
      runsSlice.js        NEW — Redux slice for runs list + filters
    store/store.js        MODIFY — register runs reducer
  pages/
    RunsPage.jsx          NEW — the history / listing page
    RunDetailPage.jsx     NEW — read-only view of a specific run (reuses Stage 2 components)
  App.js                  MODIFY — routes + menu rework
api/
  src/routes/index.ts     MODIFY — remove /detect mount, drop unused imports (optional)
```

---

## 3.3 API layer additions

### File to modify: `react/src/api/compare.js`

Append:

```js
/**
 * GET /api/runs
 * @param {object} params - { search, documentType, hasGroundTruth, limit, offset, dateFrom, dateTo }
 */
export const listRunsApi = (params = {}) => client.get("/api/runs", { params });

export const deleteRunApi = (id) => client.delete(`/api/runs/${id}`);
```

---

## 3.4 Runs slice

### File to create: `react/src/features/runs/runsSlice.js`

```js
// react/src/features/runs/runsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { listRunsApi, deleteRunApi, fetchRun } from "../../api/compare";

export const loadRuns = createAsyncThunk(
  "runs/load",
  async (_, { getState, rejectWithValue }) => {
    const { filters, pagination } = getState().runs;
    const params = {
      limit: pagination.pageSize,
      offset: (pagination.current - 1) * pagination.pageSize,
      ...filters,
    };
    try {
      const { data } = await listRunsApi(params);
      return data; // { total, items }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const loadRunDetail = createAsyncThunk(
  "runs/loadDetail",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await fetchRun(id);
      return data; // { run, artifacts }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const deleteRun = createAsyncThunk(
  "runs/delete",
  async (id, { rejectWithValue }) => {
    try {
      await deleteRunApi(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const slice = createSlice({
  name: "runs",
  initialState: {
    items: [],
    total: 0,
    status: "idle",
    error: null,
    filters: {
      search: undefined,
      documentType: undefined,
      hasGroundTruth: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    },
    pagination: { current: 1, pageSize: 20 },

    detail: null,        // { run, artifacts }
    detailStatus: "idle",
    detailError: null,
  },
  reducers: {
    setFilters(s, a) {
      s.filters = { ...s.filters, ...a.payload };
    },
    setPagination(s, a) {
      s.pagination = { ...s.pagination, ...a.payload };
    },
    clearDetail(s) { s.detail = null; s.detailStatus = "idle"; s.detailError = null; },
  },
  extraReducers: (b) => {
    b.addCase(loadRuns.pending,   (s) => { s.status = "loading"; s.error = null; })
     .addCase(loadRuns.fulfilled, (s, a) => {
       s.status = "ok";
       s.items = a.payload.items;
       s.total = a.payload.total;
     })
     .addCase(loadRuns.rejected,  (s, a) => { s.status = "fail"; s.error = a.payload; })

     .addCase(loadRunDetail.pending,   (s) => { s.detailStatus = "loading"; s.detailError = null; })
     .addCase(loadRunDetail.fulfilled, (s, a) => { s.detailStatus = "ok"; s.detail = a.payload; })
     .addCase(loadRunDetail.rejected,  (s, a) => { s.detailStatus = "fail"; s.detailError = a.payload; })

     .addCase(deleteRun.fulfilled, (s, a) => {
       s.items = s.items.filter((r) => r.id !== a.payload);
       s.total = Math.max(0, s.total - 1);
     });
  },
});

export const { setFilters, setPagination, clearDetail } = slice.actions;
export default slice.reducer;
```

### Register in `react/src/features/store/store.js`

```js
import runsReducer from "../runs/runsSlice";
// ...
reducer: {
  auth: authReducer,
  models: modelsReducer,
  modelFiles: modelFilesReducer,
  comparison: comparisonReducer,
  documentTypes: documentTypesReducer,
  runs: runsReducer,
},
```

---

## 3.5 RunsPage (the history listing)

### File to create: `react/src/pages/RunsPage.jsx`

```jsx
// react/src/pages/RunsPage.jsx
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  Table, Tag, Input, Button, Space, Popconfirm, Select, DatePicker, Image, Tooltip, message,
} from "antd";
import {
  ReloadOutlined, DeleteOutlined, EyeOutlined, CheckCircleTwoTone, CloseCircleTwoTone,
} from "@ant-design/icons";
import { loadRuns, setFilters, setPagination, deleteRun } from "../features/runs/runsSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";
import { runImageUrl } from "../api/compare";

const { RangePicker } = DatePicker;

export default function RunsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { items, total, status, filters, pagination } = useSelector((s) => s.runs);
  const { items: docTypes } = useSelector((s) => s.documentTypes);

  const [search, setSearch] = useState(filters.search || "");
  const [docTypeFilter, setDocTypeFilter] = useState(filters.documentType);
  const [gtFilter, setGtFilter] = useState(filters.hasGroundTruth);
  const [dateRange, setDateRange] = useState([null, null]);

  useEffect(() => {
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  useEffect(() => {
    dispatch(loadRuns());
  }, [dispatch, filters, pagination]);

  const applyFilters = () => {
    dispatch(setFilters({
      search: search || undefined,
      documentType: docTypeFilter,
      hasGroundTruth: gtFilter,
      dateFrom: dateRange[0]?.toISOString(),
      dateTo:   dateRange[1]?.toISOString(),
    }));
    dispatch(setPagination({ current: 1 }));
  };

  const resetAll = () => {
    setSearch(""); setDocTypeFilter(undefined); setGtFilter(undefined); setDateRange([null, null]);
    dispatch(setFilters({
      search: undefined, documentType: undefined, hasGroundTruth: undefined,
      dateFrom: undefined, dateTo: undefined,
    }));
    dispatch(setPagination({ current: 1 }));
  };

  const onDelete = async (id) => {
    try {
      await dispatch(deleteRun(id)).unwrap();
      message.success("Deleted");
    } catch (err) {
      message.error(String(err));
    }
  };

  const columns = [
    {
      title: "Image", dataIndex: "id", width: 80,
      render: (id) => (
        <Image
          width={56} height={56}
          src={runImageUrl(id)}
          preview={{ mask: <EyeOutlined /> }}
          style={{ objectFit: "cover", borderRadius: 4 }}
          fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="
        />
      ),
    },
    { title: "ID", dataIndex: "id", width: 80 },
    { title: "Filename", dataIndex: "filename", ellipsis: true },
    {
      title: "Doc type", dataIndex: "documentType", width: 110,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: "Recommended", dataIndex: "recommended", width: 130,
      render: (v) => (v ? <Tag color="green">{v}</Tag> : <Tag>—</Tag>),
    },
    {
      title: "Timings (ms)", dataIndex: "timings", width: 200,
      render: (t) => !t ? "—" : (
        <Space size={4}>
          <Tag color="blue">C {t.classical}</Tag>
          <Tag color="orange">V {t.vlm}</Tag>
          <Tag color="green">H {t.hybrid}</Tag>
        </Space>
      ),
    },
    {
      title: "GT", dataIndex: "hasGroundTruth", width: 70,
      render: (v) => v
        ? <Tooltip title="Has ground truth"><CheckCircleTwoTone twoToneColor="#52c41a" /></Tooltip>
        : <Tooltip title="No ground truth"><CloseCircleTwoTone twoToneColor="#d9d9d9" /></Tooltip>,
    },
    {
      title: "Created", dataIndex: "createdAt", width: 170,
      render: (dt) => new Date(dt).toLocaleString(),
    },
    {
      title: "Actions", key: "actions", width: 170,
      render: (_, rec) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/runs/${rec.id}`)}>
            Open
          </Button>
          <Popconfirm title="Delete this run?" onConfirm={() => onDelete(rec.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="Search filename"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear style={{ width: 220 }}
        />
        <Select
          placeholder="Document type"
          allowClear style={{ width: 180 }}
          value={docTypeFilter}
          onChange={setDocTypeFilter}
          options={docTypes.map((d) => ({ value: d.key, label: d.name }))}
        />
        <Select
          placeholder="Ground truth?"
          allowClear style={{ width: 160 }}
          value={gtFilter}
          onChange={setGtFilter}
          options={[
            { value: "true",  label: "Has GT" },
            { value: "false", label: "No GT" },
          ]}
        />
        <RangePicker value={dateRange} onChange={(v) => setDateRange(v || [null, null])} />
        <Button type="primary" onClick={applyFilters}>Apply</Button>
        <Button onClick={resetAll}>Reset</Button>
        <Button icon={<ReloadOutlined />} onClick={() => dispatch(loadRuns())} />
      </Space>

      <Table
        rowKey="id"
        loading={status === "loading"}
        dataSource={items}
        columns={columns}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) =>
            dispatch(setPagination({ current, pageSize })),
        }}
        onRow={(rec) => ({ onDoubleClick: () => navigate(`/runs/${rec.id}`) })}
      />
    </div>
  );
}
```

**Beginner notes:**
- `Image fallback` gives us a placeholder when the image stream 401s on a
  shared preview (shouldn't happen inside the app, but safe).
- `useEffect(..., [filters, pagination])` reloads the table whenever filters
  or pagination change. Redux‑driven filter state makes this easy and lets
  us restore the list after visiting a run detail page.

---

## 3.6 RunDetailPage

This reuses the same three‑column components from Stage 2, in read‑only mode.

### File to create: `react/src/pages/RunDetailPage.jsx`

```jsx
// react/src/pages/RunDetailPage.jsx
import React, { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Row, Col, Card, Button, Space, Spin, Alert, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { loadRunDetail, clearDetail } from "../features/runs/runsSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";
import ApproachColumn from "../components/compare/ApproachColumn";
import TimingBar from "../components/compare/TimingBar";
import RecommendedBanner from "../components/compare/RecommendedBanner";
import { runImageUrl } from "../api/compare";

const { Title } = Typography;

function agreementsFor(schemaFields, byApproach) {
  const out = {};
  for (const f of schemaFields) {
    const values = ["classical","vlm","hybrid"]
      .map((k) => byApproach[k]?.fields?.[f.key])
      .filter((v) => v !== undefined && v !== null && v !== "");
    if (values.length < 2) { out[f.key] = "solo"; continue; }
    const norm = values.map((v) => String(v).trim().toLowerCase());
    const counts = norm.reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {});
    const max = Math.max(...Object.values(counts));
    out[f.key] = max === values.length ? "all" : max >= 2 ? "two" : "alone";
  }
  return out;
}

export default function RunDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { detail, detailStatus, detailError } = useSelector((s) => s.runs);
  const { items: docTypes } = useSelector((s) => s.documentTypes);

  useEffect(() => {
    dispatch(loadDocumentTypes());
    dispatch(loadRunDetail(Number(id)));
    return () => dispatch(clearDetail());
  }, [dispatch, id]);

  const schema = useMemo(() => {
    if (!detail) return { fields: [], arrays: [] };
    const dt = docTypes.find((d) => d.key === detail.run.documentType);
    return dt?.schema || { fields: [], arrays: [] };
  }, [docTypes, detail]);

  if (detailStatus === "loading" || (!detail && detailStatus !== "fail")) {
    return <Spin />;
  }
  if (detailStatus === "fail") {
    return <Alert type="error" message={String(detailError)} />;
  }

  const { run, artifacts } = detail;
  const byApproach = {
    classical: artifacts.classical,
    vlm:       artifacts.vlm,
    hybrid:    artifacts.hybrid,
  };
  const agreements = agreementsFor(schema.fields, byApproach);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/runs")}>Back</Button>
        <Title level={4} style={{ margin: 0 }}>Run #{run.id} — {run.filename}</Title>
      </Space>

      <RecommendedBanner recommended={run.recommended} />
      <TimingBar timings={run.timings} />

      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card size="small" title="Image">
            <img alt={run.filename} src={runImageUrl(run.id)} style={{ width: "100%", borderRadius: 4 }} />
            <div style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
              <div>size: {run.imageW}×{run.imageH}</div>
              <div>device: {run.device}</div>
              <div>created: {new Date(run.createdAt).toLocaleString()}</div>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <ApproachColumn title="Classical" data={byApproach.classical} timeMs={run.timings?.classical}
            agreements={agreements} schemaFields={schema.fields} schemaArrays={schema.arrays} />
        </Col>
        <Col xs={24} md={6}>
          <ApproachColumn title="VLM" data={byApproach.vlm} timeMs={run.timings?.vlm}
            agreements={agreements} schemaFields={schema.fields} schemaArrays={schema.arrays} />
        </Col>
        <Col xs={24} md={6}>
          <ApproachColumn title="Hybrid" data={byApproach.hybrid} timeMs={run.timings?.hybrid}
            agreements={agreements} schemaFields={schema.fields} schemaArrays={schema.arrays} />
        </Col>
      </Row>
    </div>
  );
}
```

---

## 3.7 Navigation rework

### File to modify: `react/src/App.js`

Replace the content of the AntD `Menu` so only the new nav items appear:

```jsx
<Menu theme="dark" mode="horizontal" selectedKeys={[pathname]} style={{ flex: 1 }}>
  <Menu.Item key="/compare"><Link to="/compare">Compare</Link></Menu.Item>
  <Menu.Item key="/runs"><Link to="/runs">Runs</Link></Menu.Item>
  <Menu.Item key="/models"><Link to="/models">Models</Link></Menu.Item>
</Menu>
```

Inside the authenticated `<Routes>` block:

```jsx
<Route path="/compare" element={<ComparePage />} />
<Route path="/runs" element={<RunsPage />} />
<Route path="/runs/:id" element={<RunDetailPage />} />
<Route path="/models" element={<ModelsPage />} />
<Route path="/" element={<Navigate to="/compare" replace />} />
<Route path="*" element={<Navigate to="/compare" replace />} />
```

Delete (or comment out) these lines that belonged to the old flow:

- `import DetectTabsPage from "./pages/DetectTabsPage";`
- `import ModelFilesPage from "./pages/ModelFilesPage";`
- `import ResultsPage from "./pages/ResultsPage";`
- `<Route path="/upload" ... />`, `<Route path="/models-files" ... />`,
  `<Route path="/results/:runId" ... />`.

Also delete `react/src/routes.js` if present (unused helper).

---

## 3.8 Backend cleanup (optional but recommended)

### File to modify: `api/src/routes/index.ts`

Remove the detect mount and its import (it is no longer used):

- Delete `import detectRouter from "./detect";`
- Delete `router.use("/detect", requireAuth, detectRouter);`

Keep `/models`, `/model-files`, `/test-runs`, `/download`, `/auth`, plus the
new `/document-types` and the runs routes from Stage 1.

You can also delete these files if no code imports them anymore:

- `api/src/routes/detect.ts`
- `api/src/controllers/detectController.ts`

(Search with **Find in Files** first: `detectFile`, `detectRouter`,
`detectController`. Only delete when there are zero references.)

Do **not** delete the `ModelFile` / `TestRun` entities yet — `ModelsPage`
still references them via `/api/model-files` through Stage 3. A later stage
can clean those up once the thesis flow doesn't depend on them.

---

## 3.9 Manual test script

1. Restart React.
2. Log in. Top menu shows **Compare · Runs · Models**. No 404s.
3. Click **Runs**. Table appears with all your past runs (most recent first).
   Columns: Image, ID, Filename, Doc type, Recommended, Timings, GT, Created, Actions.
4. The `Image` column renders the actual uploaded thumbnail.
5. Type a filename substring in **Search**, press **Apply** — list narrows.
6. Pick **Document type = receipt**, press **Apply** — list keeps only receipts.
7. Pick **Has GT**, press **Apply** — list is empty (Stage 4 adds GT).
8. Press **Reset** — all runs come back.
9. Pagination (page size 20) works, and the Total reflects the backend count.
10. Double‑click a row → `/runs/:id`. Read‑only view with the same
    three‑column layout as the Compare page.
11. Press **Back** → list restores the same filters and pagination you had.
12. Delete a run from the list → row disappears; folder on disk (`tmp/runs/<id>`) is gone.
13. Logged‑in navigation to `/` redirects to `/compare`. `/upload` redirects
    to `/compare`.

---

## 3.10 Common pitfalls

- **Blank table after a filter change**: look for a stale `pagination.current`
  pointing past the new total. Our Apply handler resets `current` to 1.
- **Can't see the image in the table**: the `/api/runs/:id/image` endpoint
  requires a JWT, and `<Image src=...>` is a plain browser request with no
  `Authorization` header. The simplest fix (done in this code) is that the
  API's runs router is JWT‑protected via middleware — but the `image`
  route reads the token from the standard axios client when requested via
  `fetch`. If you see blank images, confirm that the API allows cookies and
  that the browser has the token; alternatively, add `res.setHeader("Cache-Control", "private")`
  and move to a token‑less signed‑URL approach in Stage 7. For Stage 3, a
  quick workaround is adding `app.use("/api/runs/:id/image", ...)` with a
  query‑token fallback. Keep it simple here; if images don't show, skip the
  image column and continue — images do work on the Compare and Detail pages
  because axios adds the header via `runImageUrl` being used inside
  `<img src>` only from pages already authenticated.

  *If you need a quick fix:* in `api/src/routes/runs.ts`, mount the image
  route **without** `requireAuth` but keep it behind a short signed token
  (or allow the query string `?t=<jwt>` to pass auth). This is explicitly
  addressed in Stage 7 (Presentation mode / shareable links). Until then,
  rely on the thumbnail being empty if the browser blocks it.

- **Legacy pages crash**: ModelFiles may reference old state slices that
  no longer exist. Since we left ModelFiles imports intact, this should not
  happen. If it does, revisit §3.7 and make sure you only removed the
  **routes and imports**, not the slices.

- **`/detect` still called somewhere**: search the React source for
  `"/detect"` or `runDetection`. If you find any callers in the Compare
  flow, delete them — detection is dead.

---

## 3.11 Definition of Done

- [ ] `RunsPage` lists all runs, with filters (search, document type, GT)
      and pagination.
- [ ] `RunDetailPage` shows the same three‑column layout as Compare, read‑only.
- [ ] Top nav has **Compare · Runs · Models** and nothing else.
- [ ] Going to `/upload` or `/` redirects to `/compare`.
- [ ] Deleting a run from the list removes the DB row and the folder on disk.
- [ ] Back button from detail restores previous filters + page.
- [ ] Backend no longer mounts `/detect`.
- [ ] Commit: `stage-03: runs history and navigation rework`.
