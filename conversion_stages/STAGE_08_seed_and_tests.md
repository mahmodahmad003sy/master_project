# Stage 8 — Seed receipts + end-to-end tests

**Estimated effort:** 1 day. **Dependencies:** Stages 1–7. **Unblocks:** ship.

## Goal

1. Migrate the existing **receipt** flow into the new model so that on a fresh DB, running the seed script produces a fully active receipt document type with a bound detector model — exactly the same way the UI would produce one.
2. Run a full **regression and acceptance test suite** that proves every requirement in [MULTI_DOCUMENT_CONVERSION_PLAN.md](../MULTI_DOCUMENT_CONVERSION_PLAN.md) ("Test Plan" section) is satisfied.

## Project background you must know first

- The current seed script is [api/src/scripts/seedDocumentTypes.ts](../api/src/scripts/seedDocumentTypes.ts). It uses `AppDataSource.getRepository` / `destroy`, but [api/src/data-source.ts](../api/src/data-source.ts) currently exports only `initialize`. The script is broken in its current form — fix the data-source API as part of this stage (or use `BaseEntity.find/save` like other code does).
- The receipt schema is the existing `RECEIPT_SCHEMA` in the seed file (DATE/FB/FD/SUM/ORDER).
- The current YOLO `.pt` for receipts is `/content/yolov11_text_detector_fixed2vlast.pt` in Colab — **for the seed**, you need a copy of this file accessible to the Node host so it can be uploaded via `POST /api/models/:id/file` and then become available for Colab to pull. Put it under `<repo>/scripts/seed_assets/yolov11_receipt.pt` (gitignored) and document its expected location.
- Only existing tests are [api/src/__tests__/metrics.test.ts](../api/src/__tests__/metrics.test.ts) (Jest). Use the same setup for any new unit tests.

## Files to read first (~15 minutes)

1. [api/src/scripts/seedDocumentTypes.ts](../api/src/scripts/seedDocumentTypes.ts) (whole file).
2. [api/src/data-source.ts](../api/src/data-source.ts) (whole file).
3. [api/src/__tests__/metrics.test.ts](../api/src/__tests__/metrics.test.ts) (style reference).
4. [api/jest.config.js](../api/jest.config.js).

## Tasks

### Task 8.1 — Fix `data-source.ts`

Make sure `AppDataSource` exposes `getRepository` (in TypeORM 0.2.x via `getRepository` from `typeorm`) and an `initialize`/`destroy`. Minimal patch:

```ts
import { createConnection, Connection, getRepository } from "typeorm";
import { Model } from "./entities/Model";
import { User } from "./entities/User";
import { DocumentType } from "./entities/DocumentType";
import { ComparisonRun } from "./entities/ComparisonRun";
import { Benchmark } from "./entities/Benchmark";
import config from "../config/default.json";

let _connection: Connection | null = null;

export const AppDataSource = {
  initialize: async () => {
    if (!_connection) {
      _connection = await createConnection({
        type: "postgres" as const,
        ...config.db,
        entities: [Model, User, DocumentType, ComparisonRun, Benchmark],
      });
    }
    return _connection;
  },
  destroy: async () => {
    if (_connection) {
      await _connection.close();
      _connection = null;
    }
  },
  getRepository,
};
```

### Task 8.2 — Rewrite the receipt seed

Edit [api/src/scripts/seedDocumentTypes.ts](../api/src/scripts/seedDocumentTypes.ts):

