# Stage 7 — Polish: presentation mode, shareable links, bbox overlay, hotkeys, dark mode

> **Goal:** Make the app defense‑ready. No "dev smell": public share links,
> distraction‑free presentation route, bounding‑box overlay on images,
> keyboard shortcuts, dark mode, a real JSON editor, and a few UX fixes
> around image loading.

**Estimated time for a beginner:** 8 – 12 hours. Features are independent;
do them in any order you prefer within the stage.

**Dependencies:** Stage 6 done.

---

## 7.1 Prerequisites

Install these libraries:

```powershell
cd D:/Master/service/application/react
yarn add react-json-view-lite
```

Create a branch:

```powershell
cd D:/Master/service/application
git checkout -b stage-07-polish
```

---

## 7.2 Overview of the polish list

- **7.3 Share tokens** — a run can be opened with a read‑only link, no login.
- **7.4 Presentation mode** — `/demo/:id?token=<short>` route with no nav.
- **7.5 Bounding‑box overlay** — draw boxes on the image if Python returns them.
- **7.6 Raw artifact viewer** — collapsible "raw JSON" inspector per approach.
- **7.7 Hotkeys** — `1`, `2`, `3` focus approach columns; `g` opens the GT drawer.
- **7.8 Dark mode** — AntD v5 theme switch persisted in localStorage.
- **7.9 JSON editor upgrade** — swap the plain textarea for `react-json-view-lite`.
- **7.10 Image auth fix** — make `<img src>` work without sending a JWT header.

---

## 7.3 Share tokens

### 7.3.1 Backend — a tiny signed token

Use the existing `jsonwebtoken` already in the API so we don't add another
library. The token carries `{runId, scope:"read"}` and a short expiry.

Add to `api/src/utils/shareToken.ts`:

```ts
import jwt from "jsonwebtoken";
import config from "../../config/default.json";

const SECRET = config.auth.jwtSecret;

export function signShareToken(runId: number, ttlHours = 24): string {
  return jwt.sign({ runId, scope: "read" }, SECRET, {
    expiresIn: `${ttlHours}h`,
  });
}

export function verifyShareToken(token: string, runId: number): boolean {
  try {
    const payload = jwt.verify(token, SECRET) as any;
    return payload?.scope === "read" && Number(payload.runId) === runId;
  } catch {
    return false;
  }
}
```

### 7.3.2 Routes

Add to `api/src/controllers/runsController.ts`:

```ts
import { signShareToken, verifyShareToken } from "../utils/shareToken";

export const createShareLink = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const run = await ComparisonRun.findOne({ id });
  if (!run) return res.status(404).send();
  const ttl = Number(req.query.ttl ?? 24);
  const token = signShareToken(id, ttl);
  res.json({ token, url: `/demo/${id}?token=${token}`, expiresInHours: ttl });
};

export const getPublicRun = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const token = (req.query.token as string) || "";
  if (!verifyShareToken(token, id))
    return res.status(401).json({ error: "Invalid token" });
  const run = await ComparisonRun.findOne({ id });
  if (!run) return res.status(404).send();
  const artifacts = await loadRunArtifacts(id);
  res.json({ run, artifacts });
};

export const getPublicImage = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const token = (req.query.token as string) || "";
  if (!verifyShareToken(token, id)) return res.status(401).send();
  const run = await ComparisonRun.findOne({ id });
  if (!run) return res.status(404).send();
  const file = imagePath(id, run.imageName);
  if (!fs.existsSync(file)) return res.status(404).send();
  res.sendFile(file);
};
```

### 7.3.3 Mount without auth

In `api/src/routes/index.ts`, mount the public routes **before** `requireAuth`:

```ts
router.get("/public/runs/:id", asyncHandler(getPublicRun));
router.get("/public/runs/:id/image", asyncHandler(getPublicImage));
```

And expose the token creation behind auth in `api/src/routes/runs.ts`:

```ts
router.post("/runs/:id/share", asyncHandler(createShareLink));
```

