# Stage 0 — Setup, configuration, run storage helper

> **Goal:** Prepare the backend so that every later stage can write and read
> run artifacts (images, result JSON, ground truth, metrics) **from disk**
> instead of the database. At the end of this stage nothing user‑visible
> changes, but the infrastructure is in place.

**Estimated time for a beginner:** 1.5 – 3 hours.

**Dependencies:** none.

**Affected areas:** `api/` only. React is not touched.

---

## 0.1 Prerequisites

Make sure you can run the current app before you touch anything:

```powershell
cd D:/Master/service/application/api
yarn install        # or: npm install
yarn start          # should print "DataSource initialized" and "Listening on http://localhost:3000"
```

In a second terminal:

```powershell
cd D:/Master/service/application/react
yarn install
yarn start          # should open http://localhost:3006
```

Log in with an existing user. If any of this fails, stop and fix it first.

Create a git branch for this stage:

```powershell
cd D:/Master/service/application
git checkout -b stage-00-setup-and-storage
```

---

## 0.2 Add the new config key `RUNS_BASE_PATH`

### Why

Later stages write per‑run folders to disk. We want one configurable root so
every environment (dev laptop, server, teammate machine) can point somewhere
different.

### File to modify: `api/config/default.json`

Current file:

```json
{
  "server": { "port": 3000 },
  "auth": { "jwtSecret": "my_strong_secrete" },
  "MODELS_BASE_PATH": "D:/Master/service/api/tmp",
  "DETECTION_SERVICE_URL": "http://localhost:8000",
  "db": { ... }
}
```

Add two new keys:

```json
  "RUNS_BASE_PATH": "D:/Master/service/application/api/tmp/runs",
  "COMPARE_SERVICE_URL": "http://localhost:8000",
```

**Notes:**
- `RUNS_BASE_PATH` must use forward slashes on Windows. Node tolerates them.
- Keep `DETECTION_SERVICE_URL` for now — we will stop using it in Stage 1 but
  won't delete it until Stage 3.
- `COMPARE_SERVICE_URL` is where your Python compare API lives. If it lives
  at the same place as the old detection service, set the same URL.

Final file should look like:

```json
{
  "server": { "port": 3000 },
  "auth": { "jwtSecret": "my_strong_secrete" },
  "MODELS_BASE_PATH": "D:/Master/service/api/tmp",
  "DETECTION_SERVICE_URL": "http://localhost:8000",
  "COMPARE_SERVICE_URL": "http://localhost:8000",
  "RUNS_BASE_PATH": "D:/Master/service/application/api/tmp/runs",
  "db": {
    "type": "postgres",
    "host": "localhost",
    "port": 5432,
    "username": "ai_service_api",
    "password": "ai_service_api",
    "database": "ai_service_api",
    "synchronize": true,
    "logging": false
  }
}
```

### Test

Start the API (`yarn start` in `api/`). It must still boot with no errors.

---

## 0.3 Create the run storage helper

### Why

Every later stage needs to build paths like
`RUNS_BASE_PATH/<runId>/classical.json`. Doing this by hand in every
controller is error‑prone. A tiny helper centralises it and lets us swap the
root path one day without touching dozens of files.

### File to create: `api/src/services/runStorage.ts`

```ts
// api/src/services/runStorage.ts
import fs from "fs";
import path from "path";
import config from "../../config/default.json";

/**
 * Root folder where all ComparisonRun and Benchmark artifacts live.
 * Configured via RUNS_BASE_PATH in api/config/default.json.
 */
export const RUNS_ROOT: string = config.RUNS_BASE_PATH;

/** Known artifact names stored inside a run folder. */
export type ArtifactName =
  | "raw_response"
  | "classical"
  | "vlm"
  | "hybrid"
  | "ground_truth"
  | "metrics";

/** Make sure RUNS_ROOT exists. Called once at boot. */
export async function ensureRunsRoot(): Promise<void> {
  await fs.promises.mkdir(RUNS_ROOT, { recursive: true });
}

/** Absolute path of a single run's folder. */
export function runDir(runId: number | string): string {
  return path.join(RUNS_ROOT, String(runId));
}

/** Absolute path of a JSON artifact inside a run folder. */
export function artifactPath(
  runId: number | string,
  name: ArtifactName
): string {
  return path.join(runDir(runId), `${name}.json`);
}

/** Absolute path of the image stored inside a run folder. */
export function imagePath(runId: number | string, imageName: string): string {
  return path.join(runDir(runId), imageName);
}

/** Absolute path of a benchmark's folder. */
export function benchmarkDir(benchmarkId: number | string): string {
  return path.join(RUNS_ROOT, "benchmarks", String(benchmarkId));
}

/** Create a run's folder (and any missing parents). */
export async function createRunDir(runId: number | string): Promise<void> {
  await fs.promises.mkdir(runDir(runId), { recursive: true });
}

/**
 * Write JSON atomically: write to a .tmp file first, then rename.
 * Prevents half‑written files if the process crashes mid‑write.
 */
export async function writeJson(
  filePath: string,
  data: unknown
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.promises.rename(tmp, filePath);
}

/** Read JSON from disk. Returns null if the file does not exist. */
export async function readJson<T = any>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

/** `true` if a file exists. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Delete a run's folder recursively. Safe to call if the folder is gone. */
export async function removeRunDir(
  runId: number | string
): Promise<void> {
  await fs.promises.rm(runDir(runId), { recursive: true, force: true });
}
```

