# Stage 2 — Frontend: the ComparePage

> **Goal:** Build the signature page of the application. User uploads an image,
> picks a document type, hits "Run Comparison", and sees three columns
> (Classical / VLM / Hybrid) side‑by‑side with diff highlighting, per‑approach
> confidence, a timing bar, and a "recommended for production" banner.

**Estimated time for a beginner:** 8 – 12 hours.

**Dependencies:** Stage 1 is fully done and `POST /api/compare` works from curl.

**Affected areas:** `react/` only.

---

## 2.1 Prerequisites

- Stage 1 done. `GET /api/document-types` returns `[{key:"receipt",...}]`.
- `POST /api/compare` returns the merged response in curl.
- You can log in and the app runs at `http://localhost:3006`.

Create a branch:

```powershell
cd D:/Master/service/application
git checkout -b stage-02-compare-page
```

---

## 2.2 Plan of files

We will create (or modify) these files in this stage:

```
react/src/
  api/
    compare.js              NEW — axios calls for /compare and /document-types
  features/
    comparison/
      comparisonSlice.js    NEW — Redux slice for the current comparison
    documentTypes/
      documentTypesSlice.js NEW — Redux slice for the list of document types
    store/store.js          MODIFY — register the two new reducers
  pages/
    ComparePage.jsx         NEW — the hero page
  components/
    compare/
      TimingBar.jsx         NEW — horizontal bar showing latency per approach
      ApproachColumn.jsx    NEW — one column (Classical, VLM, or Hybrid)
      FieldCell.jsx         NEW — a single field with diff highlight
      RecommendedBanner.jsx NEW — banner using response.recommended_for_production
  App.js                    MODIFY — add route and menu entry for /compare
```

Do **not** delete the old `DetectTabsPage.jsx` yet. That happens in Stage 3.

---

## 2.3 The API layer

### File to create: `react/src/api/compare.js`

```js
// react/src/api/compare.js
import client from "./client";

/** GET /api/document-types */
export const fetchDocumentTypes = () => client.get("/api/document-types");

/**
 * POST /api/compare
 * @param {File} file - the image to compare
 * @param {string} documentTypeKey - e.g. "receipt"
 * @param {(progress: number) => void} [onProgress] - 0..1
 */
export const runCompareApi = (file, documentTypeKey, onProgress) => {
  const form = new FormData();
  form.append("file", file);
  form.append("documentType", documentTypeKey);

  return client.post("/api/compare", form, {
    // DO NOT set Content-Type manually; the browser adds the boundary for us.
    timeout: 300_000, // compare calls can take >30s (VLM + hybrid).
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) onProgress(evt.loaded / evt.total);
    },
  });
};

/** GET /api/runs/:id — returns { run, artifacts } */
export const fetchRun = (id) => client.get(`/api/runs/${id}`);

/** Absolute URL of the original image for an <img src=...>. */
export const runImageUrl = (id) =>
  `${client.defaults.baseURL}/api/runs/${id}/image`;
```

### File to create: `react/src/features/documentTypes/documentTypesSlice.js`

```js
// react/src/features/documentTypes/documentTypesSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchDocumentTypes } from "../../api/compare";

export const loadDocumentTypes = createAsyncThunk(
  "documentTypes/load",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await fetchDocumentTypes();
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

const slice = createSlice({
  name: "documentTypes",
  initialState: { items: [], status: "idle", error: null },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(loadDocumentTypes.pending,   (s) => { s.status = "loading"; s.error = null; })
     .addCase(loadDocumentTypes.fulfilled, (s, a) => { s.status = "ok"; s.items = a.payload; })
     .addCase(loadDocumentTypes.rejected,  (s, a) => { s.status = "fail"; s.error = a.payload; });
  },
});

export default slice.reducer;
```

### File to create: `react/src/features/comparison/comparisonSlice.js`