### 7.3.4 Frontend — copy‑link button

In `RunDetailPage.jsx` and `ComparePage.jsx`, add:

```jsx
import { Button, message } from "antd";
import { LinkOutlined } from "@ant-design/icons";
// ...
const share = async () => {
  const { data } = await client.post(`/api/runs/${run.id}/share?ttl=72`);
  const url = `${window.location.origin}${data.url}`;
  await navigator.clipboard.writeText(url);
  message.success("Share link copied");
};
<Button icon={<LinkOutlined />} onClick={share}>
  Share
</Button>;
```

---

## 7.4 Presentation mode

### Route

Register under `/demo/:id` **outside** the authenticated `<Routes>` block
in `App.js` so logged‑out viewers can see it:

```jsx
<Route path="/demo/:id" element={<PresentationPage />} />
```

### `react/src/pages/PresentationPage.jsx`

```jsx
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Row, Col, Card, Typography, Alert, Spin } from "antd";
import TimingBar from "../components/compare/TimingBar";
import RecommendedBanner from "../components/compare/RecommendedBanner";
import ApproachColumn from "../components/compare/ApproachColumn";

const { Title } = Typography;

export default function PresentationPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const base = process.env.REACT_APP_API_URL || "http://localhost:3000";
    axios
      .get(`${base}/api/public/runs/${id}`, { params: { token } })
      .then((r) => setData(r.data))
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, [id, token]);

  if (err) return <Alert type="error" message={err} style={{ margin: 40 }} />;
  if (!data) return <Spin style={{ margin: 80 }} />;

  const { run, artifacts } = data;
  const base = process.env.REACT_APP_API_URL || "http://localhost:3000";
  const imgUrl = `${base}/api/public/runs/${run.id}/image?token=${token}`;
  const byApproach = {
    classical: artifacts.classical,
    vlm: artifacts.vlm,
    hybrid: artifacts.hybrid,
  };
  const schemaFields = []; // schema is loaded by authenticated pages; for public we skip
  const schemaArrays = [];

  return (
    <div
      style={{
        padding: 24,
        background: "#0b0f19",
        color: "white",
        minHeight: "100vh",
      }}
    >
      <Title level={3} style={{ color: "white" }}>
        {run.filename}
      </Title>
      <RecommendedBanner recommended={run.recommended} />
      <TimingBar timings={run.timings} />
      <Row gutter={16}>
        <Col md={6}>
          <Card>
            <img src={imgUrl} style={{ width: "100%" }} />
          </Card>
        </Col>
        <Col md={6}>
          <ApproachColumn
            title="Classical"
            data={byApproach.classical}
            timeMs={run.timings?.classical}
            agreements={{}}
            schemaFields={schemaFields}
            schemaArrays={schemaArrays}
          />
        </Col>
        <Col md={6}>
          <ApproachColumn
            title="VLM"
            data={byApproach.vlm}
            timeMs={run.timings?.vlm}
            agreements={{}}
            schemaFields={schemaFields}
            schemaArrays={schemaArrays}
          />
        </Col>
        <Col md={6}>
          <ApproachColumn
            title="Hybrid"
            data={byApproach.hybrid}
            timeMs={run.timings?.hybrid}
            agreements={{}}
            schemaFields={schemaFields}
            schemaArrays={schemaArrays}
          />
        </Col>
      </Row>
    </div>
  );
}
```

> For a proper schema‑driven view on public pages, add the `DocumentType`
> row to `/api/public/runs/:id` response. It's small and safe.

---

## 7.5 Bounding‑box overlay

If the Python API returns boxes (e.g. `classical.boxes: [{x,y,w,h,label}]`)
or (`hybrid.fields.ORDER[].ROW_Y`), render an SVG overlay on top of the image.

### `react/src/components/compare/BBoxOverlay.jsx`

