# Stage 1 — Detector model registry (backend)

**Estimated effort:** 1.5–2 days. **Dependencies:** Stage 0. **Unblocks:** Stages 2, 3, 5, 7.

## Goal

Turn the existing loose `Model` table into a real **detector registry**:

- Add the columns we need to identify a detector model unambiguously and to transfer it to Colab.
- Add lifecycle endpoints (`upload .pt`, `validate`, `attach to document type`).
- Compute `sha256` and `fileSize` on upload (Stage 5 needs them).
- Resolve the `/file` vs `/files` route mismatch: backend stays `/file` (singular), frontend will be fixed in Stage 7.
- Add the two **sync endpoints** (`GET /api/models/active`, `GET /api/models/:id/download`) so Colab can pull files later.

## Project background you must know first

- The current `Model` entity is at [api/src/entities/Model.ts](../api/src/entities/Model.ts). It already has `id, name, type, filePath, cocoClasses, displayConfig, languages, createdAt`. We will add fields, not rename.
- The current model controller is [api/src/controllers/modelController.ts](../api/src/controllers/modelController.ts). It already implements:
  - `createModel` (lines 20–42) — creates metadata + base directory.
  - `uploadModelFile` (lines 59–91) — receives a multipart `file`, moves it under `MODELS_BASE_PATH/<modelName>/<unique-folder>/<file>`, sets `model.filePath`.
  - `uploadDatasetFile` (lines 94–127) — similar, but only accepts `.rar` and stores under `<modelDir>/dataset/dataset.rar`.
- Routes are wired in [api/src/routes/models.ts](../api/src/routes/models.ts). The current upload route is `POST /api/models/:modelId/file` (singular).
- The frontend currently posts to `POST /api/models/:id/files` (plural — wrong). We are **not** changing this route in this stage; we standardize on `/file` and Stage 7 fixes the frontend.
- TypeORM `synchronize: true` will create new columns automatically when you restart the API.

## Files to read first (~20 minutes)

1. [api/src/entities/Model.ts](../api/src/entities/Model.ts) (whole file).
2. [api/src/controllers/modelController.ts](../api/src/controllers/modelController.ts) (whole file).
3. [api/src/routes/models.ts](../api/src/routes/models.ts) (whole file).
4. [api/src/routes/index.ts](../api/src/routes/index.ts) (so you understand auth scoping — the sync endpoints must be added **before** `requireAuth`).
5. [api/src/utils/syncTokenMiddleware.ts](../api/src/utils/syncTokenMiddleware.ts) (from Stage 0).
6. [api/src/utils/asyncHandler.ts](../api/src/utils/asyncHandler.ts) (the wrapper used on every async route).

## Tasks

### Task 1.1 — Extend the `Model` entity

In [api/src/entities/Model.ts](../api/src/entities/Model.ts), add these `@Column` properties to the class. Keep the existing columns untouched.

```ts
  @Column({ default: "yolo" })
  family!: string;

  @Column({ name: "classes_count", type: "int", nullable: true })
  classesCount?: number;

  @Column({ type: "json", nullable: true })
  classMap?: Record<string, string>;

  @Column({ name: "input_image_size", type: "int", nullable: true })
  inputImageSize?: number;

  @Column({ name: "confidence_defaults", type: "json", nullable: true })
  confidenceDefaults?: { default: number; perClass?: Record<string, number> };

  @Column({ name: "document_type_id", type: "int", nullable: true })
  documentTypeId?: number;

  @Column({ default: "uploaded" })
  status!: "uploaded" | "validated" | "active" | "archived";

  @Column({ default: 1 })
  version!: number;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  sha256?: string;

  @Column({ name: "file_size", type: "bigint", nullable: true })
  fileSize?: number;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
```

Make sure to import `UpdateDateColumn` from `typeorm` at the top of the file.

When you restart the API, TypeORM should add these columns. If you see a TypeORM error about altering existing columns, check that you didn't change the type of a previously existing column.

### Task 1.2 — Compute sha256 + fileSize during upload

Modify `uploadModelFile` in [api/src/controllers/modelController.ts](../api/src/controllers/modelController.ts). After the file has been moved to its final destination, compute the sha256 and file size, and persist them on the model row.

```ts
import crypto from "crypto";
import { promises as fsp } from "fs";

async function computeSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = (await import("fs")).createReadStream(filePath);
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}
```

After the move:

```ts
const stat = await fsp.stat(model.filePath);
model.sha256 = await computeSha256(model.filePath);
model.fileSize = stat.size;
await model.save();
```

Also enforce the `.pt`-only rule for detector files (the dataset endpoint stays `.rar` only):