```js
// react/src/features/comparison/comparisonSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { runCompareApi } from "../../api/compare";

export const runComparison = createAsyncThunk(
  "comparison/run",
  async ({ file, documentType }, { rejectWithValue }) => {
    try {
      const { data } = await runCompareApi(file, documentType);
      return data; // { runId, run, response }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const slice = createSlice({
  name: "comparison",
  initialState: {
    currentRunId: null,
    run: null,         // DB row
    response: null,    // full Python response
    status: "idle",    // 'idle' | 'running' | 'ok' | 'fail'
    error: null,
  },
  reducers: {
    resetComparison: () => ({
      currentRunId: null, run: null, response: null, status: "idle", error: null,
    }),
  },
  extraReducers: (b) => {
    b.addCase(runComparison.pending, (s) => {
       s.status = "running"; s.error = null; s.response = null; s.run = null;
     })
     .addCase(runComparison.fulfilled, (s, a) => {
       s.status = "ok";
       s.currentRunId = a.payload.runId;
       s.run = a.payload.run;
       s.response = a.payload.response;
     })
     .addCase(runComparison.rejected, (s, a) => {
       s.status = "fail"; s.error = a.payload || "Comparison failed";
     });
  },
});

export const { resetComparison } = slice.actions;
export default slice.reducer;
```

### File to modify: `react/src/features/store/store.js`

Add the two reducers:

```js
import comparisonReducer from "../comparison/comparisonSlice";
import documentTypesReducer from "../documentTypes/documentTypesSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    models: modelsReducer,
    modelFiles: modelFilesReducer,
    comparison: comparisonReducer,
    documentTypes: documentTypesReducer,
  },
});
```

### Test

Open browser dev tools → Redux DevTools (if installed). After the page
loads, dispatch `documentTypes/load` manually or wait for §2.5 to add it.
Either way, reducers must be registered before continuing.

---

## 2.4 Small presentational components

### File to create: `react/src/components/compare/TimingBar.jsx`

```jsx
// react/src/components/compare/TimingBar.jsx
import React from "react";
import { Tooltip } from "antd";

const COLORS = { classical: "#1677ff", vlm: "#fa8c16", hybrid: "#52c41a" };

export default function TimingBar({ timings }) {
  if (!timings) return null;
  const entries = [
    ["classical", timings.classical ?? 0],
    ["vlm",       timings.vlm       ?? 0],
    ["hybrid",    timings.hybrid    ?? 0],
  ];
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
      {entries.map(([name, ms]) => (
        <Tooltip key={name} title={`${name}: ${ms} ms`}>
          <div
            style={{
              width: `${(ms / total) * 100}%`,
              background: COLORS[name],
              color: "white",
              textAlign: "center",
              fontSize: 12,
              lineHeight: "28px",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {name} {ms} ms
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
```

### File to create: `react/src/components/compare/RecommendedBanner.jsx`

```jsx
// react/src/components/compare/RecommendedBanner.jsx
import React from "react";
import { Alert } from "antd";

export default function RecommendedBanner({ recommended }) {
  if (!recommended) return null;
  return (
    <Alert
      type="success"
      showIcon
      style={{ marginBottom: 16 }}
      message={`Recommended approach: ${recommended.toUpperCase()}`}
    />
  );
}
```

### File to create: `react/src/components/compare/FieldCell.jsx`

```jsx
// react/src/components/compare/FieldCell.jsx
import React from "react";
import { Tag } from "antd";

/**
 * Renders a single field value with a colour hint based on how it compares
 * to the other approaches. Colours:
 *   green  = all three approaches agree
 *   amber  = two approaches agree (majority)
 *   red    = this value is alone
 *   gray   = nothing to compare against (value missing elsewhere)
 */
export default function FieldCell({ value, agreement }) {
  const color =
    agreement === "all"   ? "#d9f7be" :
    agreement === "two"   ? "#fff1b8" :
    agreement === "alone" ? "#ffa39e" :
                            "#f5f5f5";

  return (
    <div style={{ background: color, padding: "4px 8px", borderRadius: 4 }}>
      {value == null || value === "" ? (
        <Tag>empty</Tag>
      ) : typeof value === "object" ? (
        <pre style={{ margin: 0, fontSize: 12 }}>
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        String(value)
      )}
    </div>
  );
}
```