```jsx
import React from "react";

/**
 * Wrap an <img> and overlay rectangles from `boxes`.
 * boxes = [{ x, y, w, h, label, color? }] in source image coordinates.
 */
export default function BBoxOverlay({
  src,
  imageW,
  imageH,
  boxes = [],
  onClickBox,
}) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <img src={src} alt="" style={{ width: "100%", display: "block" }} />
      <svg
        viewBox={`0 0 ${imageW} ${imageH}`}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {boxes.map((b, i) => (
          <g
            key={i}
            onClick={() => onClickBox?.(b)}
            style={{ cursor: onClickBox ? "pointer" : "default" }}
          >
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill="none"
              stroke={b.color || "#52c41a"}
              strokeWidth={2}
            />
            {b.label && (
              <text
                x={b.x + 4}
                y={b.y + 14}
                fontSize={12}
                fill={b.color || "#52c41a"}
              >
                {b.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
```

Use it inside the image card of Compare / RunDetail pages. Derive boxes
from whichever approach has them:

```jsx
const boxes = (artifacts.hybrid?.boxes || artifacts.classical?.boxes || []).map(
  (b) => ({
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    label: b.label,
  }),
);
<BBoxOverlay
  src={runImageUrl(run.id)}
  imageW={run.imageW}
  imageH={run.imageH}
  boxes={boxes}
/>;
```

If Python doesn't return boxes yet, skip this section and come back once
the Python side is extended.

---

## 7.6 Raw artifact viewer

In `ApproachColumn.jsx`, add a collapsible at the bottom that shows the
raw JSON for that approach. Use `react-json-view-lite`:

```jsx
import { JsonView, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

<Collapse ghost>
  <Collapse.Panel header="Raw response" key="raw">
    <JsonView
      data={data}
      shouldExpandNode={() => false}
      style={defaultStyles}
    />
  </Collapse.Panel>
</Collapse>;
```

---

## 7.7 Hotkeys

A minimalist hook without deps:

`react/src/hooks/useHotkeys.js`

```js
import { useEffect } from "react";

export default function useHotkeys(map) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);
}
```

In `ComparePage.jsx` and `RunDetailPage.jsx`:

```jsx
import useHotkeys from "../hooks/useHotkeys";

const colRefs = [useRef(), useRef(), useRef()];
useHotkeys({
  1: () =>
    colRefs[0].current?.scrollIntoView({ behavior: "smooth", block: "start" }),
  2: () =>
    colRefs[1].current?.scrollIntoView({ behavior: "smooth", block: "start" }),
  3: () =>
    colRefs[2].current?.scrollIntoView({ behavior: "smooth", block: "start" }),
  g: () => setGtOpen(true),
});
<Col ref={colRefs[0]}>...</Col>;
```

Add a small `?` button in the header that opens a Modal listing the
hotkeys.

---

## 7.8 Dark mode

AntD v5 has a `ConfigProvider` theme prop. Wire a toggle in the header:

### `react/src/features/ui/uiSlice.js`

```js
import { createSlice } from "@reduxjs/toolkit";
const initial = { darkMode: localStorage.getItem("darkMode") === "1" };
const slice = createSlice({
  name: "ui",
  initialState: initial,
  reducers: {
    toggleDarkMode(s) {
      s.darkMode = !s.darkMode;
      localStorage.setItem("darkMode", s.darkMode ? "1" : "0");
    },
  },
});
export const { toggleDarkMode } = slice.actions;
export default slice.reducer;
```

Register in the store.

### `react/src/index.js`

Wrap the App in `ConfigProvider`:

```jsx
import { ConfigProvider, theme as antdTheme } from "antd";
import { useSelector } from "react-redux";

function ThemedApp({ children }) {
  const dark = useSelector((s) => s.ui.darkMode);
  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      {children}
    </ConfigProvider>
  );
}
// ...
root.render(
  <Provider store={store}>
    <BrowserRouter>
      <ThemedApp>
        <App />
      </ThemedApp>
    </BrowserRouter>
  </Provider>,
);
```

### Header toggle in `App.js`