**Why each function exists:**
- `ensureRunsRoot` — called once at boot so the folder exists before any upload.
- `runDir / artifactPath / imagePath / benchmarkDir` — single source of truth
  for layout. If you ever change the layout, change it here only.
- `writeJson` — atomic write prevents corrupted files on crash / power loss.
- `readJson` — returning `null` for missing files makes callers simpler
  (they don't need try/catch for "file not there").
- `removeRunDir` — used by `DELETE /runs/:id` in Stage 1.

---

## 0.4 Call `ensureRunsRoot()` on boot

### File to modify: `api/src/app.ts`

Find the `AppDataSource.initialize().then(...)` block and add a call to
`ensureRunsRoot()` right after the data source is ready.

Current code (relevant part):

```ts
AppDataSource.initialize()
  .then(() => {
    console.log("✔️ DataSource initialized");
    app.listen(config.server.port, () =>
      console.log(`🚀 Listening on http://localhost:${config.server.port}`)
    );
  })
  .catch((err) => console.error("❌ DataSource init failed:", err));
```

Change to:

```ts
import { ensureRunsRoot, RUNS_ROOT } from "./services/runStorage";

AppDataSource.initialize()
  .then(async () => {
    console.log("✔️ DataSource initialized");
    await ensureRunsRoot();
    console.log(`📂 Runs root ready at ${RUNS_ROOT}`);
    app.listen(config.server.port, () =>
      console.log(`🚀 Listening on http://localhost:${config.server.port}`)
    );
  })
  .catch((err) => console.error("❌ DataSource init failed:", err));
```

**Where to put the import:** near the other imports at the top of
`api/src/app.ts`, after the line that imports `cors`.

### Test

Restart the API. You should see:

```
✔️ DataSource initialized
📂 Runs root ready at D:\Master\service\application\api\tmp\runs
🚀 Listening on http://localhost:3000
```

Open Windows Explorer and verify the folder `api/tmp/runs/` now exists.

---

## 0.5 Ignore run artifacts in git

### Why

The runs folder will hold uploaded images and large JSON files. It must not
be committed.

### File to modify: `api/.gitignore`

Append these lines (do not remove existing lines):

```
# run artifacts (images + JSON per comparison run)
tmp/runs/
```

Create a `.gitkeep` so the empty folder is tracked once (optional but useful
for teammates):

```powershell
cd D:/Master/service/application/api/tmp
New-Item -ItemType File runs/.gitkeep -Force
```

Then add an exception in `.gitignore`:

```
!tmp/runs/.gitkeep
```

### Test

```powershell
cd D:/Master/service/application
git status
```

`api/tmp/runs/.gitkeep` should appear as untracked (or already tracked), but
no other file inside `tmp/runs/` should appear.

---

## 0.6 Smoke test the helper from a throwaway script (optional but recommended)

Create a temporary file `api/src/scripts/try-run-storage.ts`:

```ts
import {
  ensureRunsRoot,
  createRunDir,
  writeJson,
  readJson,
  artifactPath,
  removeRunDir,
} from "../services/runStorage";

(async () => {
  await ensureRunsRoot();
  const runId = "smoke-test";
  await createRunDir(runId);
  await writeJson(artifactPath(runId, "classical"), { hello: "world" });
  const back = await readJson<{ hello: string }>(artifactPath(runId, "classical"));
  console.log("read back:", back);
  await removeRunDir(runId);
  console.log("cleanup ok");
})();
```

Run it:

```powershell
cd D:/Master/service/application/api
npx ts-node src/scripts/try-run-storage.ts
```

Expected output:

```
read back: { hello: 'world' }
cleanup ok
```

Delete the script after it passes.

---

## 0.7 Definition of Done

Tick every box before moving on to Stage 1:

- [ ] `api/config/default.json` contains `RUNS_BASE_PATH` and `COMPARE_SERVICE_URL`.
- [ ] The API starts and prints `📂 Runs root ready at <path>`.
- [ ] Folder `api/tmp/runs/` exists on disk.
- [ ] `api/src/services/runStorage.ts` exists and exports
      `ensureRunsRoot`, `runDir`, `artifactPath`, `imagePath`,
      `benchmarkDir`, `createRunDir`, `writeJson`, `readJson`,
      `fileExists`, `removeRunDir`, `RUNS_ROOT`.
- [ ] `git status` does not list anything inside `api/tmp/runs/` except
      the optional `.gitkeep`.
- [ ] The smoke‑test script ran successfully (if you chose to run it).
- [ ] The React app still loads, you can still log in, nothing is broken.
- [ ] Commit with message `stage-00: setup runs storage and config`.

When all boxes are ticked, merge the branch into main (or wait for a review),
then proceed to Stage 1.
