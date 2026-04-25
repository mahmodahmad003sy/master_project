# Stage 2 — DocumentType v2 (backend)

**Estimated effort:** 1.5 days. **Dependencies:** Stages 0, 1. **Unblocks:** Stages 3, 6.

## Goal

Make `DocumentType` the **single source of truth** for everything that defines a document type at runtime. Today it only stores `{ id, key, name, schema }`. After this stage it will own the schema, detector configuration, prompt template, active detector binding, status, and version — everything the compare flow needs.

It will also expose CRUD v2 endpoints that the wizard UI in Stage 6 can call.

## Project background you must know first

- The current entity is at [api/src/entities/DocumentType.ts](../api/src/entities/DocumentType.ts). The current shape is intentionally minimal because at the time the project assumed only one type ever existed.
- The current controller is at [api/src/controllers/documentTypeController.ts](../api/src/controllers/documentTypeController.ts) and only does `GET / GET:id / POST / PUT`.
- `schema` is a JSON column already used by the metrics scorer in [api/src/services/metrics.ts](../api/src/services/metrics.ts). The expected shape is:

  ```ts
  type Schema = {
    fields: Array<{ key: string; label?: string; type: "text" | "number" | "money" | "date"; tolerance?: number; formats?: string[] }>;
    arrays: Array<{
      key: string;
      label?: string;
      rowKey?: string;
      match?: "hungarian" | "ordered";
      fields: Array<{ key: string; type: "text" | "number" | "money" | "date" }>;
    }>;
  };
  ```

- The seeded receipt schema at [api/src/scripts/seedDocumentTypes.ts](../api/src/scripts/seedDocumentTypes.ts) is a reference example of the shape.
- TypeORM `synchronize: true` will create the new columns automatically on restart (Stage 0 README).
- The `Model` entity already has `documentTypeId` (added in Stage 1) — we use it to bind a detector.

## Files to read first (~20 minutes)

1. [api/src/entities/DocumentType.ts](../api/src/entities/DocumentType.ts) (whole file).
2. [api/src/controllers/documentTypeController.ts](../api/src/controllers/documentTypeController.ts) (whole file).
3. [api/src/routes/documentTypes.ts](../api/src/routes/documentTypes.ts) (whole file).
4. [api/src/scripts/seedDocumentTypes.ts](../api/src/scripts/seedDocumentTypes.ts) (whole file).
5. [api/src/services/metrics.ts](../api/src/services/metrics.ts) lines 1–80 (so you understand what `schema.fields` / `schema.arrays` mean to the scorer).
6. [api/src/entities/Model.ts](../api/src/entities/Model.ts) (post-Stage-1).

## Tasks

### Task 2.1 — Extend the `DocumentType` entity

In [api/src/entities/DocumentType.ts](../api/src/entities/DocumentType.ts), add:

```ts
  @Column({ default: "draft" })
  status!: "draft" | "active" | "archived";

  @Column({ default: 1 })
  version!: number;

  @Column({ name: "detector_model_id", type: "int", nullable: true })
  detectorModelId?: number;

  @Column({ name: "prompt_template", type: "text", nullable: true })
  promptTemplate?: string;

  @Column({ name: "field_config", type: "json", nullable: true })
  fieldConfig?: Record<string, unknown>;

  @Column({ name: "detector_config", type: "json", nullable: true })
  detectorConfig?: {
    classMap: Record<string, string>;
    labelRoles: Record<string, "single" | "arrayContainer" | "arrayChild">;
    groupingRules?: Record<string, unknown>;
  };

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
```

Existing `id, key, name, schema, createdAt` stay.

### Task 2.2 — Helpers for validation

Add a small helper module [api/src/services/documentTypeValidation.ts](../api/src/services/documentTypeValidation.ts):

