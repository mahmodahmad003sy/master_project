# Stage 1 — Backend core: entities, `POST /compare`, `GET /runs`

> **Goal:** Make the API able to accept an image, call the Python compare
> service, store artifacts on disk, persist a lean DB row, and expose the
> list / detail endpoints the frontend will need in Stage 2.

**Estimated time for a beginner:** 6 – 10 hours, split over 2 – 3 sessions.

**Dependencies:** Stage 0 is fully done.

**Affected areas:** `api/` only.

---

## 1.1 Prerequisites

- Stage 0 is merged. `api/tmp/runs/` exists. `runStorage.ts` exists.
- The Python compare API is reachable at `COMPARE_SERVICE_URL`. Confirm with
  a plain curl from PowerShell:

  ```powershell
  curl.exe -F "file=@D:/Master/service/application/api/tmp/some-sample.jpg" http://localhost:8000/compare
  ```

  You should get back the JSON shown in the main plan. If not, stop and
  clarify the endpoint with the Python service owner — write down:
  1. The exact URL path (`/compare`? `/api/compare`?).
  2. The multipart field name (`file`? `image`?).
  3. Any extra fields it wants (e.g. `document_type`, `mode`).
  4. The HTTP method (`POST`).

  These four answers map directly to the code in §1.5. If any differ from
  the examples below, change them in one place only: the compare controller.

Create a branch:

```powershell
cd D:/Master/service/application
git checkout -b stage-01-backend-core
```

---

## 1.2 Create the `DocumentType` entity

### File to create: `api/src/entities/DocumentType.ts`

```ts
// api/src/entities/DocumentType.ts
import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

/**
 * A kind of document the comparison engine knows how to score.
 * `schema` describes the expected fields so the UI can render diff columns
 * and the metrics library can compare values correctly.
 */
@Entity("document_types")
export class DocumentType extends BaseEntity {
  @PrimaryGeneratedColumn() id!: number;

  /** Short machine key, e.g. "receipt". Unique. */
  @Column({ unique: true }) key!: string;

  /** Human‑readable name, e.g. "Receipt". */
  @Column() name!: string;

  /**
   * Declarative field schema. See PROJECT_PLAN.md §4.
   * Example:
   * {
   *   fields: [ { key: "DATE", type: "date", formats: ["DD.MM.YY"] }, ... ],
   *   arrays: [ { key: "ORDER", rowKey: "NAME", fields: [...] } ]
   * }
   */
  @Column({ type: "json" }) schema!: Record<string, any>;

  @CreateDateColumn({ name: "created_at" }) createdAt!: Date;
}
```

---

## 1.3 Create the `ComparisonRun` entity

### File to create: `api/src/entities/ComparisonRun.ts`

```ts
// api/src/entities/ComparisonRun.ts
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

/**
 * One comparison of an uploaded image across the three pipelines.
 * Heavy JSON (raw response, per-approach results, ground truth, metrics)
 * lives on DISK under <RUNS_BASE_PATH>/<id>/. The DB row only stores small
 * scalar fields and denormalised flags used by the list UI.
 */
@Entity("comparison_runs")
export class ComparisonRun extends BaseEntity {
  @PrimaryGeneratedColumn() id!: number;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  /** Original uploaded filename (for display). */
  @Column() filename!: string;

  /**
   * Relative folder under RUNS_BASE_PATH holding this run's artifacts.
   * Usually equal to String(id), but kept as a column so we can relocate.
   */
  @Column({ name: "storage_dir" }) storageDir!: string;

  /** Name of the image file inside storageDir, e.g. "image.jpg". */
  @Column({ name: "image_name" }) imageName!: string;

  @Column({ name: "image_w", type: "int", nullable: true })
  imageW!: number | null;

  @Column({ name: "image_h", type: "int", nullable: true })
  imageH!: number | null;

  @Column({ type: "varchar", nullable: true })
  device!: string | null;

  @Column({ name: "document_type" }) documentType!: string;

  /** Small JSON: { classical: 1074, vlm: 12055, hybrid: 25388 } (ms). */
  @Column({ type: "json", nullable: true })
  timings!: Record<string, number> | null;

  /** Python's recommended_for_production, e.g. "hybrid". */
  @Column({ type: "varchar", nullable: true })
  recommended!: string | null;

  /** Denormalised flag for fast list filtering. */
  @Column({ name: "has_ground_truth", default: false })
  hasGroundTruth!: boolean;

  /**
   * Tiny per-approach scoreboard used by the list view.
   * Example: { classical: 0.8, vlm: 0.95, hybrid: 0.92 } (accuracy 0..1).
   * Filled in by the metrics library in Stage 4.
   */
  @Column({ type: "json", nullable: true })
  summary!: Record<string, number> | null;

  @CreateDateColumn({ name: "created_at" }) createdAt!: Date;
}
```

