# Stage 7 — Frontend: Models, Compare, Runs cleanup

**Estimated effort:** 1 day. **Dependencies:** Stages 1, 3, 6. **Unblocks:** Stage 8.

## Goal

Three small but important frontend updates that bring the existing pages in line with the new backend:

1. **`ModelsPage`** becomes a real detector-registry view: shows `status`, `version`, `documentType`, `sha256`, `classesCount`. Fixes the `/file` vs `/files` route mismatch. Disables Delete on active models.
2. **`ComparePage`** filters the dropdown to active document types and removes receipt-specific fallback logic in `ApproachColumn`.
3. **`RunsPage` and `RunDetailPage`** show the snapshot fields (`documentTypeVersion`, `detectorModelId`, `detectorModelVersion`).

## Project background you must know first

- `ModelsPage` is at [react/src/pages/ModelsPage.jsx](../react/src/pages/ModelsPage.jsx). It uses `client.post("/models/:id/files")` (plural) which currently 404s against the backend (singular `/file`).
- The duplicated/orphan client [react/src/api/modelFiles.js](../react/src/api/modelFiles.js) is unused — delete it.
- `ComparePage` is at [react/src/pages/ComparePage.jsx](../react/src/pages/ComparePage.jsx). It already drives field rendering from `documentTypes.items` via `getSchemaFor` (lines 33–36), so the heavy lifting is done. We just need to filter the dropdown and remove one fallback.
- `ApproachColumn` is at [react/src/components/compare/ApproachColumn.jsx](../react/src/components/compare/ApproachColumn.jsx). Lines 31–41 contain `getConfidence`, which falls back to `data.meta.confidence.receipt_confidence`. Stage 4 makes Python emit a generic `confidence` for every document type, so we can drop the fallback.
- `RunsPage` is at [react/src/pages/RunsPage.jsx](../react/src/pages/RunsPage.jsx). `RunDetailPage` is at [react/src/pages/RunDetailPage.jsx](../react/src/pages/RunDetailPage.jsx).
- After Stage 3, `GET /runs` and `GET /runs/:id` return the new fields `documentTypeVersion`, `detectorModelId`, `detectorModelVersion`, `promptVersion`.

## Files to read first (~20 minutes)

1. [react/src/pages/ModelsPage.jsx](../react/src/pages/ModelsPage.jsx) (whole file).
2. [react/src/api/models.js](../react/src/api/models.js) (whole file).
3. [react/src/api/modelFiles.js](../react/src/api/modelFiles.js) (note: orphan, will delete).
4. [react/src/pages/ComparePage.jsx](../react/src/pages/ComparePage.jsx) lines 30–220.
5. [react/src/components/compare/ApproachColumn.jsx](../react/src/components/compare/ApproachColumn.jsx) lines 1–50.
6. [react/src/pages/RunsPage.jsx](../react/src/pages/RunsPage.jsx) lines 90–280 (table columns).
7. [react/src/pages/RunDetailPage.jsx](../react/src/pages/RunDetailPage.jsx) lines 90–250.
8. [react/src/features/models/modelsSlice.js](../react/src/features/models/modelsSlice.js).

## Tasks

### Task 7.1 — Fix the `/file` vs `/files` route

Edit [react/src/api/models.js](../react/src/api/models.js):

```js
export const uploadModelFileApi = (id, file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`/models/${id}/file`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
```

(Was `/models/${id}/files`; change to `/file`.)

Also add the new endpoints from Stage 1:

```js
export const validateModelApi = (id) => client.post(`/models/${id}/validate`);
```

Delete [react/src/api/modelFiles.js](../react/src/api/modelFiles.js) — it's unused (no imports anywhere) and duplicates `models.js`.

### Task 7.2 — Update `modelsSlice` to expose new fields and validate thunk

Edit [react/src/features/models/modelsSlice.js](../react/src/features/models/modelsSlice.js):

```js
export const validateModel = createAsyncThunk(
  "models/validate",
  async (id, { rejectWithValue }) => {
    try { return (await api.validateModelApi(id)).data; }
    catch (e) { return rejectWithValue(e.response?.data?.message || "validate failed"); }
  },
);
```

In `extraReducers`, on `validateModel.fulfilled`, replace the matching item in `state.items`.

### Task 7.3 — `ModelsPage` becomes a registry view

Edit [react/src/pages/ModelsPage.jsx](../react/src/pages/ModelsPage.jsx). Switch from the Card grid to an Ant `Table` (denser, easier to read once we have many fields). Columns:

- `id` (monospace small)
- `name`
- `family` (Tag)
- `status` (colored Tag: `uploaded` default, `validated` blue, `active` green, `archived` orange)
- `version`
- `documentTypeId` -> render as link `/document-types/:id` (lookup name from Redux `documentTypes.items`)
- `classesCount`
- `fileSize` (human-readable: `prettyBytes(m.fileSize)`)
- `sha256` (first 8 chars in a `<Tooltip>` that shows the full hash)
- Actions: `Upload .pt`, `Edit`, `Validate` (visible only when `status === "uploaded"`), `Delete` (disabled and tooltip "Cannot delete an active model" when `status === "active"`)

Keep the existing modals for create/edit/upload but make the file-input accept attribute restrict to `.pt` for the model upload (`accept: ".pt"`).