```ts
if (!req.file.originalname.toLowerCase().endsWith(".pt")) {
  throw { statusCode: 400, message: "only .pt files are accepted as detector weights" };
}
```

### Task 1.3 — Add lifecycle endpoints

In [api/src/controllers/modelController.ts](../api/src/controllers/modelController.ts), add new handlers and export them:

#### `validateModel`

```ts
export const validateModel = async (req: Request, res: Response) => {
  const id = Number(req.params.modelId);
  const model = await Model.findOne(id);
  if (!model) throw { statusCode: 404, message: "model not found" };
  if (!model.filePath || !(await fsp.stat(model.filePath).catch(() => null))) {
    throw { statusCode: 400, message: "model file is missing on disk" };
  }
  const cm = model.classMap ?? {};
  if (model.classesCount != null && Object.keys(cm).length !== model.classesCount) {
    throw {
      statusCode: 400,
      message: `classMap size (${Object.keys(cm).length}) does not match classesCount (${model.classesCount})`,
    };
  }
  if (model.documentTypeId != null) {
    const docType = await DocumentType.findOne(model.documentTypeId);
    const allowed = collectCanonicalLabels(docType);
    const unknown = Object.values(cm).filter((label) => !allowed.has(label));
    if (unknown.length > 0) {
      throw {
        statusCode: 400,
        message: `classMap references labels not present in document type schema: ${unknown.join(", ")}`,
      };
    }
  }
  model.status = "validated";
  await model.save();
  res.json(model);
};
```

`collectCanonicalLabels(docType)` is a small helper that returns the set of all field keys from `docType.schema.fields[*].key` and `docType.schema.arrays[*].fields[*].key` plus the array container keys. Stub it for now and Stage 2 will refine it once `DocumentType.detectorConfig.labelRoles` exists.

#### `deleteModel` (extend existing if present)

Block deletion if the model is active on a document type:

```ts
export const deleteModel = async (req: Request, res: Response) => {
  const id = Number(req.params.modelId);
  const model = await Model.findOne(id);
  if (!model) throw { statusCode: 404, message: "model not found" };
  if (model.status === "active") {
    throw {
      statusCode: 409,
      message: "cannot delete an active detector model; archive it first",
    };
  }
  // existing deletion logic (remove file, remove row)
};
```

### Task 1.4 — Add sync endpoints (consumed by Colab)

Add two new handlers (`listActiveModels`, `downloadModelFile`) to [api/src/controllers/modelController.ts](../api/src/controllers/modelController.ts):

```ts
export const listActiveModels = async (_req: Request, res: Response) => {
  const models = await Model.find({ where: { status: "active" } });
  const publicBase = config.PUBLIC_API_URL;
  res.json(
    models
      .filter((m) => m.documentTypeId != null && m.sha256 && m.filePath)
      .map(async (m) => {
        const docType = await DocumentType.findOne(m.documentTypeId);
        return {
          modelId: m.id,
          modelVersion: m.version,
          documentTypeKey: docType?.key,
          documentTypeVersion: (docType as any)?.version ?? 1,
          sha256: m.sha256,
          fileSize: Number(m.fileSize),
          downloadUrl: `${publicBase}/models/${m.id}/download`,
          classMap: m.classMap,
        };
      }),
  );
};

export const downloadModelFile = async (req: Request, res: Response) => {
  const id = Number(req.params.modelId);
  const model = await Model.findOne(id);
  if (!model || !model.filePath) {
    throw { statusCode: 404, message: "model file not found" };
  }
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("ETag", `"${model.sha256 ?? ""}"`);
  res.setHeader("X-Model-Version", String(model.version));
  res.setHeader("Content-Length", String(model.fileSize ?? ""));
  res.sendFile(path.resolve(model.filePath));
};
```

Note: the `Promise.all` flattening above is important — using async inside `.map` produces an array of promises. Fix it as:

```ts
const rows = await Promise.all(models.map(async (m) => { ... }));
res.json(rows.filter(Boolean));
```

### Task 1.5 — Wire the routes

Edit [api/src/routes/models.ts](../api/src/routes/models.ts):

```ts
router.post(
  "/:modelId/validate",
  asyncHandler(validateModel),
);
```

Then in [api/src/routes/index.ts](../api/src/routes/index.ts), add the **two sync endpoints before** `router.use(requireAuth, ...)`:

```ts
import { requireSyncToken } from "../utils/syncTokenMiddleware";
import {
  listActiveModels,
  downloadModelFile,
} from "../controllers/modelController";

router.get(
  "/models/active",
  requireSyncToken,
  asyncHandler(listActiveModels),
);
router.get(
  "/models/:modelId/download",
  requireSyncToken,
  asyncHandler(downloadModelFile),
);
```

