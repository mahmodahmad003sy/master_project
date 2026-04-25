# Stage 3 — Compare flow refactor (backend)

**Estimated effort:** 1 day. **Dependencies:** Stages 1, 2. **Unblocks:** Stages 4, 7.

## Goal

Make the Node `POST /api/compare` flow **document-type-aware end to end**:

1. Resolve the active `DocumentType` and its active detector `Model` server-side.
2. Send a much richer payload to the Python compare service (schema, prompt, model download URL, classMap, label roles, grouping rules).
3. Snapshot reproducibility fields (`documentTypeVersion`, `detectorModelId`, `detectorModelVersion`, `promptVersion`) onto each new `ComparisonRun`.

The Python service will be updated in Stage 4 to consume this new payload. Until then, Python will fail on the new fields — that is fine because Stage 3 + Stage 4 will land together as the "backend ↔ Python contract change."

## Project background you must know first

- The compare HTTP route is `POST /api/compare`, defined in [api/src/routes/runs.ts](../api/src/routes/runs.ts) line 21. Behind `requireAuth`.
- The route handler is `postCompare` in [api/src/controllers/runsController.ts](../api/src/controllers/runsController.ts) lines 127–146. It calls `runCompare` (also in `runsController.ts`).
- The actual Python call lives in [api/src/controllers/compareController.ts](../api/src/controllers/compareController.ts), function `postCompareRequest` (lines 83–120). Today, the form only contains `file`. We change it.
- The request URL is `${COMPARE_SERVICE_URL}/compare` (line 18 of `compareController.ts`). For Colab, you must set `COMPARE_SERVICE_URL` in [api/config/default.json](../api/config/default.json) to your Colab tunnel (e.g. `https://abc.ngrok-free.app`).
- After Stage 1, `Model` has `id, version, sha256, fileSize, filePath, classMap, status, documentTypeId`. After Stage 2, `DocumentType` has `id, key, version, status, schema, promptTemplate, detectorModelId, detectorConfig, fieldConfig`.
- Stage 0 added `config.PUBLIC_API_URL` and `config.COLAB_SYNC_TOKEN`.
- The `ComparisonRun` entity is at [api/src/entities/ComparisonRun.ts](../api/src/entities/ComparisonRun.ts).

## Files to read first (~25 minutes)

