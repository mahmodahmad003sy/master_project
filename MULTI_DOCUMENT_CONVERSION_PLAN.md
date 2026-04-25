# Convert Project to a Dynamic Multi-Document Comparison Platform

## Summary

**Goal:** convert the current receipt-centered project into a **dynamic multi-document system** where an admin can create a document type, define its schema, upload/select its detector model, and then run/keep compare results per document type across all three approaches.

**Keep in mind:**
- The compare flow must stay `react -> node api -> python compare service`.
- The Python service will run on the **same machine disk**, so uploaded detector weights can be read locally.
- The system must stop relying on one hard-coded receipt schema and one hard-coded YOLO label set.
- Runs must remain reproducible after future document/model changes.

## Key Changes

### 1. Make `DocumentType` the configuration root
Extend `DocumentType` from `{ key, name, schema }` into a full runtime config object:

- `key`, `name`, `schema`
- `status`: `draft | active | archived`
- `detectorModelId`: required active detector model for classical/hybrid
- `promptTemplate`: document-type-specific prompt/schema instructions for VLM
- `fieldConfig`: canonical field metadata used by metrics and rendering
- `detectorConfig`:
  - `classMap`: `{ classId -> canonicalLabel }`
  - `labelRoles`: declare which labels are single fields, array containers, and array child fields
  - `groupingRules`: rules for row/line-item reconstruction
- `version`: increment on schema/config changes

`DocumentType` becomes the single source of truth for:
- field schema
- detector label meaning
- active detector selection
- VLM extraction instructions

### 2. Turn `Model` into a real detector registry
Keep the existing `Model` table, but make it explicit for uploaded detector packages:

- `id`, `name`, `type`
- `family`: `yolo`
- `filePath`
- `classesCount`
- `classMap`
- `inputImageSize`
- `confidenceDefaults`
- `documentTypeId` nullable during upload, then required when attached
- `status`: `uploaded | validated | active | archived`
- `version`
- `notes`

Validation rule on upload:
- only `.pt` files accepted for detector models in this flow
- user must provide `classesCount` and `classMap`
- backend validates `classMap` size matches `classesCount`
- backend validates all canonical labels used by `classMap` exist in the selected `DocumentType.detectorConfig`
- backend stores model under `MODELS_BASE_PATH/<documentTypeKey>/<modelVersion>/`

Canonical label policy:
- detector labels must map to canonical names used by the document type, not raw ad hoc names from the `.pt`
- example: `0 -> DATE`, `1 -> TOTAL`, `2 -> LINE_ITEM`, `3 -> ITEM_NAME`
- Python must use the stored `classMap`, not hard-coded label names from the notebook

### 3. Preserve reproducibility in `ComparisonRun`
Extend `ComparisonRun` to snapshot the runtime config used for a run:

- `documentType`
- `documentTypeVersion`
- `detectorModelId`
- `detectorModelVersion`
- `promptVersion`
- existing timings/recommended/summary fields stay

Each run must be reproducible even if the document type or detector model changes later.

## Backend/API Changes

### 4. Document type CRUD becomes admin configuration CRUD
Replace simple document-type CRUD with full config management:

- `GET /document-types`
- `GET /document-types/:id`
- `POST /document-types`
- `PUT /document-types/:id`
- `POST /document-types/:id/activate`
- `POST /document-types/:id/detector-model`
- `GET /document-types/:id/models`

`POST /document-types` should support the creation flow:
- create document type metadata
- save schema
- save detector config
- optionally attach an uploaded detector model
- save prompt template

### 5. Models CRUD becomes detector-model management
Keep `/models`, but make it document-aware:

- `POST /models`
  - create detector metadata record
- `POST /models/:id/file`
  - upload `.pt`
- `PUT /models/:id`
  - update metadata/class map/conf thresholds
- `DELETE /models/:id`
  - allowed only if not active on a document type
- `POST /models/:id/validate`
  - confirm class map and file presence
- `POST /document-types/:id/detector-model`
  - assign model as the active detector for that document type

Fix current inconsistency:
- frontend currently posts to `/models/:id/files`
- backend route is `/models/:id/file`
- standardize on one route and update both sides

### 6. `POST /compare` becomes document-type-aware end to end
Keep the route shape, but change the runtime resolution:

Input:
- `file`
- `documentType`