---

## 1.4 Register the new entities

### File to modify: `api/src/data-source.ts`

Add the two imports and extend the `entities` array.

```ts
import { DocumentType } from "./entities/DocumentType";
import { ComparisonRun } from "./entities/ComparisonRun";

// ...

export const AppDataSource = new DataSource({
  // ... existing config ...
  entities: [Model, User, ModelFile, TestRun, DocumentType, ComparisonRun],
});
```

### Test

Restart the API. Thanks to `synchronize: true`, TypeORM will create the
`document_types` and `comparison_runs` tables automatically. Verify with
`psql` or any GUI:

```sql
\d document_types
\d comparison_runs
```

Both tables must exist. Stop and fix if not.

---

## 1.5 Seed the `receipt` document type

### File to create: `api/src/scripts/seedDocumentTypes.ts`

```ts
// api/src/scripts/seedDocumentTypes.ts
import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { DocumentType } from "../entities/DocumentType";

const RECEIPT_SCHEMA = {
  fields: [
    {
      key: "DATE",
      label: "Date",
      type: "date",
      formats: ["DD.MM.YY", "DD.MM.YYYY"],
    },
    { key: "FB", label: "FB", type: "text" },
    { key: "FD", label: "FD", type: "text" },
    { key: "SUM", label: "Sum", type: "money", tolerance: 0.01 },
  ],
  arrays: [
    {
      key: "ORDER",
      label: "Order lines",
      rowKey: "NAME",
      match: "hungarian",
      fields: [
        { key: "NAME", type: "text" },
        { key: "PRICE", type: "money", tolerance: 0.01 },
        { key: "QUANTITY", type: "number" },
      ],
    },
  ],
};

(async () => {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(DocumentType);
  const existing = await repo.findOne({ key: "receipt" });
  if (existing) {
    existing.name = "Receipt";
    existing.schema = RECEIPT_SCHEMA;
    await repo.save(existing);
    console.log("Receipt document type updated.");
  } else {
    const dt = repo.create({
      key: "receipt",
      name: "Receipt",
      schema: RECEIPT_SCHEMA,
    });
    await repo.save(dt);
    console.log("Receipt document type created.");
  }
  await AppDataSource.destroy();
})();
```

Run:

```powershell
cd D:/Master/service/application/api
npx ts-node src/scripts/seedDocumentTypes.ts
```

Expected output: `Receipt document type created.` (or "updated" on reruns).

Verify:

```sql
SELECT id, key, name FROM document_types;
```

---

## 1.6 Document types routes

### File to create: `api/src/controllers/documentTypeController.ts`

```ts
// api/src/controllers/documentTypeController.ts
import { Request, Response } from "express";
import { DocumentType } from "../entities/DocumentType";

export const listDocumentTypes = async (_req: Request, res: Response) => {
  const items = await DocumentType.find({ order: { id: "ASC" } });
  res.json(items);
};

export const getDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const dt = await DocumentType.findOne({ id });
  if (!dt) return res.status(404).json({ error: "Not found" });
  res.json(dt);
};

export const createDocumentType = async (req: Request, res: Response) => {
  const { key, name, schema } = req.body;
  if (!key || !name || !schema) {
    return res.status(400).json({ error: "key, name, schema are required" });
  }
  const exists = await DocumentType.findOne({ key });
  if (exists) return res.status(409).json({ error: "key already exists" });
  const dt = DocumentType.create({ key, name, schema });
  await dt.save();
  res.status(201).json(dt);
};

export const updateDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const dt = await DocumentType.findOne({ id });
  if (!dt) return res.status(404).json({ error: "Not found" });
  const { name, schema } = req.body;
  if (name !== undefined) dt.name = name;
  if (schema !== undefined) dt.schema = schema;
  await dt.save();
  res.json(dt);
};
```

### File to create: `api/src/routes/documentTypes.ts`

```ts
// api/src/routes/documentTypes.ts
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  listDocumentTypes,
  getDocumentType,
  createDocumentType,
  updateDocumentType,
} from "../controllers/documentTypeController";

const router = Router();
router.get("/", asyncHandler(listDocumentTypes));
router.get("/:id", asyncHandler(getDocumentType));
router.post("/", asyncHandler(createDocumentType));
router.put("/:id", asyncHandler(updateDocumentType));
export default router;
```

### Register in `api/src/routes/index.ts`

Add near the other `router.use(...)` lines (keep them JWT‑protected via
`requireAuth`):