```ts
import type { DocumentType } from "../entities/DocumentType";

export function collectCanonicalLabels(dt: DocumentType): Set<string> {
  const labels = new Set<string>();
  const schema: any = dt.schema ?? {};
  for (const f of schema.fields ?? []) labels.add(f.key);
  for (const a of schema.arrays ?? []) {
    labels.add(a.key);
    for (const f of a.fields ?? []) labels.add(f.key);
  }
  return labels;
}

export function validateDetectorConfigAgainstSchema(dt: DocumentType): void {
  const allowed = collectCanonicalLabels(dt);
  const cfg = dt.detectorConfig;
  if (!cfg) {
    throw { statusCode: 400, message: "detectorConfig is required to activate" };
  }
  for (const label of Object.values(cfg.classMap ?? {})) {
    if (!allowed.has(label)) {
      throw {
        statusCode: 400,
        message: `classMap label "${label}" is not present in schema`,
      };
    }
  }
  for (const label of Object.keys(cfg.labelRoles ?? {})) {
    if (!allowed.has(label)) {
      throw {
        statusCode: 400,
        message: `labelRoles label "${label}" is not present in schema`,
      };
    }
  }
}

const CONFIG_KEYS_THAT_BUMP_VERSION = ["schema", "detectorConfig", "promptTemplate"] as const;

export function shouldBumpVersion(
  before: Pick<DocumentType, "schema" | "detectorConfig" | "promptTemplate">,
  after: Partial<DocumentType>,
): boolean {
  return CONFIG_KEYS_THAT_BUMP_VERSION.some(
    (k) => k in after && JSON.stringify((before as any)[k]) !== JSON.stringify((after as any)[k]),
  );
}
```

This file will also be imported by Stage 1's `validateModel` once Stage 2 is merged. Until then, Stage 1 can use a stub.

### Task 2.3 — Extend the controller

Edit [api/src/controllers/documentTypeController.ts](../api/src/controllers/documentTypeController.ts). Keep the existing handlers; modify and add as below.

#### `createDocumentType` — accept the full payload

```ts
export const createDocumentType = async (req: Request, res: Response) => {
  const { key, name, schema, fieldConfig, detectorConfig, promptTemplate, modelId } = req.body;
  const dt = DocumentType.create({
    key,
    name,
    schema,
    fieldConfig,
    detectorConfig,
    promptTemplate,
    status: "draft",
    version: 1,
  });
  await dt.save();
  if (modelId) {
    await attachDetectorInternal(dt, modelId);
  }
  res.status(201).json(dt);
};
```

#### `updateDocumentType` — bump version on config change

```ts
export const updateDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const dt = await DocumentType.findOne(id);
  if (!dt) throw { statusCode: 404, message: "document type not found" };
  const before = { schema: dt.schema, detectorConfig: dt.detectorConfig, promptTemplate: dt.promptTemplate };
  Object.assign(dt, req.body);
  if (shouldBumpVersion(before, req.body)) {
    dt.version = (dt.version ?? 1) + 1;
  }
  await dt.save();
  res.json(dt);
};
```

#### `activateDocumentType`

```ts
export const activateDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const dt = await DocumentType.findOne(id);
  if (!dt) throw { statusCode: 404, message: "document type not found" };
  if (!dt.schema) throw { statusCode: 400, message: "schema is required" };
  if (!dt.promptTemplate) throw { statusCode: 400, message: "promptTemplate is required" };
  validateDetectorConfigAgainstSchema(dt);
  if (!dt.detectorModelId) {
    throw { statusCode: 400, message: "no detector model attached" };
  }
  const model = await Model.findOne(dt.detectorModelId);
  if (!model || model.status !== "validated") {
    throw {
      statusCode: 400,
      message: "attached detector model must be in 'validated' status",
    };
  }
  dt.status = "active";
  await dt.save();
  model.status = "active";
  await model.save();
  res.json(dt);
};
```

#### `attachDetector`

```ts
export const attachDetector = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { modelId } = req.body;
  const dt = await DocumentType.findOne(id);
  if (!dt) throw { statusCode: 404, message: "document type not found" };
  await attachDetectorInternal(dt, Number(modelId));
  res.json(dt);
};

async function attachDetectorInternal(dt: DocumentType, modelId: number) {
  const model = await Model.findOne(modelId);
  if (!model) throw { statusCode: 404, message: "model not found" };
  model.documentTypeId = dt.id;
  await model.save();
  dt.detectorModelId = model.id;
  await dt.save();
}
```

#### `listModelsForDocumentType`

```ts
export const listModelsForDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const models = await Model.find({ where: { documentTypeId: id } });
  res.json(models);
};
```

### Task 2.4 — Wire the new routes

