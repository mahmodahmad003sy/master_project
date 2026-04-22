# Stage 8 — Testing and deployment

> **Goal:** Lock in the stability of the app with an automated test suite
> (unit tests for the metrics library, integration tests for the API,
> optional e2e test for the Compare page), harden error handling, and ship
> a reproducible production build your committee can run on any laptop.

**Estimated time for a beginner:** 8 – 14 hours.

**Dependencies:** Stage 7 done (everything works manually).

---

## 8.1 Prerequisites

Install test dependencies:

```powershell
cd D:/Master/service/application/api
yarn add -D jest ts-jest @types/jest supertest @types/supertest
```

For the frontend, CRA already includes Jest and React Testing Library.
Nothing extra is required for Stage 8 frontend tests.

Branch:

```powershell
cd D:/Master/service/application
git checkout -b stage-08-testing-and-deployment
```

---

## 8.2 Backend: Jest configuration

### `api/jest.config.js` (new file)

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  globals: {
    "ts-jest": { isolatedModules: true },
  },
};
```

### Add npm script in `api/package.json`

```json
"scripts": {
  "start": "nodemon src/app.ts",
  "test": "jest --runInBand",
  "test:watch": "jest --watch"
}
```

### Seed a sample test

`api/src/__tests__/smoke.test.ts`

```ts
test("jest runs", () => { expect(1 + 1).toBe(2); });
```

Run:

```powershell
cd D:/Master/service/application/api
yarn test
```

One passing test. Stop if this fails; fix jest config before continuing.

---

## 8.3 Unit tests for the metrics library

This is the most important test surface because the whole thesis relies on
it being correct.

### `api/src/__tests__/metrics.test.ts`

```ts
import {
  normalizeText, normalizeNumber, normalizeDate,
  cer, fieldMatch, orderMatch, scoreRun,
} from "../services/metrics";

describe("normalisers", () => {
  test("text", () => expect(normalizeText("  Hello WORLD  ")).toBe("hello world"));
  test("number", () => expect(normalizeNumber("1,234.50€")).toBe(1234.5));
  test("date DD.MM.YY", () => expect(normalizeDate("27.12.25")).toBe("2025-12-27"));
  test("date DD.MM.YYYY", () => expect(normalizeDate("27.12.2025")).toBe("2025-12-27"));
  test("date invalid", () => expect(normalizeDate("77.12.18")).toBeNull());
});

describe("cer", () => {
  test("identical", () => expect(cer("abc", "abc")).toBe(0));
  test("one edit", () => expect(cer("abc", "abd")).toBeCloseTo(1/3, 5));
});

describe("fieldMatch", () => {
  test("money exact", () => {
    const s = fieldMatch("329.00", "329.00", { key: "SUM", type: "money", tolerance: 0.01 });
    expect(s.status).toBe("exact"); expect(s.score).toBe(1);
  });
  test("money within tolerance", () => {
    const s = fieldMatch("329.005", "329.00", { key: "SUM", type: "money", tolerance: 0.01 });
    expect(s.status).toBe("exact");
  });
  test("text fuzzy", () => {
    const s = fieldMatch("Tsingtao Premium", "Tsingtao Premium Lager", { key: "NAME", type: "text" });
    expect(["fuzzy","miss"]).toContain(s.status);
    expect(s.score).toBeLessThan(1);
  });
  test("missing gt", () => {
    const s = fieldMatch("x", null, { key: "X", type: "text" });
    expect(s.status).toBe("missing_gt");
  });
});

describe("orderMatch", () => {
  test("pairs by name similarity", () => {
    const pred = [{ NAME: "Lager", PRICE: 329, QUANTITY: 1 }, { NAME: "Coffee", PRICE: 200, QUANTITY: 2 }];
    const gt   = [{ NAME: "Coffee", PRICE: 200, QUANTITY: 2 }, { NAME: "Tsingtao Lager", PRICE: 329, QUANTITY: 1 }];
    const rows = orderMatch(pred, gt, {
      key: "ORDER", rowKey: "NAME",
      fields: [
        { key: "NAME", type: "text" },
        { key: "PRICE", type: "money", tolerance: 0.01 },
        { key: "QUANTITY", type: "number" },
      ],
    });
    expect(rows.length).toBe(2);
    const coffee = rows.find((r) => r.fields.find((f) => f.key === "NAME" && String(f.predicted).includes("Coffee")));
    expect(coffee?.score).toBeGreaterThan(0.9);
  });
});