### File to create: `react/src/components/compare/ApproachColumn.jsx`

```jsx
// react/src/components/compare/ApproachColumn.jsx
import React from "react";
import { Card, Statistic, Descriptions, Typography, Divider, Table } from "antd";
import FieldCell from "./FieldCell";

const { Text } = Typography;

/**
 * @param {object} props
 * @param {string} props.title                 - "Classical" | "VLM" | "Hybrid"
 * @param {object} props.data                  - response.main / response.qwen / response.hybrid
 * @param {number} [props.timeMs]              - timing in ms for this approach
 * @param {object} props.agreements            - { FIELD_KEY: 'all'|'two'|'alone'|'solo' }
 * @param {object[]} props.schemaFields        - schema.fields (non-array)
 * @param {object[]} props.schemaArrays        - schema.arrays
 */
export default function ApproachColumn({
  title,
  data,
  timeMs,
  agreements,
  schemaFields,
  schemaArrays,
}) {
  if (!data) {
    return (
      <Card title={title}>
        <Text type="secondary">No result</Text>
      </Card>
    );
  }

  const fields = data.fields || {};
  const confidence = typeof data.confidence === "number"
    ? data.confidence
    : data?.meta?.confidence?.receipt_confidence;

  return (
    <Card title={title} size="small">
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        {confidence != null && (
          <Statistic title="Confidence" value={Number(confidence).toFixed(3)} />
        )}
        {timeMs != null && (
          <Statistic title="Time (ms)" value={timeMs} />
        )}
      </div>

      <Descriptions size="small" column={1} bordered>
        {schemaFields.map((f) => (
          <Descriptions.Item key={f.key} label={f.label || f.key}>
            <FieldCell value={fields[f.key]} agreement={agreements[f.key]} />
          </Descriptions.Item>
        ))}
      </Descriptions>

      {schemaArrays.map((arr) => {
        const rows = Array.isArray(fields[arr.key]) ? fields[arr.key] : [];
        if (!rows.length) return null;
        return (
          <div key={arr.key} style={{ marginTop: 16 }}>
            <Divider orientation="left">{arr.label || arr.key}</Divider>
            <Table
              size="small"
              rowKey={(_, idx) => idx}
              pagination={false}
              dataSource={rows}
              columns={arr.fields.map((f) => ({
                title: f.key,
                dataIndex: f.key,
                render: (v) => <FieldCell value={v} />,
              }))}
            />
          </div>
        );
      })}
    </Card>
  );
}
```

---

## 2.5 The ComparePage

### File to create: `react/src/pages/ComparePage.jsx`