Edit [api/src/routes/documentTypes.ts](../api/src/routes/documentTypes.ts):

```ts
router.get("/:id/models", asyncHandler(listModelsForDocumentType));
router.post("/:id/activate", asyncHandler(activateDocumentType));
router.post("/:id/detector-model", asyncHandler(attachDetector));
```

These all live under `/api/document-types/...` because of the mount in [api/src/routes/index.ts](../api/src/routes/index.ts) line 24.

### Task 2.5 — Update Swagger

Edit [api/src/swagger/](../api/src/swagger/) to document the new endpoints and the extended `DocumentType` shape (status, version, detectorModelId, promptTemplate, fieldConfig, detectorConfig).

## How to verify

```bash
TOKEN=...
BASE=http://localhost:3000/api

# Create draft
curl -X POST $BASE/document-types \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "key":"invoice",
    "name":"Invoice",
    "schema":{"fields":[{"key":"INVOICE_NO","type":"text"},{"key":"AMOUNT","type":"money"}],"arrays":[]},
    "detectorConfig":{"classMap":{"0":"INVOICE_NO","1":"AMOUNT"},"labelRoles":{"INVOICE_NO":"single","AMOUNT":"single"}},
    "promptTemplate":"Extract invoice number and amount as JSON."
  }'

# Try to activate without a detector — expect 400
curl -X POST $BASE/document-types/2/activate -H "Authorization: Bearer $TOKEN"

# Attach a model (assumes Stage 1 worked and you have a validated model)
curl -X POST $BASE/document-types/2/detector-model \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"modelId":1}'

# Activate
curl -X POST $BASE/document-types/2/activate -H "Authorization: Bearer $TOKEN"

# Confirm status === "active" and model.status === "active"
curl $BASE/document-types/2 -H "Authorization: Bearer $TOKEN"
curl $BASE/models -H "Authorization: Bearer $TOKEN"

# Edit promptTemplate — version should bump from 1 to 2
curl -X PUT $BASE/document-types/2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"promptTemplate":"new prompt"}'

# Reject classMap with unknown label
curl -X POST $BASE/document-types/2/detector-model -d '...' # then attach a model whose classMap has "GHOST"
# update the doc type with a bad classMap and try to activate — expect 400
```

## Done when

- [ ] `DocumentType` has all new columns; existing rows work unchanged (status defaults to "draft" — fine for now).
- [ ] `POST /api/document-types` accepts the full payload.
- [ ] `PUT /api/document-types/:id` bumps `version` on schema/detectorConfig/promptTemplate change only.
- [ ] `POST /api/document-types/:id/activate` enforces all preconditions.
- [ ] `POST /api/document-types/:id/detector-model` attaches a model and sets `documentTypeId` on it.
- [ ] `GET /api/document-types/:id/models` returns the bound models.
- [ ] Activating flips both `DocumentType.status` and `Model.status` to `"active"`.
- [ ] All existing endpoints still work; the seed script and any UI page that reads `GET /document-types` still get back valid data (with new fields possibly null/default).

## Common pitfalls

- **Old rows after migration.** Existing rows in your dev DB will have `status = "draft"` and `version = 1` by default; the existing seeded `receipt` will not be active anymore. Stage 8 fixes this through the seed script. For now, you can manually `UPDATE document_types SET status='active' WHERE key='receipt'` to keep working in dev.
- **Validating against the wrong schema.** `collectCanonicalLabels` reads `dt.schema`; if you mutate `dt.detectorConfig` and call `validateDetectorConfigAgainstSchema` before `dt.save()`, you're validating against the in-memory state — that's intentional but make sure not to swap the order.
- **Not bumping version when you should.** Forgetting to bump means runs done after a config change look like they used the old config. The `shouldBumpVersion` helper makes this explicit; do not skip it.
- **Frontend not yet aware of `status`.** Until Stage 7 lands, the frontend dropdown will still show all document types regardless of status — that's expected.

## Hand-off

- Stage 3 will read `dt.status === "active"`, `dt.detectorModelId`, `dt.promptTemplate`, `dt.detectorConfig`, `dt.schema`, `dt.version`.
- Stage 6 will call all new endpoints from the wizard UI.
- Stage 8 will rewrite the seed to produce an active receipt document type using these endpoints.