describe("scoreRun", () => {
  const schema = {
    fields: [
      { key: "SUM", type: "money", tolerance: 0.01 },
      { key: "DATE", type: "date" },
    ],
    arrays: [],
  } as const;

  test("summary averages per-approach scores", () => {
    const gt = { SUM: "329.00", DATE: "27.12.25" };
    const ok = { fields: { SUM: "329.00", DATE: "27.12.25" } };
    const bad = { fields: { SUM: "1.00", DATE: "01.01.00" } };
    const m = scoreRun({ classical: bad, vlm: ok, hybrid: ok }, gt, schema as any);
    expect(m.summary.vlm).toBe(1);
    expect(m.summary.classical).toBeLessThan(0.5);
  });
});
```

Run:

```powershell
yarn test
```

Every test must pass. If a test fails, **do not disable it** — fix the
library until they pass.

---

## 8.4 API integration tests with supertest

We need an isolated Postgres for tests. Two options:

- Use a separate database `ai_service_api_test`.
- Use SQLite in‑memory — requires changing `data-source.ts` to switch
  dialect in the test environment.

For simplicity, go with a **separate Postgres DB** and a test config.

### `api/config/test.json`

```json
{
  "server": { "port": 0 },
  "auth": { "jwtSecret": "test_secret" },
  "MODELS_BASE_PATH": "./tmp/test-models",
  "DETECTION_SERVICE_URL": "http://localhost:8000",
  "COMPARE_SERVICE_URL": "http://localhost:9999",
  "RUNS_BASE_PATH": "./tmp/test-runs",
  "db": {
    "type": "postgres",
    "host": "localhost", "port": 5432,
    "username": "ai_service_api", "password": "ai_service_api",
    "database": "ai_service_api_test",
    "synchronize": true, "logging": false
  }
}
```

Create the DB:

```sql
CREATE DATABASE ai_service_api_test OWNER ai_service_api;
```

Tell Node to load the right config when `NODE_ENV=test` (already done by
the `config` package pattern; since we `import config from "../config/default.json"`
directly, we need to make this switchable).

### Make config env‑aware

Replace all `import config from "../config/default.json";` with a small
loader in `api/src/config.ts`:

```ts
import def from "../config/default.json";
import tst from "../config/test.json";
export default (process.env.NODE_ENV === "test" ? tst : def) as typeof def;
```

Then change every import to `import config from "../config"`. Do a
project‑wide search for `../../config/default.json` and update.

### `api/src/__tests__/helpers.ts`

```ts
import { AppDataSource } from "../data-source";
import { ensureRunsRoot } from "../services/runStorage";

export async function bootTestApp() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  await ensureRunsRoot();
  for (const entity of AppDataSource.entityMetadatas) {
    const repo = AppDataSource.getRepository(entity.name);
    await repo.clear();
  }
}

export async function shutdownTestApp() {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}
```

### `api/src/__tests__/runs.api.test.ts`

```ts
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import routes from "../routes";
import config from "../config";
import { bootTestApp, shutdownTestApp } from "./helpers";
import { DocumentType } from "../entities/DocumentType";

jest.setTimeout(60_000);

let app: express.Express;
let token: string;

beforeAll(async () => {
  await bootTestApp();
  await DocumentType.create({
    key: "receipt", name: "Receipt",
    schema: { fields: [{ key: "SUM", type: "money", tolerance: 0.01 }], arrays: [] },
  }).save();
  app = express();
  app.use(express.json());
  app.use("/api", routes);
  token = jwt.sign({ userId: 1 }, config.auth.jwtSecret, { expiresIn: "1h" });
});

afterAll(async () => { await shutdownTestApp(); });

test("GET /api/runs returns empty", async () => {
  const res = await request(app).get("/api/runs").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(0);
});

test("GET /api/document-types returns seeded type", async () => {
  const res = await request(app).get("/api/document-types").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body[0].key).toBe("receipt");
});
```

Run:

```powershell
$env:NODE_ENV = "test"
yarn test
Remove-Item Env:NODE_ENV
```

All tests green.

> For a full `POST /api/compare` test you need to mock the Python service.
> The simplest way is to stub `axios.post` in the test with jest:
> ```ts
> jest.mock("axios");
> (axios.post as jest.Mock).mockResolvedValue({ data: FIXTURE_RESPONSE });
> ```
> Keep this test optional if time is tight.

---

## 8.5 Frontend tests

React already has Jest via CRA. Add a metrics‑style unit test for the
diff agreement helper.

Extract `computeAgreements` from `ComparePage.jsx` into
`react/src/utils/agreements.js`:

```js
export function computeAgreements(schemaFields, byApproach) {
  const out = {};
  for (const f of schemaFields) {
    const values = ["classical", "vlm", "hybrid"]
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
```

`react/src/utils/__tests__/agreements.test.js`

```js
import { computeAgreements } from "../agreements";

test("all agree", () => {
  const r = computeAgreements([{ key: "X" }], {
    classical: { fields: { X: "A" } },
    vlm:       { fields: { X: "a" } },
    hybrid:    { fields: { X: "A" } },
  });
  expect(r.X).toBe("all");
});

test("two agree", () => {
  const r = computeAgreements([{ key: "X" }], {
    classical: { fields: { X: "A" } },
    vlm:       { fields: { X: "A" } },
    hybrid:    { fields: { X: "B" } },
  });
  expect(r.X).toBe("two");
});

test("solo", () => {
  const r = computeAgreements([{ key: "X" }], {
    classical: { fields: { X: "A" } },
    vlm:       { fields: {} },
    hybrid:    { fields: {} },
  });
  expect(r.X).toBe("solo");
});
```

Run:

```powershell
cd D:/Master/service/application/react
yarn test -- --watchAll=false
```

---

## 8.6 Hardening error handling

### API

In `api/src/app.ts`, make sure the global error handler is mounted
**after** all `app.use(...)`:

```ts
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? "Internal Server Error" });
});
```

Add a `404` handler **just before** the error handler:

```ts
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
```

On boot, mark orphaned benchmarks as failed (mentioned in Stage 5):

```ts
await Benchmark.createQueryBuilder()
  .update({ status: "failed" })
  .where({ status: "running" })
  .execute();
