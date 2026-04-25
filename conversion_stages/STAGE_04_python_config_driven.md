# Stage 4 — Python compare service becomes config-driven

**Estimated effort:** 2 days. **Dependencies:** Stage 3. **Unblocks:** Stage 5.

## Goal

Strip every receipt-specific assumption from [colab_app2.ipynb](../colab_app2.ipynb) and make the FastAPI `/compare` endpoint accept the rich payload that Stage 3 sends. After this stage, the same notebook running on the same Colab session can serve any document type without code edits — only the Node-side `DocumentType` configuration and the per-request payload change.

## Project background you must know first

- The notebook runs **FastAPI on Google Colab**, exposed via ngrok or cloudflared (cells 24–25 set up the tunnel).
- The notebook has 29 cells. Cells 4–17 implement the three pipelines; cell 20 wires them into the FastAPI app; cell 23 starts uvicorn.
- The three pipelines are functions, not classes:
  - `apply_main` (cell 10) — Tesseract + YOLO classical OCR.
  - `apply_hyperd` (cell 13) — YOLO + per-crop Qwen-VL hybrid.
  - `apply_qwen` (cell 17) — full-image Qwen-VL.
- Each returns `{"result_json": {...}, "json_path": ..., "annotated_image_path": ...}`. The compare endpoint passes `result_json` straight through as the `main`/`qwen`/`hybrid` keys in the response envelope.
- Hard-coded today:
  - `YOLO_WEIGHTS_PATH = "/content/yolov11_text_detector_fixed2vlast.pt"` (cell 4)
  - Receipt label sets: `SINGLE_FIELDS = ["DATE","FB","FD","SUM"]`, `ITEM_FIELDS = ["NAME","PRICE","QUANTITY"]` (cell 10), `TOP_FIELDS = ["FB","FD","SUM","DATE"]` (cell 13), and a Russian-receipt `PROMPT` (cell 17).
  - Output schema `{DATE, FB, FD, SUM, ORDER}` baked into `apply_main` (cell 10), `apply_qwen` (cell 17), `qwen_normalize_output` (cell 17), and `_make_fallback_envelope` (cell 20).
  - `recommended_for_production = "hybrid"` (literal, cell 20 line ~5309).
- The compare endpoint signature today (cell 20):
  ```python
  @app.post("/compare")
  async def compare_pipelines(
      file: UploadFile = File(...),
      x_api_key: Optional[str] = Header(default=None),
      save_to_disk: bool = Query(default=True),
  ): ...
  ```

## Files to read first (~30 minutes)

Open the notebook in Colab (or VS Code with the Jupyter extension) and read:

1. Cell 4 — globals and env config.
2. Cell 5 — `load_yolo_model`, `load_qwen_model`.
3. Cell 6 — `pil_to_b64_png`, `parse_json_from_text`, `envelope`.
4. Cell 10 — `apply_main`.
5. Cell 13 — `apply_hyperd`.
6. Cell 17 — `apply_qwen`, `PROMPT`, `qwen_normalize_output`.
7. Cell 20 — FastAPI app, `/compare`, `_make_fallback_envelope`, pipeline registration.

## Tasks

> Note on ordering: edit cells in numerical order so the kernel state is consistent if you re-run from top.

### Task 4.1 — Cell 4: drop hard-coded weights

Remove `YOLO_WEIGHTS_PATH`. Keep `QWEN_MODEL_ID`, `OCR_LANG`, `QWEN_MAX_NEW_TOKENS`, `COLAB_API_KEY`. Replace with:

```python
QWEN_MODEL_ID = os.getenv("QWEN_MODEL_ID", "Qwen/Qwen2-VL-2B-Instruct")
OCR_LANG = os.getenv("OCR_LANG", "rus+eng")
QWEN_MAX_NEW_TOKENS = int(os.getenv("QWEN_MAX_NEW_TOKENS", "384"))
COLAB_API_KEY = os.getenv("COLAB_API_KEY", "")
MODELS_DIR = os.environ.get("MODELS_DIR", "/content/models")
os.makedirs(MODELS_DIR, exist_ok=True)
```

`MODELS_DIR` is where Stage 5 will cache `.pt` files; we declare it here so cell 5 can use it.

### Task 4.2 — Cell 5: per-(modelId, version) YOLO loader

Replace the existing `_YOLO_MODEL` singleton with a cache keyed by `(modelId, modelVersion)`:

```python
import hashlib, requests, pathlib

_YOLO_CACHE = {}
_QWEN_MODEL = None
_QWEN_PROCESSOR = None

def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def download_with_token(url, dest, token):
    pathlib.Path(dest).parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, headers={"X-Sync-Token": token}, stream=True, timeout=600)
    r.raise_for_status()
    tmp = dest + ".part"
    with open(tmp, "wb") as f:
        for chunk in r.iter_content(1 << 20):
            if chunk:
                f.write(chunk)
    os.replace(tmp, dest)

def get_yolo_model(model_id, model_version, sha256, download_url, sync_token):
    key = (int(model_id), int(model_version))
    if key in _YOLO_CACHE:
        return _YOLO_CACHE[key]
    local = f"{MODELS_DIR}/m{model_id}/v{model_version}/weights.pt"
    if not (os.path.isfile(local) and sha256_of(local) == sha256):
        download_with_token(download_url, local, sync_token)
        actual = sha256_of(local)
        if actual != sha256:
            raise RuntimeError(f"sha256 mismatch: expected {sha256}, got {actual}")
    _YOLO_CACHE[key] = YOLO(local)
    return _YOLO_CACHE[key]

def load_qwen_model():
    global _QWEN_MODEL, _QWEN_PROCESSOR
    if _QWEN_MODEL is None:
        _QWEN_PROCESSOR = AutoProcessor.from_pretrained(QWEN_MODEL_ID)
        _QWEN_MODEL = Qwen2VLForConditionalGeneration.from_pretrained(QWEN_MODEL_ID, ...)
    return _QWEN_MODEL, _QWEN_PROCESSOR
```