```jsx
// react/src/pages/ComparePage.jsx
import React, { useEffect, useState, useMemo } from "react";
import {
  Row, Col, Card, Upload, Button, Select, Spin, message, Typography, Space, Alert,
} from "antd";
import { UploadOutlined, CloudUploadOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";
import { runComparison, resetComparison } from "../features/comparison/comparisonSlice";
import TimingBar from "../components/compare/TimingBar";
import RecommendedBanner from "../components/compare/RecommendedBanner";
import ApproachColumn from "../components/compare/ApproachColumn";
import { runImageUrl } from "../api/compare";

const { Text, Title } = Typography;

/** Compute how each field's value lines up across the three approaches. */
function computeAgreements(schemaFields, resultsByApproach) {
  const out = {};
  for (const f of schemaFields) {
    const values = ["classical", "vlm", "hybrid"]
      .map((k) => resultsByApproach[k]?.fields?.[f.key])
      .filter((v) => v !== undefined && v !== null && v !== "");

    if (values.length < 2) { out[f.key] = "solo"; continue; }

    const str = values.map((v) => String(v).trim().toLowerCase());
    const counts = str.reduce((acc, v) => ((acc[v] = (acc[v] || 0) + 1), acc), {});
    const max = Math.max(...Object.values(counts));

    if (max === values.length) out[f.key] = "all";
    else if (max >= 2)         out[f.key] = "two";
    else                       out[f.key] = "alone";
  }
  return out;
}

export default function ComparePage() {
  const dispatch = useDispatch();
  const { items: docTypes } = useSelector((s) => s.documentTypes);
  const { status, response, run, error, currentRunId } = useSelector((s) => s.comparison);

  const [documentType, setDocumentType] = useState(null);
  const [fileList, setFileList] = useState([]);

  useEffect(() => { dispatch(loadDocumentTypes()); }, [dispatch]);

  useEffect(() => {
    if (!documentType && docTypes.length) setDocumentType(docTypes[0].key);
  }, [docTypes, documentType]);

  const currentSchema = useMemo(() => {
    const dt = docTypes.find((d) => d.key === documentType);
    return dt?.schema || { fields: [], arrays: [] };
  }, [docTypes, documentType]);

  const byApproach = useMemo(() => ({
    classical: response?.main || null,
    vlm:       response?.qwen || null,
    hybrid:    response?.hybrid || null,
  }), [response]);

  const agreements = useMemo(
    () => computeAgreements(currentSchema.fields, byApproach),
    [currentSchema, byApproach]
  );

  const handleRun = () => {
    if (!documentType) return message.warning("Pick a document type");
    if (!fileList.length) return message.warning("Select an image");
    const file = fileList[0].originFileObj || fileList[0];
    dispatch(runComparison({ file, documentType }));
  };

  const handleReset = () => {
    dispatch(resetComparison());
    setFileList([]);
  };

  return (
    <div>
      <Title level={3}>Compare approaches</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Document type"
            style={{ width: 200 }}
            value={documentType}
            onChange={setDocumentType}
            options={docTypes.map((d) => ({ value: d.key, label: d.name }))}
          />
          <Upload
            accept="image/*"
            fileList={fileList}
            beforeUpload={() => false}
            maxCount={1}
            onChange={(info) => setFileList(info.fileList.slice(-1))}
          >
            <Button icon={<UploadOutlined />}>Select image</Button>
          </Upload>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={handleRun}
            loading={status === "running"}
            disabled={!fileList.length || !documentType}
          >
            Run comparison
          </Button>
          <Button onClick={handleReset} disabled={status === "running"}>
            Reset
          </Button>
        </Space>
      </Card>

      {status === "fail" && (
        <Alert type="error" message={String(error)} style={{ marginBottom: 16 }} />
      )}

      {status === "running" && (
        <Card>
          <Space>
            <Spin /> <Text>Running three pipelines… this may take a minute.</Text>
          </Space>
        </Card>
      )}

      {status === "ok" && response && (
        <>
          <RecommendedBanner recommended={response.recommended_for_production} />
          <TimingBar timings={run?.timings} />

          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Card title="Image" size="small">
                {currentRunId && (
                  <img
                    alt={run?.filename}
                    src={runImageUrl(currentRunId)}
                    style={{ width: "100%", borderRadius: 4 }}
                  />
                )}
                <div style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
                  <div>file: {run?.filename}</div>
                  <div>size: {run?.imageW}×{run?.imageH}</div>
                  <div>device: {run?.device}</div>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <ApproachColumn
                title="Classical (OD + OCR)"
                data={byApproach.classical}
                timeMs={run?.timings?.classical}
                agreements={agreements}
                schemaFields={currentSchema.fields}
                schemaArrays={currentSchema.arrays}
              />
            </Col>
            <Col xs={24} md={6}>
              <ApproachColumn
                title="VLM (OCR‑free)"
                data={byApproach.vlm}
                timeMs={run?.timings?.vlm}
                agreements={agreements}
                schemaFields={currentSchema.fields}
                schemaArrays={currentSchema.arrays}
              />
            </Col>
            <Col xs={24} md={6}>
              <ApproachColumn
                title="Hybrid (OD + VLM)"
                data={byApproach.hybrid}
                timeMs={run?.timings?.hybrid}
                agreements={agreements}
                schemaFields={currentSchema.fields}
                schemaArrays={currentSchema.arrays}
              />
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
```

---

## 2.6 Wire up the route and menu

### File to modify: `react/src/App.js`

Add an import for `ComparePage` and register the route + menu entry.