1. [api/src/controllers/runsController.ts](../api/src/controllers/runsController.ts) lines 1–250 (focus on `runCompare`, `postCompare`).
2. [api/src/controllers/compareController.ts](../api/src/controllers/compareController.ts) (whole file — it's small).
3. [api/src/entities/ComparisonRun.ts](../api/src/entities/ComparisonRun.ts) (whole file).
4. [api/src/services/runStorage.ts](../api/src/services/runStorage.ts) (for understanding artifact paths).

## Tasks

### Task 3.1 — Extend `ComparisonRun`

In [api/src/entities/ComparisonRun.ts](../api/src/entities/ComparisonRun.ts), add:

```ts
  @Column({ name: "document_type_version", type: "int", nullable: true })
  documentTypeVersion?: number;

  @Column({ name: "detector_model_id", type: "int", nullable: true })
  detectorModelId?: number;

  @Column({ name: "detector_model_version", type: "int", nullable: true })
  detectorModelVersion?: number;

  @Column({ name: "prompt_version", type: "int", nullable: true })
  promptVersion?: number;
```

`documentType` (the string column) stays as it is.

### Task 3.2 — Resolve config in `runCompare`

Today `runCompare` does roughly:

```ts
const docType = await DocumentType.findOne({ where: { key: documentTypeKey } });
// ... call postCompareRequest(file)
```

Change it to:

```ts
const docType = await DocumentType.findOne({ where: { key: documentTypeKey } });
if (!docType) throw { statusCode: 404, message: "document type not found" };
if (docType.status !== "active") {
  throw { statusCode: 400, message: `document type "${documentTypeKey}" is not active` };
}
if (!docType.detectorModelId) {
  throw { statusCode: 400, message: "document type has no detector model" };
}
const model = await Model.findOne(docType.detectorModelId);
if (!model || model.status !== "active") {
  throw { statusCode: 400, message: "active detector model not available" };
}
if (!model.sha256 || !model.filePath) {
  throw { statusCode: 400, message: "detector model file is missing" };
}
```

Pass both `docType` and `model` to `postCompareRequest`.

### Task 3.3 — Rewrite `postCompareRequest`

In [api/src/controllers/compareController.ts](../api/src/controllers/compareController.ts), change the function signature to accept `docType` and `model` and build the form like this:

```ts
const form = new FormData();
form.append("file", buffer, {
  filename: file.originalname,
  contentType: file.mimetype,
});
form.append("documentTypeKey", docType.key);
form.append("documentTypeVersion", String(docType.version));
form.append("schema", JSON.stringify(docType.schema));
form.append("promptTemplate", docType.promptTemplate ?? "");
form.append("promptVersion", String(docType.version));
form.append("modelId", String(model.id));
form.append("modelVersion", String(model.version));
form.append("modelSha256", model.sha256!);
form.append(
  "modelDownloadUrl",
  `${config.PUBLIC_API_URL}/models/${model.id}/download`,
);
form.append("syncToken", config.COLAB_SYNC_TOKEN);
form.append("classMap", JSON.stringify(model.classMap ?? {}));
form.append(
  "labelRoles",
  JSON.stringify(docType.detectorConfig?.labelRoles ?? {}),
);
form.append(
  "groupingRules",
  JSON.stringify(docType.detectorConfig?.groupingRules ?? {}),
);
form.append("fieldConfig", JSON.stringify(docType.fieldConfig ?? {}));
```

Keep the `save_to_disk: false` query parameter and the `X-API-Key` header logic.

### Task 3.4 — Snapshot versions on the run

After Python responds successfully, in `runCompare`:

```ts
run.documentTypeVersion = docType.version;
run.detectorModelId = model.id;
run.detectorModelVersion = model.version;
run.promptVersion = docType.version;
await run.save();
```

(`docType.version` is reused for `promptVersion` because `promptTemplate` is owned by the document type and they bump together. If we ever decouple prompts, we can change this.)

### Task 3.5 — Improve error mapping from Python

When Python returns a non-2xx, today the error bubbles up generically. Add a small mapper so that:

- 400 from Python (e.g. checksum mismatch) -> 502 with body `{ message: "compare service rejected request: <reason>" }`
- 5xx from Python -> 502 with body `{ message: "compare service failed: <status>" }`
- network errors -> 503 with body `{ message: "compare service unreachable" }`

This makes the React error states clearer.

## How to verify

Stage 3 alone cannot be end-to-end-tested because Python doesn't accept the new payload yet. Verify the Node side using a fake compare service:

```bash
# 1. Start a tiny mock that prints the form fields it received:
node -e "require('express')().use(require('multer')().single('file'),(req,res)=>{console.log(req.body);res.json({ok:true,mode:'compare',run_meta:{filename:'x',timings_ms:{}},main:{fields:{}},qwen:{fields:{}},hybrid:{fields:{}},recommended_for_production:'hybrid'})}).listen(9999)"

# 2. Point COMPARE_SERVICE_URL at it: edit api/config/default.json -> "COMPARE_SERVICE_URL": "http://localhost:9999"
# 3. Restart the Node API
# 4. Run a compare from the React UI (or curl), confirm the mock prints all the new form fields:
#    documentTypeKey, documentTypeVersion, schema, promptTemplate, modelId, modelVersion,
#    modelSha256, modelDownloadUrl, syncToken, classMap, labelRoles, groupingRules
```

After the run completes, check the new `ComparisonRun` row:

```sql
SELECT id, document_type, document_type_version, detector_model_id,
       detector_model_version, prompt_version
FROM comparison_runs ORDER BY id DESC LIMIT 1;
```

All four new columns should be populated.

## Done when

- [ ] `ComparisonRun` has the four new snapshot columns.
- [ ] `runCompare` rejects inactive document types and missing detector models with clear 400 messages.
- [ ] The form sent to Python contains every field listed in Task 3.3.
- [ ] Successful runs persist the snapshot fields.
- [ ] Failed runs from the compare service return clean error messages mapped to 502/503.
- [ ] All existing run-storage artifact writing (raw_response, classical, vlm, hybrid) still works.
- [ ] `GET /api/runs/:id` returns the new fields in the response.

## Common pitfalls

- **`PUBLIC_API_URL` set to localhost.** Colab cannot reach `localhost:3000`. For end-to-end testing with Colab you need ngrok or cloudflared. For Stage-3-only verification with a local mock, `localhost` is fine because Python is also "local" (the mock).
- **`syncToken` leakage.** It's a shared secret in the request body. That is acceptable because the request is between Node and the Colab service; both endpoints are trusted. Do not log the full request body in production.
- **Saving the snapshot too early.** If you set `run.detectorModelId = model.id` before the Python call and the call fails, the run might be left half-saved depending on transaction handling. Save snapshots **after** a successful Python response, before returning the response to the React client.
- **Treating `model.fileSize` as a JS `number`.** TypeORM with `bigint` returns a string for safety. If you don't use it for arithmetic in this stage, ignore — Stage 1's Colab DTO already wraps it in `Number(...)`.
- **Not setting `Content-Type` on `axios.post`.** When using `form-data`, you must spread the headers: `axios.post(url, form, { headers: form.getHeaders() })`.

## Hand-off

- Stage 4 (Python) consumes the new form fields. The names must match exactly: `documentTypeKey`, `documentTypeVersion`, `schema`, `promptTemplate`, `promptVersion`, `modelId`, `modelVersion`, `modelSha256`, `modelDownloadUrl`, `syncToken`, `classMap`, `labelRoles`, `groupingRules`, `fieldConfig`.
- Stage 7 will surface the new `ComparisonRun` snapshot fields in the React Runs pages.