```

### React

Add a global error boundary:

`react/src/components/ErrorBoundary.jsx`

```jsx
import React from "react";
import { Result, Button } from "antd";

export default class ErrorBoundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("UI crashed:", err); }
  render() {
    if (this.state.err) {
      return (
        <Result status="500" title="Something went wrong"
          subTitle={String(this.state.err)}
          extra={<Button onClick={() => window.location.reload()}>Reload</Button>}
        />
      );
    }
    return this.props.children;
  }
}
```

Wrap `<App />` in `index.js`:

```jsx
<ErrorBoundary><App /></ErrorBoundary>
```

---

## 8.7 Production build and run

### Backend production build

```powershell
cd D:/Master/service/application/api
yarn tsc            # compiles to api/dist (tsconfig outDir already set)
```

If `tsc` errors on JSON imports, ensure `resolveJsonModule: true` in
`api/tsconfig.json`.

Run compiled:

```powershell
$env:NODE_ENV = "production"
node dist/app.js
```

### Frontend production build

```powershell
cd D:/Master/service/application/react
yarn build
```

Because `api/src/app.ts` already serves `react/build` via
`express.static(buildPath)`, you can:

1. Copy `react/build` over to `api/client/build` (the current pattern), OR
2. Update `app.ts` to point at `../../react/build`, then open
   `http://localhost:3000/` — the React app is served by Node.

Choose (2) for Stage 8:

```ts
const buildPath = path.join(__dirname, "../../react/build");
```

Now one process serves the whole application.

---

## 8.8 Cross‑platform start script

Create `application/run.ps1`:

```powershell
$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "api")
yarn install
yarn tsc
Pop-Location
Push-Location (Join-Path $PSScriptRoot "react")
yarn install
yarn build
Pop-Location
Push-Location (Join-Path $PSScriptRoot "api")
$env:NODE_ENV = "production"
node dist/app.js
```

And `application/run.sh` for Unix graders:

```sh
#!/usr/bin/env sh
set -e
(cd api && yarn install && yarn tsc)
(cd react && yarn install && yarn build)
cd api && NODE_ENV=production node dist/app.js
```

Document in `application/README.md`:

```md
## Quick start

- Postgres 14+, Node 18+, Yarn.
- `createdb -O ai_service_api ai_service_api`
- Start the Python compare service at `http://localhost:8000`.
- Run `./run.sh` (or `run.ps1`) — app serves on `http://localhost:3000`.
```

---

## 8.9 Pre‑defense checklist

- [ ] Demo laptop has: Node 18+, Yarn, Postgres running with the seed user,
      Python compare service running, 20+ example receipts with GT loaded.
- [ ] `yarn test` in `api/` passes (metrics + API integration).
- [ ] `yarn test` in `react/` passes (agreements + any snapshot tests).
- [ ] Production build runs with a single command (`run.ps1` / `run.sh`).
- [ ] Dark mode tested on the projector (check contrast).
- [ ] Network disconnected demo works for cached runs (list + detail pages
      render using existing DB / disk, without needing the Python service).
- [ ] Default landing page `/` redirects to `/compare`.
- [ ] All navigation links lead to a valid page.
- [ ] Share link has a 72‑hour expiry by default for the demo.
- [ ] A one‑page cheat sheet of hotkeys + share links is pinned to the
      desktop for the live demo.

---

## 8.10 Definition of Done

- [ ] `yarn test` works in `api/` and `react/`, both green.
- [ ] `api/src/services/metrics.ts` has full unit coverage of normalisers,
      `cer`, `fieldMatch`, `orderMatch`, `scoreRun`.
- [ ] API integration tests cover `GET /api/document-types` and
      `GET /api/runs`.
- [ ] Global `ErrorBoundary` prevents white screens on React crashes.
- [ ] `tsc` compiles the API with no errors. `yarn build` builds React.
- [ ] One process can serve both the API and the React build.
- [ ] `run.ps1` and `run.sh` bring the whole thing up from a clean checkout.
- [ ] Pre‑defense checklist is fully ticked the morning of the defense.
- [ ] Commit: `stage-08: tests, hardening, production build`.