After upload, optimistically dispatch `loadModels()` to refresh the row's `sha256`/`fileSize`.

### Task 7.4 — `ComparePage` dropdown filter

Edit [react/src/pages/ComparePage.jsx](../react/src/pages/ComparePage.jsx). Find the document-type `<Select>` (around lines 207–216). Filter the options:

```jsx
const activeDocumentTypes = useMemo(
  () => documentTypes.items.filter((d) => d.status === "active"),
  [documentTypes.items],
);
```

Use `activeDocumentTypes` for `options`. If the currently selected `documentType` is not active anymore, reset it to the first active one (or null) in a `useEffect`.

If `activeDocumentTypes.length === 0`, render a small `<Empty>` with a CTA "No active document types — go to Document Types to set one up" linking to `/document-types`.

### Task 7.5 — Remove receipt-specific confidence fallback

Edit [react/src/components/compare/ApproachColumn.jsx](../react/src/components/compare/ApproachColumn.jsx) lines 31–41. Replace `getConfidence` with:

```jsx
function getConfidence(data) {
  if (!data || typeof data !== "object") return null;
  return typeof data.confidence === "number" ? data.confidence : null;
}
```

(Drops the `data.meta.confidence.receipt_confidence` branch.)

### Task 7.6 — `RunsPage` snapshot columns

Edit [react/src/pages/RunsPage.jsx](../react/src/pages/RunsPage.jsx). Add three columns to the table (after the existing `documentType` column):

- `documentTypeVersion` -> small Tag like `v1`
- `detectorModelId` -> link to `/models` (or `/document-types/:id` for the bound type) showing `#42`
- `detectorModelVersion` -> small Tag like `v3`

Keep them collapsible / hidden behind a "Show advanced columns" toggle if the table is already too wide. Use Ant Table's `defaultHidden` columns pattern.

### Task 7.7 — `RunDetailPage` snapshot fields in header

Edit [react/src/pages/RunDetailPage.jsx](../react/src/pages/RunDetailPage.jsx). In the run-info card (around lines 175–200), add:

```jsx
<Descriptions column={2} size="small">
  <Descriptions.Item label="Document Type">
    {detail.run.documentType} (v{detail.run.documentTypeVersion})
  </Descriptions.Item>
  <Descriptions.Item label="Detector Model">
    #{detail.run.detectorModelId} (v{detail.run.detectorModelVersion})
  </Descriptions.Item>
</Descriptions>
```

Handle `null` values gracefully (legacy runs predating Stage 3 won't have these fields — show "—").

### Task 7.8 — Public/Presentation page parity

Edit [react/src/pages/PresentationPage.jsx](../react/src/pages/PresentationPage.jsx) similarly so shared/public links surface the snapshot info too. Optional but recommended.

## How to verify

1. **Upload `.pt` works.** Open `/models`. Create a model. Upload a `.pt`. No 404 in network tab. Row gets `sha256` and `fileSize` populated.
2. **Validate flow.** Click `Validate` on an `uploaded` model — status becomes `validated`. Then attach it to a document type via the wizard (Stage 6). Activate the document type — model status becomes `active` and Delete is disabled.
3. **Delete protection.** Try to delete an `active` model — Delete button is disabled. Try via curl — expect 409.
4. **Compare dropdown.** With one active and one draft document type, only the active one appears in `/compare`. Empty state shows the CTA when no actives exist.
5. **Run snapshot columns.** Run a compare. Open `/runs`, verify the new columns are populated. Open the run detail, verify the header shows the versions.
6. **Old runs show "—".** Pick a run that was created before Stage 3 — verify the new snapshot fields don't crash and show "—".

## Done when

- [ ] No more 404s on model file upload (network tab clean).
- [ ] [react/src/api/modelFiles.js](../react/src/api/modelFiles.js) is deleted.
- [ ] `ModelsPage` shows the registry fields and protects active models from delete.
- [ ] `ComparePage` lists only active document types and shows an empty state otherwise.
- [ ] `ApproachColumn.getConfidence` no longer references `receipt_confidence`.
- [ ] Runs list and detail surface `documentTypeVersion`, `detectorModelId`, `detectorModelVersion`.
- [ ] Lint passes; no console errors during normal navigation.

## Common pitfalls

- **Card layout to Table refactor breaks existing modals.** Keep the modal components; just change how the trigger surfaces them.
- **Ant `Tag` colors.** The library has named colors (`green`, `orange`, `blue`, `red`) and CSS color strings. Stick to named ones for consistency.
- **`prettyBytes`.** If you're not pulling in a dep, write a 5-line helper: divide by 1024 until under 1024, append the unit.
- **Hash truncation tooltip.** Use Ant `<Tooltip title={fullHash}><span>{hash.slice(0,8)}…</span></Tooltip>`. Don't break copy-paste of the full hash by truncating without a tooltip.
- **ComparePage dropdown loop.** If the active filter changes the selected type, your `useEffect` can fire repeatedly. Guard with `if (current && activeDocumentTypes.find(d => d.key === current)) return;`.
- **Old run safety.** Some legacy runs have null `documentTypeVersion`. Don't render `null (v${null})` — guard with `?? "—"`.

## Hand-off

- Stage 8's manual test plan exercises every page touched here.