```ts
import documentTypesRouter from "./documentTypes";
// ...
router.use("/document-types", requireAuth, documentTypesRouter);
```

### Test

With the dev server running and a valid JWT:

```powershell
curl.exe http://localhost:3000/api/document-types -H "Authorization: Bearer <token>"
```

Response must include the seeded `receipt`.

---

## 1.7 The compare controller

### File to create: `api/src/controllers/compareController.ts`

```ts
// api/src/controllers/compareController.ts
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import config from "../../config/default.json";
import { ComparisonRun } from "../entities/ComparisonRun";
import { DocumentType } from "../entities/DocumentType";
import { User } from "../entities/User";
import {
  artifactPath,
  createRunDir,
  imagePath,
  readJson,
  writeJson,
} from "../services/runStorage";

const COMPARE_URL = (config as any).COMPARE_SERVICE_URL as string;

/**
 * Uploads the file to the Python compare API, stores artifacts on disk, and
 * creates a lean ComparisonRun row. Returns the saved run plus the raw
 * response so the UI can render everything in one round trip.
 */
export async function runCompare(opts: {
  file: Express.Multer.File;
  documentTypeKey: string;
  userId: number | null;
}): Promise<{ run: ComparisonRun; response: any }> {
  const { file, documentTypeKey, userId } = opts;

  // 1. Validate document type exists so we fail early.
  const dt = await DocumentType.findOne({ key: documentTypeKey });
  if (!dt) {
    throw {
      statusCode: 400,
      message: `Unknown documentType "${documentTypeKey}"`,
    };
  }

  // 2. Create a DB row so we get an id (we use the id as the folder name).
  const user = userId ? await User.findOne({ id: userId }) : null;
  const run = ComparisonRun.create({
    user,
    filename: file.originalname,
    storageDir: "tbd", // filled below
    imageName: "tbd", // filled below
    imageW: null,
    imageH: null,
    device: null,
    documentType: documentTypeKey,
    timings: null,
    recommended: null,
    hasGroundTruth: false,
    summary: null,
  });
  await run.save();

  // 3. Move the uploaded file into the run folder with a clean name.
  const ext = path.extname(file.originalname) || ".bin";
  const imageName = `image${ext}`;
  run.storageDir = String(run.id);
  run.imageName = imageName;

  await createRunDir(run.id);
  const destImagePath = imagePath(run.id, imageName);
  await fs.promises.rename(file.path, destImagePath);

  // 4. Build multipart request to Python.
  const form = new FormData();
  form.append("file", fs.createReadStream(destImagePath), file.originalname);
  form.append("document_type", documentTypeKey);

  let response: any;
  try {
    const resp = await axios.post(`${COMPARE_URL}/compare`, form, {
      headers: form.getHeaders(),
      timeout: 180_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    response = resp.data;
  } catch (err: any) {
    // Save an error artifact so the UI can still render something useful.
    await writeJson(artifactPath(run.id, "raw_response"), {
      ok: false,
      error: err?.message ?? "compare service unreachable",
    });
    await run.save();
    throw {
      statusCode: 502,
      message: "Compare service failed: " + (err?.message ?? err),
    };
  }

  // 5. Persist all artifacts to disk (heavy JSON — never in DB).
  await writeJson(artifactPath(run.id, "raw_response"), response);
  if (response?.main)
    await writeJson(artifactPath(run.id, "classical"), response.main);
  if (response?.qwen)
    await writeJson(artifactPath(run.id, "vlm"), response.qwen);
  if (response?.hybrid)
    await writeJson(artifactPath(run.id, "hybrid"), response.hybrid);

  // 6. Copy tiny metadata onto the DB row.
  const meta = response?.run_meta ?? {};
  run.imageW = typeof meta.image_w === "number" ? meta.image_w : null;
  run.imageH = typeof meta.image_h === "number" ? meta.image_h : null;
  run.device = meta.device != null ? String(meta.device) : null;
  run.timings = meta.timings_ms
    ? {
        classical: Number(meta.timings_ms.main ?? 0),
        vlm: Number(meta.timings_ms.qwen ?? 0),
        hybrid: Number(meta.timings_ms.hybrid ?? 0),
      }
    : null;
  run.recommended = response?.recommended_for_production ?? null;
  await run.save();

  return { run, response };
}

/** Load a run's artifacts from disk, returning null for missing ones. */
export async function loadRunArtifacts(runId: number) {
  const [raw, classical, vlm, hybrid, groundTruth, metrics] = await Promise.all(
    [
      readJson(artifactPath(runId, "raw_response")),
      readJson(artifactPath(runId, "classical")),
      readJson(artifactPath(runId, "vlm")),
      readJson(artifactPath(runId, "hybrid")),
      readJson(artifactPath(runId, "ground_truth")),
      readJson(artifactPath(runId, "metrics")),
    ],
  );
  return { raw, classical, vlm, hybrid, groundTruth, metrics };
}
```