- Near the other page imports:

  ```js
  import ComparePage from "./pages/ComparePage";
  ```

- Inside the AntD `Menu`, add a new `Menu.Item` **before** the existing
  `/upload` entry:

  ```jsx
  <Menu.Item key="/compare">
    <Link to="/compare">Compare</Link>
  </Menu.Item>
  ```

- Inside the inner authenticated `<Routes>`, add:

  ```jsx
  <Route path="/compare" element={<ComparePage />} />
  ```

- Change the root redirect to send users to `/compare` by default:

  ```jsx
  <Route path="/" element={<Navigate to="/compare" replace />} />
  <Route path="*" element={<Navigate to="/compare" replace />} />
  ```

Do not remove the old Upload / Models / Model Files entries yet — Stage 3
cleans those up.

---

## 2.7 Manual test script (human, not automated)

1. Restart React (`yarn start` in `react/`).
2. Log in.
3. Top menu now shows **Compare** — click it. Page loads at `/compare`.
4. The `Document type` select is pre‑filled with **Receipt**. If not, check
   the Redux DevTools: `documentTypes/load` should be fulfilled.
5. Pick a sample receipt image, press **Run comparison**. Status becomes
   `running`, button shows a spinner.
6. After the Python service responds (10–60s), three columns appear:
   - Classical shows `fields` from `response.main` with its confidence.
   - VLM shows `fields` from `response.qwen`.
   - Hybrid shows `fields` from `response.hybrid`.
   - The timing bar shows three segments: classical / vlm / hybrid.
   - Values that all three approaches agree on are **green**.
   - Values where two out of three agree are **amber**.
   - Values where the approach is alone are **red**.
   - Empty values show a grey `empty` tag.
7. The `ORDER` array renders as a nested table under each column.
8. The `Recommended approach` banner appears (green).
9. Press **Reset** — columns disappear, fileList empties.
10. Break the network to simulate failure: stop the Python service and run
    again. Expected: a red `Alert` with the backend error message.

---

## 2.8 Common pitfalls

- **CORS error**: the backend already allows `origin: "*"` in `api/src/app.ts`.
  If you changed this, don't.
- **401 Unauthorized**: your JWT expired. Log out and log back in; the
  `logout` event listener in `store.js` handles this automatically.
- **Timeout**: the axios client default was 30s. In `runCompareApi` we
  override it to 300s. If you still see `timeout of 30000ms exceeded`,
  confirm you passed the override (this is a common beginner mistake).
- **Wrong colour for a field**: remember the agreement compares lowercased
  trimmed strings. `"329"` vs `"329.0"` will look different. That's on
  purpose (exact‑match view); Stage 4 adds normalized comparison using
  the metrics library.
- **"fields is undefined" on one approach**: the Python service may omit
  `fields` when it errors. Each column guards against this with `data.fields || {}`.
- **`ORDER` column titles are the raw keys** (e.g. `QUANTITY`). That is
  intentional for now; Stage 3+ adds schema‑driven labels.

---

## 2.9 Definition of Done

- [ ] `react/src/api/compare.js` exists.
- [ ] `react/src/features/documentTypes/documentTypesSlice.js` exists and
      is registered in the store.
- [ ] `react/src/features/comparison/comparisonSlice.js` exists and is
      registered in the store.
- [ ] Four components exist under `react/src/components/compare/`:
      `TimingBar.jsx`, `RecommendedBanner.jsx`, `FieldCell.jsx`,
      `ApproachColumn.jsx`.
- [ ] `react/src/pages/ComparePage.jsx` exists.
- [ ] Top menu shows **Compare** and routes to `/compare`.
- [ ] With the API + Python services running, uploading a receipt produces
      three populated columns, a timing bar, and a recommended banner.
- [ ] Diff highlighting works: all‑agree is green, two‑agree amber,
      alone red, missing grey.
- [ ] The `ORDER` rows render in a nested table in each column.
- [ ] Failure states show a user‑visible error alert (not a white screen).
- [ ] Existing pages (Models, Model Files) still open without crashes.
- [ ] Commit: `stage-02: compare page with three-column diff view`.