```jsx
import { Switch } from "antd";
import { toggleDarkMode } from "./features/ui/uiSlice";

const dark = useSelector((s) => s.ui.darkMode);
<Switch
  checked={dark}
  onChange={() => dispatch(toggleDarkMode())}
  checkedChildren="Dark"
  unCheckedChildren="Light"
/>;
```

---

## 7.9 JSON editor upgrade

Replace the plain textarea in `GroundTruthDrawer.jsx` with a view + edit hybrid:

- Read mode: `react-json-view-lite` display.
- Edit mode: still textarea + parse button, but with format/prettify buttons.

Add a **Prettify** button:

```jsx
<Button
  onClick={() => {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
      setError(null);
    } catch (e) {
      setError("Invalid JSON: " + e.message);
    }
  }}
>
  Prettify
</Button>
```

---

## 7.10 Image auth quick fix

Replace the `<img src={runImageUrl(id)} />` usage on pages that render
images outside of an already‑authenticated fetch by embedding the token as
a query string. Add a helper:

```js
// react/src/api/compare.js
export const runImageSrc = (id) => {
  const token = localStorage.getItem("token") || "";
  return `${client.defaults.baseURL}/api/runs/${id}/image?token=${encodeURIComponent(token)}`;
};
```

Update `api/src/utils/authMiddleware.ts` so it accepts `?token=` for `GET`
image requests only:

```ts
const fromHeader = (req.headers.authorization || "").replace(/^Bearer /, "");
const fromQuery = typeof req.query.token === "string" ? req.query.token : "";
const token = fromHeader || fromQuery;
```

(Adapt to whatever the current middleware does — keep header as primary.)

---

## 7.11 Manual test script

1. **Share link**: on Run detail, click **Share**. A URL like
   `http://localhost:3006/demo/42?token=...` is in the clipboard. Paste it
   into a new incognito window — no login, the Presentation page renders.
2. **Presentation mode**: dark background, header‑less layout, three columns
   side by side. Resize to projector size; it stays readable.
3. **Bounding boxes**: if Python returns boxes, they appear on the image.
   Clicking a box scrolls the corresponding field into view (optional).
4. **Raw JSON**: each approach column has a collapsible "Raw response"
   section with a `react-json-view-lite` tree.
5. **Hotkeys**: press `1`, `2`, `3` — columns scroll into view. Press `g` —
   GT drawer opens. Press `?` — modal shows the hotkey list.
6. **Dark mode**: flip the header switch, reload, setting persists.
7. **JSON editor**: Prettify button formats invalid → invalid error, valid → formatted.
8. **Image auth fix**: hard‑refresh the Runs page — thumbnails load without
   401s even though `<img>` cannot set headers.

---

## 7.12 Common pitfalls

- **Share link works locally but not on a teammate's machine**: your
  `REACT_APP_API_URL` is hardcoded to `http://localhost:3000`. Serve the
  React build from the same origin as the API (as `app.ts` already does
  via `express.static(buildPath)`), and switch client base URL to the
  current origin in production.
- **Dark mode conflicts with custom inline colours**: several components
  in this plan use hardcoded `background:"#f5f5f5"`. In dark mode those
  look wrong. Replace literal greys with AntD tokens (`token.colorBorder`,
  `token.colorFillAlter`) using the `useToken` hook when you spot them.
- **EventSource over HTTPS through a proxy**: if you deploy behind nginx,
  set `proxy_buffering off;` for the `/api/benchmarks/:id/stream` route.

---

## 7.13 Definition of Done

- [ ] Share links are signed (JWT read‑scope), expire, and let unauthenticated
      viewers see a run.
- [ ] `/demo/:id?token=...` renders a clean 3‑column layout without the app chrome.
- [ ] Bbox overlay works when boxes are provided, and gracefully hides when not.
- [ ] Raw JSON tree viewer exists per approach.
- [ ] Hotkeys `1`/`2`/`3`/`g`/`?` behave as described.
- [ ] Dark mode toggles and persists across reloads.
- [ ] Runs list thumbnails load without 401 errors.
- [ ] Commit: `stage-07: polish (share, presentation, overlays, hotkeys, dark)`.