Backend behavior:
- load `DocumentType`
- load its active detector model
- load schema + detector config + prompt template
- pass these to Python compare service
- save run with document/model version snapshot

Backend-to-Python request must include:
- `documentTypeKey`
- `schema`
- `promptTemplate`
- `detectorModelPath`
- `classMap`
- `labelRoles`
- `groupingRules`

The Python service must stop assuming receipt-only defaults.

### 7. Metrics must be schema-driven only
Keep metrics generic and schema-based:

- top-level fields scored from `DocumentType.schema`
- array matching rules read from schema/grouping config
- no hard-coded `DATE/FB/FD/SUM/ORDER` assumptions
- only generic field types remain hard-coded: `text`, `number`, `money`, `date`

## Frontend Changes

### 8. Add a real Document Type management UI
Add a page such as `/document-types` for admin configuration.

Creation/edit form must include:
- document type key/name
- schema editor
- detector label mapping editor
- detector roles/grouping config
- VLM prompt template
- detector model upload/select

Recommended UX:
- step 1: basic info
- step 2: schema
- step 3: detector labels/class map
- step 4: upload/select detector
- step 5: activate

### 9. Update Models page to work as a detector registry
`ModelsPage` should become a detector-model manager, not a loose list.

Show:
- model name
- bound document type
- version
- file uploaded status
- classes count
- active/inactive
- validation state

### 10. Keep Compare page mostly intact, but drive it by document type config
`ComparePage` keeps the same compare UX, but:

- document type dropdown must list active document types
- field rendering must come only from the selected document schema
- no receipt-only fallback assumptions in field rendering
- run detail and runs history must show document type and detector model used

## Python `colab_app2.ipynb` Changes

### 11. Replace hard-coded receipt pipeline config with runtime config
The notebook currently hard-codes receipt logic such as:
- fixed receipt labels
- fixed `WEIGHTS_PATH`
- fixed `TOP_FIELDS`
- fixed prompt/output normalization

Change it so `/compare` accepts runtime config from Node and builds the pipeline dynamically.

Required changes:
- remove hard-coded `WEIGHTS_PATH = "/content/yolov11_text_detector_fixed2vlast.pt"`
- remove hard-coded `TOP_FIELDS`, `FIELD_TYPE`, receipt-only label names
- remove receipt-specific Qwen normalization logic as the only path
- load detector weights from `detectorModelPath`
- use request-provided `classMap`
- use request-provided `labelRoles` and `groupingRules`
- use request-provided `schema`
- use request-provided `promptTemplate`

### 12. Standardize Python output contract
Keep the current response envelope because Node already supports it:

- `main`
- `qwen`
- `hybrid`
- `run_meta.timings_ms`
- `recommended_for_production`

But inside each approach result:
- output fields must follow the exact `DocumentType.schema`
- missing fields must be null/empty according to one shared rule
- array outputs must use schema keys, not receipt-specific names unless defined by that document type

### 13. Make recommendation logic explicit
`recommended_for_production` should no longer be hard-coded to `"hybrid"`.

Requirement:
- if no GT is present during compare, recommendation is based on configured priority policy:
  - default policy: `hybrid` if successful, else `vlm`, else `classical`
- if GT exists in benchmark/evaluation contexts, recommendation may be accuracy-based, but compare-run response can stay policy-based
- document this as a config-driven heuristic, not a measured truth

## Test Plan

- Create a second document type with a schema different from receipt and attach a different detector model.
- Upload a `.pt` file with a valid class map and verify backend rejects mismatched class count or unknown canonical labels.
- Run compare for two document types and verify each run stores its own document type version and detector model version.
- Verify compare page renders fields strictly from the selected document schema.
- Verify metrics run without any receipt-specific field assumptions.
- Verify Python service can switch detector weights and class mapping between requests without code edits.
- Verify old receipt flow still works after migration.
- Verify model deletion is blocked when a model is active on a document type.
- Verify benchmark and analytics aggregate correctly across multiple document types and can be filtered by document type.

## Assumptions and Defaults

- One **active detector model per document type** at runtime.
- All three approaches become document-type-aware.
- Python compare service runs on the **same machine** and can read uploaded model files from shared disk paths.
- Multi-document support in this phase is for dynamic document configuration, not for arbitrary zero-config documents.
- `DocumentType` is the canonical owner of schema, prompt, detector label semantics, and active detector selection.
- Existing receipt support is migrated into the new model as the first seeded `DocumentType`.