These must run before `requireAuth` because Colab is not a logged-in user.

### Task 1.6 — Update Swagger docs

Edit [api/src/swagger/models.swagger.ts](../api/src/swagger/models.swagger.ts) to add the new endpoints (`/models/:id/validate`, `/models/active`, `/models/:id/download`) and the new `Model` properties (`status`, `version`, `sha256`, etc.).

### Task 1.7 — Backfill existing rows (one-time data fix)

If you already have `Model` rows in your dev DB from before this stage, after restart they will have `status = "uploaded"`, `version = 1`, and null `sha256`. Open a `psql` shell or Adminer and either delete those rows (if they're test data) or write a tiny script to recompute sha256 from `filePath`. A `npx ts-node api/src/scripts/backfillModelHashes.ts` script is a nice-to-have but not required.

## How to verify

Use curl (replace `$TOKEN` with your JWT and `$SYNC` with `COLAB_SYNC_TOKEN`):

```bash
# 1. Create model metadata
curl -X POST http://localhost:3000/api/models \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-detector","type":"yolo","family":"yolo","classesCount":3,"classMap":{"0":"DATE","1":"TOTAL","2":"ITEM"}}'

# 2. Upload a .pt file
curl -X POST http://localhost:3000/api/models/1/file \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/model.pt"

# 3. Verify sha256 + fileSize were set
curl http://localhost:3000/api/models -H "Authorization: Bearer $TOKEN"

# 4. Validate it
curl -X POST http://localhost:3000/api/models/1/validate \
  -H "Authorization: Bearer $TOKEN"

# 5. Confirm sync endpoint works with token
curl http://localhost:3000/api/models/active -H "X-Sync-Token: $SYNC"

# 6. Confirm sync endpoint rejects bad token
curl -i http://localhost:3000/api/models/active -H "X-Sync-Token: wrong"
# expect 401

# 7. Confirm download works and headers are right
curl -i http://localhost:3000/api/models/1/download -H "X-Sync-Token: $SYNC" -o /tmp/dl.pt
# expect ETag, X-Model-Version, Content-Length headers
sha256sum /tmp/dl.pt
# should match the sha256 from step 3
```

Reject path:

```bash
# upload a .txt
curl -X POST http://localhost:3000/api/models/1/file \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/etc/hosts"
# expect 400 "only .pt files are accepted ..."
```

## Done when

- [ ] `Model` entity has all new columns and the API restarts cleanly.
- [ ] `POST /api/models/:id/file` rejects non-`.pt` files.
- [ ] `POST /api/models/:id/file` populates `sha256` and `fileSize` on the row.
- [ ] `POST /api/models/:id/validate` exists and enforces the rules in Task 1.3.
- [ ] `DELETE /api/models/:id` blocks active models with 409.
- [ ] `GET /api/models/active` returns active models with download URLs (auth: `X-Sync-Token`).
- [ ] `GET /api/models/:id/download` streams the `.pt` with correct headers (auth: `X-Sync-Token`).
- [ ] Both sync endpoints reject missing/wrong tokens with 401.
- [ ] Swagger UI shows the new endpoints.
- [ ] All existing `/api/models` endpoints still work (no regression).

## Common pitfalls

- **Forgetting to restart the API** after entity changes — TypeORM only syncs on startup.
- **Putting sync endpoints inside `requireAuth`** — Colab has no user, so they must live **above** the auth middleware in [routes/index.ts](../api/src/routes/index.ts).
- **`fileSize` as `int`** — `.pt` files often exceed 2 GB. Use `bigint`. When reading, wrap with `Number(m.fileSize)` or accept the string TypeORM returns.
- **`res.sendFile` requires absolute path** — always wrap with `path.resolve(...)`.
- **Returning the raw `Model` entity in `listActiveModels` instead of the DTO** — leak of file paths is a security smell. Return only what Colab needs.
- **Frontend will still 404 on uploads** because it posts to `/files` (plural). That is fixed in Stage 7. Do not "helpfully" also accept `/files` here — we want one canonical route.

## Hand-off

- Stage 2 will use `Model.documentTypeId`, `Model.classMap`, `Model.status`, and the `attach detector` flow.
- Stage 3 will read `Model.sha256`, `Model.version`, `Model.filePath`, `Model.classMap` to build the Python compare request.
- Stage 5 will consume `GET /models/active` and `GET /models/:id/download`.
- Stage 7 will fix the frontend `/files` -> `/file` mismatch and surface the new fields.