**Beginner notes:**

- Step 2 saves the row **before** we have the artifacts so the `id` can
  drive the folder name (`<id>/`).
- Step 3 uses `fs.rename` to move the multer‑uploaded temp file into the run
  folder. This is atomic on the same drive and avoids copying large images.
- Step 4 uses `form.getHeaders()`; you **must** pass these to axios or the
  boundary string will be missing and the Python service will reject the
  request.
- Step 5 uses optional chaining (`response?.main`) because if Python's
  compare fails partway, some pipelines may be missing.

---

## 1.8 The runs controller

### File to create: `api/src/controllers/runsController.ts`

```ts
// api/src/controllers/runsController.ts
import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { Like, Between, MoreThanOrEqual, LessThanOrEqual } from "typeorm";
import { ComparisonRun } from "../entities/ComparisonRun";
import { artifactPath, imagePath, removeRunDir } from "../services/runStorage";
import { loadRunArtifacts, runCompare } from "./compareController";
import { AuthRequest } from "../utils/authMiddleware";

export const postCompare = async (req: AuthRequest, res: Response) => {
  if (!req.file) throw { statusCode: 400, message: "No file uploaded" };
  const documentType = (req.body.documentType ||
    req.query.documentType) as string;
  if (!documentType) {
    throw { statusCode: 400, message: "documentType is required" };
  }

  const { run, response } = await runCompare({
    file: req.file,
    documentTypeKey: documentType,
    userId: req.userId ?? null,
  });

  res.status(201).json({ runId: run.id, run, response });
};

export const listRuns = async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (q.documentType) where.documentType = q.documentType;
  if (q.hasGroundTruth === "true") where.hasGroundTruth = true;
  if (q.hasGroundTruth === "false") where.hasGroundTruth = false;
  if (q.search) where.filename = Like(`%${q.search}%`);

  const limit = q.limit ? Math.min(Number(q.limit), 200) : 20;
  const offset = q.offset ? Number(q.offset) : 0;

  const [items, total] = await ComparisonRun.findAndCount({
    where,
    order: { createdAt: "DESC" },
    take: limit,
    skip: offset,
  });
  res.json({ total, items });
};

export const getRun = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const run = await ComparisonRun.findOne({ id });
  if (!run) return res.status(404).json({ error: "Not found" });
  const artifacts = await loadRunArtifacts(id);
  res.json({ run, artifacts });
};

export const deleteRun = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const run = await ComparisonRun.findOne({ id });
  if (!run) return res.status(404).send();
  await removeRunDir(id);
  await run.remove();
  res.status(204).send();
};

/** Stream a single artifact JSON by short name. */
export const getArtifact = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const name = req.params.name;
  const MAP: Record<string, string> = {
    raw: "raw_response",
    classical: "classical",
    vlm: "vlm",
    hybrid: "hybrid",
    "ground-truth": "ground_truth",
    metrics: "metrics",
  };
  const file = MAP[name];
  if (!file) return res.status(400).json({ error: "Unknown artifact" });
  const filePath = artifactPath(id, file as any);
  if (!fs.existsSync(filePath)) return res.status(404).send();
  res.sendFile(filePath);
};

/** Stream the original uploaded image of a run. */
export const getRunImage = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const run = await ComparisonRun.findOne({ id });
  if (!run) return res.status(404).send();
  const file = imagePath(id, run.imageName);
  if (!fs.existsSync(file)) return res.status(404).send();
  res.sendFile(file);
};
```

---

## 1.9 Routes file

### File to create: `api/src/routes/runs.ts`

```ts
// api/src/routes/runs.ts
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../utils/asyncHandler";
import {
  postCompare,
  listRuns,
  getRun,
  deleteRun,
  getArtifact,
  getRunImage,
} from "../controllers/runsController";

const router = Router();
const upload = multer({ dest: "tmp/" });

// POST /api/compare — we mount this separately in index.ts (see below).
router.post("/compare", upload.single("file"), asyncHandler(postCompare));

// /api/runs — list, detail, artifacts, image, delete.
router.get("/runs", asyncHandler(listRuns));
router.get("/runs/:id", asyncHandler(getRun));
router.delete("/runs/:id", asyncHandler(deleteRun));
router.get("/runs/:id/image", asyncHandler(getRunImage));
router.get("/runs/:id/artifacts/:name", asyncHandler(getArtifact));

export default router;
```