(The hash and download helpers will also be reused by Stage 5's boot sync cell. We define them here in cell 5 so they exist before any pipeline runs.)

### Task 4.3 — Cell 8: remove the demo/global YOLO load

Cell 8 currently loads a YOLO model into a `model` global so that cell 10 (`apply_main`) can use it. After Task 4.2 the YOLO instance is per-request, so cell 8's globals are obsolete. Either:

- Delete cell 8 entirely (cleanest), or
- Keep it but guard with `if False:` so it doesn't run on full-notebook restart.

### Task 4.4 — Cell 10 (`apply_main`): take runtime config

Change the function signature from `def apply_main(image_path)` to:

```python
def apply_main(image_path, *, yolo, schema, class_map, label_roles, grouping_rules):
```

Inside:

- Build `single_fields = [k for k, role in label_roles.items() if role == "single"]`.
- Find the array container key (if any): `array_container = next((k for k, role in label_roles.items() if role == "arrayContainer"), None)`.
- Build `array_child_fields = [k for k, role in label_roles.items() if role == "arrayChild"]`.
- Build `field_type = {f["key"]: f["type"].upper() for f in schema.get("fields", [])} | {f["key"]: f["type"].upper() for arr in schema.get("arrays", []) for f in arr.get("fields", [])}`.
- Replace `class_names = model.names` with `class_names = {int(k): v for k, v in class_map.items()}`.
- Build the final dict from the schema:
  ```python
  fields_final = {f["key"]: fields_out.get(f["key"], "") for f in schema.get("fields", [])}
  for arr in schema.get("arrays", []):
      fields_final[arr["key"]] = items_out.get(arr["key"], [])
  ```
- Use `yolo` (passed in) instead of the global `model`.

Drop `OUT_DIR`-based file writes from the hot path (Colab disk is ephemeral). If you want to keep the side artifacts, write them under a per-request temp dir.

### Task 4.5 — Cell 13 (`apply_hyperd`): same treatment

Mirror the same signature change. The hybrid pipeline:

- Loads `yolo` from the parameter.
- Iterates detections; uses `class_map` and `label_roles` to decide which crops feed which Qwen prompt.
- Builds the per-field Qwen prompt from a generic template — drop the receipt-specific dictionary `prompts = { "NAME": ..., "PRICE": ..., ... }`. Instead, derive it from `field_type`:
  ```python
  GENERIC_PROMPTS = {
      "TEXT": "Read the text exactly as printed. Return only the value.",
      "NUMBER": "Return only the number exactly as printed. Digits only.",
      "MONEY": "Return only the monetary amount exactly as printed. Digits and decimal separator only.",
      "DATE": "Return only the date exactly as printed.",
  }
  def prompt_for_field(field_name):
      ftype = (field_type.get(field_name) or "TEXT").upper()
      return GENERIC_PROMPTS.get(ftype, GENERIC_PROMPTS["TEXT"])
  ```
- Build `fields_final` from `schema` exactly as in Task 4.4.

### Task 4.6 — Cell 17 (`apply_qwen`): runtime prompt + generic normalization

Replace the hard-coded `PROMPT` with `prompt_template` (passed in) and inject the schema as JSON:

```python
def apply_qwen(image_path, *, schema, prompt_template):
    schema_json = json.dumps(schema_for_prompt(schema), ensure_ascii=False, indent=2)
    full_prompt = prompt_template.replace("{{SCHEMA}}", schema_json) if "{{SCHEMA}}" in prompt_template else (prompt_template + "\n\nSchema:\n" + schema_json)
    # ... build messages with full_prompt and image, then run the model ...
    raw = run_qwen_one_image(image_path, full_prompt)
    parsed = parse_json_from_text(raw) or {}
    fields = normalize_to_schema(parsed, schema)
    return {"result_json": {"file": os.path.basename(image_path), "fields": fields, "confidence": 0.0, "scan_time_sec": ...}}
```

Replace `qwen_normalize_output` and `_make_fallback_envelope` with one generic helper:

```python
def normalize_to_schema(data, schema):
    out = {}
    for f in schema.get("fields", []):
        key = f["key"]
        val = data.get(key)
        if val is None:
            for alt in (key.lower(), key.upper(), key.title()):
                if alt in data:
                    val = data[alt]; break
        out[key] = coerce(val, f.get("type"))
    for arr in schema.get("arrays", []):
        key = arr["key"]
        rows = data.get(key) or data.get(key.lower()) or []
        out[key] = [
            {sf["key"]: coerce(row.get(sf["key"]), sf.get("type")) for sf in arr.get("fields", [])}
            for row in rows if isinstance(row, dict)
        ]
    return out

def coerce(val, ftype):
    if val is None or val == "":
        return None
    if ftype in ("number", "money"):
        try: return float(str(val).replace(",", "."))
        except: return None
    return str(val)

def make_fallback_envelope(schema, error_text):
    return {"file": None, "fields": normalize_to_schema({}, schema), "confidence": 0.0, "scan_time_sec": 0.0, "_error": error_text}
```

This deletes the receipt-specific aliases (`"date"`, `"receipt_date"`, `"total"`, etc.) — that's intentional. If a document type needs aliases, it should bake them into its own prompt template.

### Task 4.7 — Cell 20: new `/compare` signature and recommend policy

Replace the route signature with:

```python
from fastapi import Form

@app.post("/compare")
async def compare_pipelines(
    file: UploadFile = File(...),
    documentTypeKey: str = Form(...),
    documentTypeVersion: int = Form(1),
    schema: str = Form(...),
    promptTemplate: str = Form(""),
    promptVersion: int = Form(1),
    modelId: int = Form(...),
    modelVersion: int = Form(...),
    modelSha256: str = Form(...),
    modelDownloadUrl: str = Form(...),
    syncToken: str = Form(...),
    classMap: str = Form(...),
    labelRoles: str = Form(...),
    groupingRules: str = Form("{}"),
    fieldConfig: str = Form("{}"),
    x_api_key: Optional[str] = Header(default=None),
    save_to_disk: bool = Query(default=False),
):
    _auth_or_401(x_api_key)
    schema_obj = json.loads(schema)
    class_map = json.loads(classMap)
    label_roles = json.loads(labelRoles)
    grouping_rules = json.loads(groupingRules)

    yolo = get_yolo_model(modelId, modelVersion, modelSha256, modelDownloadUrl, syncToken)

    # Save uploaded image to a temp path
    pil_img, image_path = _save_upload_to_tmp(file)

    response = {
        "ok": True,
        "mode": "compare",
        "run_meta": {
            "filename": file.filename,
            "image_w": pil_img.width,
            "image_h": pil_img.height,
            "device": globals().get("DEVICE", "unknown"),
            "timings_ms": {},
        },
        "main": make_fallback_envelope(schema_obj, "not executed"),
        "qwen": make_fallback_envelope(schema_obj, "not executed"),
        "hybrid": make_fallback_envelope(schema_obj, "not executed"),
        "errors": {},
        "tracebacks": {},
        "recommended_for_production": None,
    }

    runners = {
        "main": lambda: apply_main(image_path, yolo=yolo, schema=schema_obj,
                                   class_map=class_map, label_roles=label_roles,
                                   grouping_rules=grouping_rules),
        "qwen": lambda: apply_qwen(image_path, schema=schema_obj,
                                   prompt_template=promptTemplate),
        "hybrid": lambda: apply_hyperd(image_path, yolo=yolo, schema=schema_obj,
                                       class_map=class_map, label_roles=label_roles,
                                       grouping_rules=grouping_rules,
                                       prompt_template=promptTemplate),
    }
    for name, runner in runners.items():
        result, err, tb, ms = _run_one_pipeline(name, runner)
        response[name] = result
        response["run_meta"]["timings_ms"][name] = ms
        if err:
            response["errors"][name] = err
            response["tracebacks"][name] = tb
            response["ok"] = False

    response["recommended_for_production"] = recommend(response)
    return JSONResponse(response)


def recommend(response, policy=("hybrid", "qwen", "main")):
    for name in policy:
        result = response.get(name) or {}
        if not result.get("_error") and result.get("fields"):
            return name
    return None
```

Helper `_save_upload_to_tmp` reads `file.file.read()` into a PIL image and writes it to `/tmp/<uuid>.<ext>` so existing `apply_*(image_path)` keep working.

### Task 4.8 — Smoke-test inside Colab

Add a small test cell at the bottom (do not commit if you prefer) that calls `/compare` over `requests.post` with a fake but valid payload to confirm the schema-driven outputs match the schema.

## How to verify

1. Restart the Colab runtime, run cells in order.
2. Confirm `_YOLO_CACHE` is empty initially.
3. Use `curl` from your laptop (after the tunnel is up):
   ```bash
   curl -X POST https://<tunnel>/compare \
     -F "file=@/path/to/test.jpg" \
     -F "documentTypeKey=invoice" \
     -F "documentTypeVersion=1" \
     -F "schema=$(cat /tmp/invoice_schema.json)" \
     -F "promptTemplate=Extract invoice fields as JSON. Schema: {{SCHEMA}}" \
     -F "promptVersion=1" \
     -F "modelId=42" \
     -F "modelVersion=3" \
     -F "modelSha256=$(sha256sum model.pt | awk '{print $1}')" \
     -F "modelDownloadUrl=https://node-tunnel/api/models/42/download" \
     -F "syncToken=$COLAB_SYNC_TOKEN" \
     -F 'classMap={"0":"INVOICE_NO","1":"AMOUNT"}' \
     -F 'labelRoles={"INVOICE_NO":"single","AMOUNT":"single"}' \
     -F 'groupingRules={}' \
     -F 'fieldConfig={}'
   ```
4. Response keys must include `main`, `qwen`, `hybrid`, `run_meta.timings_ms`, `recommended_for_production`. The fields inside each pipeline must be exactly the keys from the invoice schema (no `DATE`/`FB`/`FD`/`SUM`/`ORDER`).

## Done when

- [ ] No reference to `WEIGHTS_PATH`, `YOLO_WEIGHTS_PATH`, `SINGLE_FIELDS`, `ITEM_FIELDS`, `TOP_FIELDS`, `FIELD_TYPE`, the receipt-specific `PROMPT`, `qwen_normalize_output`, or `_make_fallback_envelope` remains in cells 4–20.
- [ ] `apply_main`, `apply_qwen`, `apply_hyperd` all take schema/classMap/labelRoles via parameters.
- [ ] The fallback envelope's `fields` shape matches the per-request schema, not a fixed receipt shape.
- [ ] `recommended_for_production` is the result of `recommend(response)`, not a literal.
- [ ] `/compare` accepts every field listed in Task 4.7 and rejects requests missing required fields with 422 (FastAPI default).
- [ ] An invoice-shaped request returns invoice-shaped output; a receipt-shaped request returns receipt-shaped output.
- [ ] Two consecutive `/compare` requests with the same `(modelId, modelVersion)` reuse the cached YOLO without re-downloading.

## Common pitfalls

- **Form vs JSON.** FastAPI distinguishes `Form(...)` (multipart fields) from JSON body. Stage 3 sends multipart; you must use `Form(...)` for every config field. Mixing JSON body with `UploadFile` is fragile.
- **Case sensitivity in JSON parsing.** The fields you receive are JSON strings; `json.loads(classMap)` returns a dict whose keys are strings (`"0"`, `"1"`) not ints. Convert at use site: `int(k)` when iterating.
- **`get_yolo_model` blocking.** First call may take several seconds (download + load). FastAPI handles this fine because the route is `async def` but the work is sync; uvicorn runs it on a thread. Just don't `await` it.
- **Forgetting to clear globals from the old code.** If cells 8/10/13 still reference a global `model`/`WEIGHTS_PATH`, kernel restart will fail. Search the whole notebook for residual references.
- **Saving to `/content`** in the hot path. `/content` is wiped on Colab restart; set `save_to_disk=False` from Node (Stage 3 already does).
- **Tesseract language.** `apply_main` uses `OCR_LANG` from cell 4. For non-Russian documents you may need to install additional `tesseract-ocr-<lang>` packages (cell 3). Document this as a follow-up; don't block on it.

## Hand-off

- Stage 5 will add the boot-sync cell that pre-pulls all active models. The helpers `sha256_of` and `download_with_token` are already in cell 5; Stage 5 will wrap them in `sync_models_from_api()`.
- Stage 8 will benchmark the new endpoint with a non-receipt document type to confirm everything is decoupled.
