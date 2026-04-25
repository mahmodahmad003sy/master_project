# Stage 6 — Frontend: Document Type admin UI

**Estimated effort:** 2 days. **Dependencies:** Stage 2. **Unblocks:** Stage 7 (in part), Stage 8.

## Goal

Give admins a real UI to **create, edit, configure, and activate document types**. Today the React app only reads `GET /document-types`; it has no admin surface. After this stage, an admin can:

1. See a list of document types with their status.
2. Open a 5-step wizard to create or edit a type: basic info -> schema -> detector class map / labelRoles / groupingRules -> upload or pick detector model -> activate.
3. Activate or archive a document type.

## Project background you must know first

- React 18, react-router-dom v7, Redux Toolkit, Ant Design 5. See [react/package.json](../react/package.json).
- Routes are declarative `<Routes>`/`<Route>` in [react/src/App.js](../react/src/App.js), wrapped in `<BrowserRouter>` in [react/src/index.js](../react/src/index.js). Protected routes go inside the `<RequireAuth>` block (see [react/src/components/RequireAuth.jsx](../react/src/components/RequireAuth.jsx)).
- The shared axios client lives at [react/src/api/client.js](../react/src/api/client.js). It auto-prepends `Authorization: Bearer <token>` and normalizes the base URL to end with `/api`.
- Existing slices live under [react/src/features/](../react/src/features/). The current document-types slice is read-only at [react/src/features/documentTypes/documentTypesSlice.js](../react/src/features/documentTypes/documentTypesSlice.js).
- Existing pages live under [react/src/pages/](../react/src/pages/). Use them as style references, especially [react/src/pages/ModelsPage.jsx](../react/src/pages/ModelsPage.jsx) for cards/modals and [react/src/pages/BenchmarksPage.jsx](../react/src/pages/BenchmarksPage.jsx) for forms.
- Stage 2 added these endpoints; you'll be calling all of them:
  - `GET /api/document-types`
  - `GET /api/document-types/:id`
  - `POST /api/document-types`
  - `PUT /api/document-types/:id`
  - `POST /api/document-types/:id/activate`
  - `POST /api/document-types/:id/detector-model`
  - `GET /api/document-types/:id/models`
- Stage 1 added `POST /api/models`, `POST /api/models/:id/file`, `POST /api/models/:id/validate`. You'll call them from step 4 of the wizard.

## Files to read first (~30 minutes)