```ts
import { AppDataSource } from "../data-source";
import { DocumentType } from "../entities/DocumentType";
import { Model } from "../entities/Model";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import config from "../../config/default.json";

const RECEIPT_SCHEMA = { /* existing receipt schema */ };

const RECEIPT_PROMPT = `You are given a receipt image.\n\nExtract data and return ONE valid JSON object matching this schema:\n{{SCHEMA}}\n\nReturn JSON only — no markdown, no comments.`;

const RECEIPT_DETECTOR_CONFIG = {
  classMap: {
    "0": "DATE", "1": "FB", "2": "FD", "3": "SUM",
    "4": "ORDER", "5": "NAME", "6": "PRICE", "7": "QUANTITY",
  },
  labelRoles: {
    DATE: "single", FB: "single", FD: "single", SUM: "single",
    ORDER: "arrayContainer",
    NAME: "arrayChild", PRICE: "arrayChild", QUANTITY: "arrayChild",
  },
  groupingRules: { container: "ORDER", row: { matchBy: "NAME" } },
};

async function copyReceiptModel(): Promise<{ filePath: string; sha256: string; size: number }> {
  const src = path.resolve(__dirname, "../../../scripts/seed_assets/yolov11_receipt.pt");
  const stat = await fsp.stat(src).catch(() => null);
  if (!stat) {
    throw new Error(`seed asset missing: ${src}\nDownload yolov11_text_detector_fixed2vlast.pt from Colab and put it there.`);
  }
  const dest = path.join(config.MODELS_BASE_PATH, "receipt", "v1", "yolov11_receipt.pt");
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
  const buf = await fsp.readFile(dest);
  return { filePath: dest, sha256: crypto.createHash("sha256").update(buf).digest("hex"), size: stat.size };
}

(async () => {
  await AppDataSource.initialize();
  try {
    const dt = (await DocumentType.findOne({ where: { key: "receipt" } })) ?? new DocumentType();
    Object.assign(dt, {
      key: "receipt",
      name: "Receipt",
      schema: RECEIPT_SCHEMA,
      promptTemplate: RECEIPT_PROMPT,
      detectorConfig: RECEIPT_DETECTOR_CONFIG,
      version: 1,
      status: "draft",
    });
    await dt.save();

    const { filePath, sha256, size } = await copyReceiptModel();
    const m = (await Model.findOne({ where: { name: "receipt-yolov11-v1" } })) ?? new Model();
    Object.assign(m, {
      name: "receipt-yolov11-v1",
      type: "yolo",
      family: "yolo",
      filePath,
      classesCount: Object.keys(RECEIPT_DETECTOR_CONFIG.classMap).length,
      classMap: RECEIPT_DETECTOR_CONFIG.classMap,
      sha256,
      fileSize: size,
      version: 1,
      documentTypeId: dt.id,
      status: "validated",
    });
    await m.save();

    dt.detectorModelId = m.id;
    dt.status = "active";
    m.status = "active";
    await dt.save();
    await m.save();

    console.log("Seed complete:", { documentTypeId: dt.id, modelId: m.id });
  } finally {
    await AppDataSource.destroy();
  }
})();
```

Add a script entry in [api/package.json](../api/package.json):

```json
"scripts": {
  "...": "...",
  "seed": "ts-node src/scripts/seedDocumentTypes.ts"
}
```

### Task 8.3 — Add unit tests for the new validators

Create [api/src/__tests__/documentTypeValidation.test.ts](../api/src/__tests__/documentTypeValidation.test.ts) with cases for:

- `collectCanonicalLabels` returns expected set for receipt schema and a non-receipt schema.
- `validateDetectorConfigAgainstSchema` accepts valid config and rejects unknown labels.
- `shouldBumpVersion` returns true on schema/detectorConfig/promptTemplate change, false otherwise.

### Task 8.4 — Extend metrics tests with a non-receipt fixture

Add a second fixture to [api/src/__tests__/metrics.test.ts](../api/src/__tests__/metrics.test.ts) using an `invoice` schema with `INVOICE_NO/AMOUNT` and an `ITEMS` array. Confirm `scoreRun` works for it without modification — proves metrics are schema-driven.

### Task 8.5 — End-to-end manual test plan

Execute these in order on a fresh database:

| # | Step | Expected |
|---|------|----------|
| 1 | `yarn seed` | Seed completes; `receipt` doc type is `active`; `receipt-yolov11-v1` model is `active`. |
| 2 | Start Node API + Colab tunnel | API up; Colab `sync_models_from_api()` prints `("downloaded", ...)` for the receipt model. |
| 3 | Run a receipt compare from `/compare` | Three columns populated; recommendation set; row in `/runs` with `documentTypeVersion=1`, `detectorModelVersion=1`. |
| 4 | Create a second document type "invoice" via UI wizard | `/document-types` list shows `invoice` as `active` after step 5. |
| 5 | Upload an invoice `.pt`; sha256/fileSize visible in `/models` | Both populated. |
| 6 | Re-run `sync_models_from_api()` in Colab | Both models cached, no downloads. |
| 7 | Compare an invoice image from `/compare` | Output uses invoice schema keys, not receipt keys. Snapshot fields stored on the run. |
| 8 | Edit the invoice prompt template, save | `version` bumps from 1 to 2 in `/document-types`. |
| 9 | Run another invoice compare | New run has `documentTypeVersion=2`. The previous invoice run still has `documentTypeVersion=1` (reproducibility proven). |
| 10 | Try to delete the active receipt model from `/models` | Delete disabled / 409 error. |
| 11 | Tamper with `/content/models/m1/v1/weights.pt` in Colab (truncate one byte) | Next compare re-downloads after sha256 check. |
| 12 | Upload a third model in Node mid-session, attach to a new doc type, activate | Without re-running sync, the next compare for that type lazy-downloads the model and succeeds. |
| 13 | Send `curl -i $NODE/api/models/active -H "X-Sync-Token: wrong"` | 401. |
| 14 | Open an old (pre-Stage-3) run | Snapshot fields render as "—" without crash. |
| 15 | Filter `/runs` by `documentType=invoice` | Only invoice runs shown. |
| 16 | View `/analytics/summary` | Aggregates by document type, both types appear. |

### Task 8.6 — Regression: receipt feature parity

Compare a receipt now (post-migration) against a known-good run from before the migration:

- Field values for `DATE/FB/FD/SUM/ORDER` should match within tolerance.
- Hybrid recommendation should match.
- Per-field metrics (when ground truth is set) should match.

If anything regresses, file a follow-up bug — do not block the release on small score deltas, but document them.

### Task 8.7 — Documentation pass

Update [api/README.md](../api/README.md) and [react/README.md](../react/README.md):

- Quickstart for adding a new document type (link to Stage 6 wizard).
- Networking notes for Colab (link to Stage 5).
- `yarn seed` instructions.

Update root [README.md](../README.md) with a one-paragraph summary of the conversion and a link to [MULTI_DOCUMENT_CONVERSION_PLAN.md](../MULTI_DOCUMENT_CONVERSION_PLAN.md).

## How to verify

The 16-row table in Task 8.5 is the verification. Treat it as a checklist; each row must pass before the project is considered done.

## Done when

- [ ] `yarn seed` produces an active receipt document type and an active model on a fresh DB.
- [ ] Unit tests pass: `yarn test` in `api/` is green.
- [ ] All 16 manual test rows pass.
- [ ] Pre-existing receipt feature parity is preserved (Task 8.6).
- [ ] All READMEs updated.

## Common pitfalls

- **Seed asset missing.** The receipt `.pt` is not in the repo. Document the expected path and include a clear error message in the seed script (already done in the snippet above).
- **`ts-node` not installed.** Add `ts-node` and `typescript` as devDependencies in [api/package.json](../api/package.json) if absent.
- **Network in tests.** Don't put real HTTP calls in unit tests. Mock `axios` or split end-to-end tests into a separate folder that the CI doesn't run by default.
- **Test pollution.** If your tests touch the DB, use a separate test database (`db.database = "compare_test"` in a test config).
- **Forgetting the on-demand fallback in row 12.** If row 12 fails, the bug is in `get_yolo_model` not honoring `syncToken` from the request. Re-check Stage 4 Task 4.2.
- **Old runs from before Stage 3** have null `documentTypeVersion`. Make sure UI guards (Stage 7 Task 7.7) handle this.

## Hand-off

After this stage merges, the project is ready to ship. The final acceptance bar is the 16-row table in Task 8.5.