### Register in `api/src/routes/index.ts`

Add below the existing `router.use(...)` calls, **before** the 404 handler:

```ts
import runsRouter from "./runs";
// ...
router.use(requireAuth, runsRouter); // everything in runs.ts is JWT‑protected
```

**Important:** remove or comment out the old detection mount
`router.use("/detect", requireAuth, detectRouter);` **only in Stage 3**.
Keep it for now so nothing existing breaks.

---

## 1.10 End‑to‑end manual test

1. Restart the API. Confirm no TypeScript compile errors.
2. Log in from the React app, copy the JWT from localStorage in the browser
   dev tools (`Application → Local Storage → token`).
3. From PowerShell, call the compare endpoint (replace `<TOKEN>` and the
   image path):

   ```powershell
   curl.exe -X POST "http://localhost:3000/api/compare" `
     -H "Authorization: Bearer <TOKEN>" `
     -F "file=@D:/path/to/receipt.jpg" `
     -F "documentType=receipt"
   ```

   Expected JSON response shape:

   ```json
   {
     "runId": 1,
     "run": { "id": 1, "filename": "receipt.jpg", ... },
     "response": {
       "ok": true,
       "main": { ... },
       "qwen": { ... },
       "hybrid": { ... },
       "recommended_for_production": "hybrid"
     }
   }
   ```

4. Inspect the disk:

   ```powershell
   dir D:/Master/service/application/api/tmp/runs/1
   ```

   You must see: `image.jpg`, `raw_response.json`, `classical.json`,
   `vlm.json`, `hybrid.json`.

5. Inspect the database:

   ```sql
   SELECT id, filename, storage_dir, image_name, document_type, recommended,
          timings, has_ground_truth FROM comparison_runs;
   ```

   One row. `timings` holds `{classical, vlm, hybrid}`.

6. List runs:

   ```powershell
   curl.exe "http://localhost:3000/api/runs?limit=10" -H "Authorization: Bearer <TOKEN>"
   ```

   Expected: `{"total": 1, "items": [ {...} ]}`.

7. Fetch a run detail:

   ```powershell
   curl.exe "http://localhost:3000/api/runs/1" -H "Authorization: Bearer <TOKEN>"
   ```

   Response must include both `run` (DB row) and `artifacts` with `raw`,
   `classical`, `vlm`, `hybrid` (and `groundTruth`, `metrics` as `null`).

8. Delete the run:

   ```powershell
   curl.exe -X DELETE "http://localhost:3000/api/runs/1" -H "Authorization: Bearer <TOKEN>"
   ```

   Folder `api/tmp/runs/1/` must be gone. DB row must be gone.

---

## 1.11 Common pitfalls

- **"No such file" on `fs.rename`**: multer puts the upload in `api/tmp/`
  by default. The rename target must be on the same drive. Since
  `RUNS_BASE_PATH` is inside `api/tmp/`, this is fine. If you relocate
  `RUNS_BASE_PATH` to another drive, switch to `fs.copyFile` + `fs.unlink`.
- **Axios 413 "payload too large"**: already handled via
  `maxContentLength: Infinity, maxBodyLength: Infinity`.
- **CORS / auth errors from React**: Stage 2 handles that. For now, curl is
  enough.
- **TypeORM does not create new columns after changing an entity**: when
  `synchronize: true` is on, restarting the API is enough. If it still
  doesn't, drop the table manually (`DROP TABLE comparison_runs;`) and
  restart — it will recreate it. This is safe because the table is new.

---

## 1.12 Definition of Done

- [ ] `api/src/entities/DocumentType.ts` exists and is registered.
- [ ] `api/src/entities/ComparisonRun.ts` exists and is registered.
- [ ] Both tables exist in Postgres (`\d document_types`, `\d comparison_runs`).
- [ ] `receipt` row exists in `document_types` (seed script ran).
- [ ] `GET /api/document-types` returns `[{ key: "receipt", ... }]`.
- [ ] `POST /api/compare` with a real image returns the merged response.
- [ ] On disk: `api/tmp/runs/<id>/` contains `image.*`,
      `raw_response.json`, `classical.json`, `vlm.json`, `hybrid.json`.
- [ ] `GET /api/runs` lists the run.
- [ ] `GET /api/runs/:id` returns DB row + artifacts.
- [ ] `GET /api/runs/:id/image` streams the image back (open in browser).
- [ ] `DELETE /api/runs/:id` removes both folder and DB row.
- [ ] React app still boots; existing pages still work (they still call the
      old detect endpoint).
- [ ] Commit: `stage-01: comparison runs entities and endpoints`.