1. [react/src/App.js](../react/src/App.js) — see how routes are added.
2. [react/src/api/client.js](../react/src/api/client.js).
3. [react/src/api/compare.js](../react/src/api/compare.js) (`fetchDocumentTypes`).
4. [react/src/features/documentTypes/documentTypesSlice.js](../react/src/features/documentTypes/documentTypesSlice.js) (read-only slice you'll extend).
5. [react/src/pages/ModelsPage.jsx](../react/src/pages/ModelsPage.jsx) — copy its card layout pattern.
6. [react/src/features/store/store.js](../react/src/features/store/store.js) — add the upgraded slice if needed.

## Tasks

### Task 6.1 — API client module

Create [react/src/api/documentTypes.js](../react/src/api/documentTypes.js):

```js
import client from "./client";

export const fetchAll = () => client.get("/document-types");
export const fetchOne = (id) => client.get(`/document-types/${id}`);
export const create = (payload) => client.post("/document-types", payload);
export const update = (id, payload) => client.put(`/document-types/${id}`, payload);
export const activate = (id) => client.post(`/document-types/${id}/activate`);
export const attachDetector = (id, modelId) =>
  client.post(`/document-types/${id}/detector-model`, { modelId });
export const listModels = (id) => client.get(`/document-types/${id}/models`);
```

### Task 6.2 — Extend the Redux slice

Edit [react/src/features/documentTypes/documentTypesSlice.js](../react/src/features/documentTypes/documentTypesSlice.js) and add these thunks alongside the existing `loadDocumentTypes`:

```js
export const createDocumentType = createAsyncThunk(
  "documentTypes/create",
  async (payload, { rejectWithValue }) => {
    try { return (await api.create(payload)).data; }
    catch (e) { return rejectWithValue(e.response?.data?.message || "create failed"); }
  },
);

export const updateDocumentType = createAsyncThunk(
  "documentTypes/update",
  async ({ id, payload }, { rejectWithValue }) => {
    try { return (await api.update(id, payload)).data; }
    catch (e) { return rejectWithValue(e.response?.data?.message || "update failed"); }
  },
);

export const activateDocumentType = createAsyncThunk(
  "documentTypes/activate",
  async (id, { rejectWithValue }) => {
    try { return (await api.activate(id)).data; }
    catch (e) { return rejectWithValue(e.response?.data?.message || "activation failed"); }
  },
);

export const attachDetector = createAsyncThunk(
  "documentTypes/attachDetector",
  async ({ id, modelId }, { rejectWithValue }) => {
    try { return (await api.attachDetector(id, modelId)).data; }
    catch (e) { return rejectWithValue(e.response?.data?.message || "attach failed"); }
  },
);
```

In the slice's `extraReducers`, on `fulfilled` of each, replace the matching item in `state.items` (or append for create). Keep the existing `loading` and `error` flags consistent with how `loadDocumentTypes` already handles them.

### Task 6.3 — `DocumentTypesPage` (list)

Create [react/src/pages/DocumentTypesPage.jsx](../react/src/pages/DocumentTypesPage.jsx). Use Ant Design `Table` (not Card grid — the schema is denser than models). Columns:

- `key` (monospace)
- `name`
- `status` — colored Tag: `draft` (default), `active` (green), `archived` (orange)
- `version` — small Tag
- `detectorModelId` — link or "—"
- `updatedAt` — `dayjs(...).format("YYYY-MM-DD HH:mm")`
- Actions: `Edit` -> navigate to `/document-types/:id`, `Activate` (disabled if `status === "active"`), `Archive`

Top toolbar:

- Title "Document Types"
- "New document type" primary button -> navigates to `/document-types/new`

Wire it into Redux: `useEffect(() => { dispatch(loadDocumentTypes()); }, []);`. Show `Spin` while loading.

### Task 6.4 — `DocumentTypeWizard` (5-step form)

Create [react/src/pages/DocumentTypeWizard.jsx](../react/src/pages/DocumentTypeWizard.jsx). Use Ant Design `Steps` with five steps. The wizard supports both create (`/document-types/new`) and edit (`/document-types/:id`).

**State:** keep a single `formState` object that mirrors the `DocumentType` shape:

```js
const [formState, setFormState] = useState({
  key: "", name: "",
  schema: { fields: [], arrays: [] },
  detectorConfig: { classMap: {}, labelRoles: {}, groupingRules: {} },
  promptTemplate: "",
  detectorModelId: null,
});
```

If `id` is in URL, `useEffect` -> `dispatch(loadDocumentTypes())` and seed `formState` from the matched item.

#### Step 1 — Basic info

- `Form.Item` for `key` (Input, required, lower-snake-case validation).
- `Form.Item` for `name` (Input, required).

#### Step 2 — Schema editor

- A `<JsonEditor>` (use [@uiw/react-codemirror](https://www.npmjs.com/package/@uiw/react-codemirror) with the `json` extension, or fall back to `<Input.TextArea rows={20}>` with `JSON.parse` validation on blur).
- A small "Schema reference" `Collapse` panel showing the expected shape (the `Schema` type from Stage 2).
- Validation on Next: `JSON.parse` succeeds, has `fields` and `arrays` arrays.

#### Step 3 — Detector class map / label roles / grouping rules

- Render a `<Table>` with one row per `(classId, label)` pair from `detectorConfig.classMap`.
- Columns: `classId` (Input number), `canonicalLabel` (Select — options come from `formState.schema.fields[].key + arrays[].key + arrays[].fields[].key`), `role` (Select: `single` | `arrayContainer` | `arrayChild`).
- Buttons: "Add row", "Remove row".
- A free-form JSON editor for `groupingRules` (rare, OK to be raw JSON).
- Cross-validation: every `canonicalLabel` chosen must exist in the schema. Roles must be consistent (e.g. only one `arrayContainer`).

#### Step 4 — Detector model upload/select

- Top: "Existing models for this document type" — `<Table>` from `GET /api/document-types/:id/models` (call only if `id` exists). Columns: `id`, `name`, `version`, `status`, `sha256` (truncated). Radio-select to pick existing.
- Bottom: "Upload new model" — Ant `Upload` (single file, `.pt` only, `beforeUpload: () => false` so it doesn't auto-upload). On click "Create + upload":
  1. Build `formState.classMap`/`classesCount` from step 3 and POST `/api/models`.
  2. Upload the `.pt` to `POST /api/models/:id/file`.
  3. Call `POST /api/models/:id/validate`.
  4. Call `POST /api/document-types/:docId/detector-model` with the returned model id.
- After success, set `formState.detectorModelId`.

#### Step 5 — Review & activate

- Show a read-only summary of all fields.
- "Save draft" button -> `dispatch(updateDocumentType({ id, payload: formState }))`.
- "Activate" button -> `dispatch(activateDocumentType(id))`. Disabled if any required field missing or no detector attached.
- On activate success: `message.success`, navigate to `/document-types`.

#### Wizard-wide

- `Save draft` button visible on every step (does `update`).
- `Next` button on step N validates step N before advancing.
- `Cancel` button navigates back to `/document-types`.
- Show inline `Alert` with the most recent error from Redux state.

### Task 6.5 — Routing

Edit [react/src/App.js](../react/src/App.js). Inside the `<RequireAuth>` block (around lines 89–104), add:

```jsx
<Route path="/document-types" element={<DocumentTypesPage />} />
<Route path="/document-types/new" element={<DocumentTypeWizard />} />
<Route path="/document-types/:id" element={<DocumentTypeWizard />} />
```

Also add a top nav link if your layout has one (check [react/src/App.js](../react/src/App.js) and [react/src/pages/](../react/src/pages/) for any `Menu`/`Layout.Sider` you might be missing — there's an unused `MainLayout.jsx` you may decide to wire in, but that's optional and out of scope here).

### Task 6.6 — Form ergonomics

- `Steps` with `current` controlled by `useState(0)`.
- Disable `Next` while a network call is in flight.
- After `create` (POST returns the new id), redirect from `/document-types/new` to `/document-types/:id` so subsequent saves use `update`.

## How to verify

Manual flow:

1. Log in. Navigate to `/document-types`. The list loads.
2. Click "New document type". Step 1 -> enter `key=invoice`, `name=Invoice`. Click Next.
3. Step 2 -> paste a sample invoice schema. Click Next.
4. Step 3 -> add 2 class map rows mapping classIds 0,1 to schema field keys, both `single`. Click Next.
5. Step 4 -> upload a fake `.pt` (any file renamed for testing — Stage 1 enforces extension; the validate endpoint will fail if the file isn't a real model, but you can still see the flow).
6. Step 5 -> Click Activate. Success message, redirect to `/document-types`.
7. Refresh — the new type shows `status: active`.
8. Open the new type, change the prompt template, save. Confirm `version` bumped from 1 to 2 in the list.
9. Try to delete an active model from `/models` (you'll do this once Stage 7 lands) — expect 409.

## Done when

- [ ] `DocumentTypesPage` renders, lists, and links into the wizard.
- [ ] Wizard supports create and edit.
- [ ] All 5 steps validate before allowing `Next`.
- [ ] Detector upload + validate + attach works end-to-end inside step 4.
- [ ] Activate button calls the right endpoint and reflects status in the UI.
- [ ] Activating with missing fields shows the server's 400 message in an inline alert.
- [ ] All slices have `loading` and `error` states correctly.

## Common pitfalls

- **Schema editor as plain `<input>`.** Won't fit. Use `<Input.TextArea rows={20}>` at minimum, ideally a JSON-aware editor.
- **`Form` resetFields on step change.** Don't rely on a single `<Form>` across steps; each step's `<Form>` should be independent and only update `formState` on `onValuesChange`. Otherwise switching steps discards state.
- **Upload component auto-uploading.** Ant's `<Upload>` posts to `action` by default. Use `beforeUpload: () => false` so you control the upload manually with `client.post`.
- **Calling `attachDetector` before the model is created.** Sequence matters: create model -> upload file -> validate -> attach. Use `await` on each, not `Promise.all`.
- **Forgetting the `multipart/form-data` header.** When uploading the `.pt`, set `headers: { "Content-Type": "multipart/form-data" }` (axios will add the boundary).
- **Treating Redux thunk reject values as plain errors.** Use `unwrap()` on the dispatched action so you can `try/catch` user-friendly messages.

## Hand-off

- Stage 7 will polish `ModelsPage` and update `ComparePage` to filter dropdowns to active document types — both depend on having admin tooling to test against.
- Stage 8 will rewrite the seed script using these endpoints to create the receipt document type the same way the UI does.
