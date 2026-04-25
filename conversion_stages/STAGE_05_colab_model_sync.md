# Stage 5 — Colab model file sync

**Estimated effort:** 0.5–1 day. **Dependencies:** Stages 1, 4. **Unblocks:** Stage 8.

## Goal

Make Colab able to recover all active `.pt` files after a session restart with one cell, and silently fetch new models on the next `/compare` after they are added in Node. This is the piece that makes "the project actually works on Colab" rather than "in theory."

The on-demand fallback is already in place from Stage 4 (`get_yolo_model` downloads on cache miss). This stage adds the **boot-time pre-pull** so the first compare after a restart isn't slow.

## Project background you must know first

- Stage 1 added two endpoints on the Node side:
  - `GET /api/models/active` — returns one row per active model with `modelId`, `modelVersion`, `documentTypeKey`, `sha256`, `fileSize`, `downloadUrl`, `classMap`. Auth: `X-Sync-Token`.
  - `GET /api/models/:id/download` — streams the `.pt`. Auth: `X-Sync-Token`.
- Stage 4 added `MODELS_DIR = "/content/models"` and the helpers `sha256_of`, `download_with_token` to cell 5 of [colab_app2.ipynb](../colab_app2.ipynb).
- The shared secret lives in:
  - Node: `config.COLAB_SYNC_TOKEN` (Stage 0).
  - Colab: env var `NODE_SYNC_TOKEN` (set in the new config cell below).
- Colab cannot reach `localhost:3000`; it needs the public URL of the Node API. Set this in `NODE_API_URL` (the new config cell).

## Files to read first (~10 minutes)

1. [colab_app2.ipynb](../colab_app2.ipynb) cell 5 (helpers from Stage 4).
2. [api/src/controllers/modelController.ts](../api/src/controllers/modelController.ts) functions `listActiveModels` and `downloadModelFile` (Stage 1).
3. [api/src/utils/syncTokenMiddleware.ts](../api/src/utils/syncTokenMiddleware.ts) (Stage 0).

## Tasks

### Task 5.1 — Add a Colab "Sync config" cell

Insert a new cell **after cell 4 (config)** and **before cell 5 (loaders)**. Mark it as a config cell so it's easy to find:

```python
# === SYNC CONFIG ===
# Edit these values (or set env vars before running) to point Colab at your Node API.
NODE_API_URL = os.environ.get("NODE_API_URL", "https://<your-node-tunnel>/api")
NODE_SYNC_TOKEN = os.environ.get("NODE_SYNC_TOKEN", "")
assert NODE_SYNC_TOKEN, "Set NODE_SYNC_TOKEN to the COLAB_SYNC_TOKEN value from api/config/default.json"
print(f"NODE_API_URL = {NODE_API_URL}")
```

The assertion is intentional — it's better to fail loudly than to silently 401 later.

### Task 5.2 — Add the boot-sync cell

Insert a new cell **after the helpers cell (post-Stage-4 cell 5)** and **before the FastAPI cell (cell 20)**. Call it explicitly when starting a new Colab session:

```python
# === BOOT SYNC: pull all active models from Node ===
def sync_models_from_api():
    """Pull every active detector .pt from the Node API into MODELS_DIR.

    Idempotent: cached files with matching sha256 are skipped.
    Run this cell once per Colab session (or any time you suspect drift).
    """
    r = requests.get(
        f"{NODE_API_URL}/models/active",
        headers={"X-Sync-Token": NODE_SYNC_TOKEN},
        timeout=60,
    )
    r.raise_for_status()
    rows = r.json()
    summary = []
    for m in rows:
        local = f"{MODELS_DIR}/m{m['modelId']}/v{m['modelVersion']}/weights.pt"
        if os.path.isfile(local) and sha256_of(local) == m["sha256"]:
            summary.append((m["modelId"], m["modelVersion"], "cached"))
            continue
        download_with_token(m["downloadUrl"], local, NODE_SYNC_TOKEN)
        actual = sha256_of(local)
        if actual != m["sha256"]:
            raise RuntimeError(
                f"sha256 mismatch for model {m['modelId']}@{m['modelVersion']}: "
                f"expected {m['sha256']}, got {actual}"
            )
        summary.append((m["modelId"], m["modelVersion"], "downloaded"))
    print("sync_models_from_api: ", summary)
    return summary

sync_models_from_api()
```

The cell calls `sync_models_from_api()` immediately so a "Run all" of the notebook produces a ready-to-serve state.

### Task 5.3 — Document the manual workflow

Add a short markdown cell **just before** the sync config cell explaining the workflow to whoever opens the notebook:

> ### Run order after a Colab restart
>
> 1. Run the install cells (1–3) once per session.
> 2. Run the config cells (4 + Sync Config) — set `NODE_API_URL` and `NODE_SYNC_TOKEN` in the cell or as env vars.
> 3. Run the helper/loader cells (5–7).
> 4. Run the boot-sync cell — confirm the printed summary lists the active models.
> 5. Run the pipeline cells (10, 13, 17) to define the functions.
> 6. Run the FastAPI cell (20).
> 7. Run the uvicorn + tunnel cells (23–25).
>
> If you add a new model in Node mid-session, you do **not** need to re-run sync — the next `/compare` will lazy-download it. But re-running sync is harmless.

### Task 5.4 — Verify the on-demand fallback path

`get_yolo_model` (from Stage 4 cell 5) already handles cache misses by downloading from `modelDownloadUrl` with `syncToken` from the request. Re-read that function to make sure:

- It uses the **same** `MODELS_DIR` and `sha256_of`/`download_with_token` helpers as `sync_models_from_api`.
- It uses the `syncToken` from the request (not `NODE_SYNC_TOKEN` from the config cell). This way a request from Node carries its own credentials and Colab doesn't need to be reconfigured if Node rotates the token.

If you find a divergence, fix it now.

### Task 5.5 — Networking sanity check

If you don't already have a tunnel running for Node, set one up:

```bash
# Option A: ngrok
ngrok http 3000
# copy the https URL (e.g. https://abc.ngrok-free.app) into:
#  - api/config/default.json -> "PUBLIC_API_URL": "https://abc.ngrok-free.app/api"
#  - the Colab Sync Config cell -> NODE_API_URL = "https://abc.ngrok-free.app/api"

# Option B: cloudflared (preferred for stability)
cloudflared tunnel --url http://localhost:3000
```

Both URLs change on every restart unless you have a paid plan. Document the workflow in [api/README.md](../api/README.md) ("Running with Colab — networking").

## How to verify

1. **Cold-start sync.** Restart the Colab runtime (Runtime > Disconnect and delete runtime). Run all cells. Confirm `sync_models_from_api()` prints `("downloaded", ...)` for each active model.
2. **Re-run sync.** Run the cell again. Confirm everything prints `("cached", ...)` and no network call to `/download` happens (use Chrome DevTools or the Node logs).
3. **Tampering test.** In a Colab terminal: `truncate -s -1 /content/models/m1/v1/weights.pt`. Run `sync_models_from_api()` again. Confirm the file is re-downloaded and sha256 verifies.
4. **Mid-session new model.** From your laptop, upload a new `.pt` to Node and activate a new document type. Without re-running the sync cell, send a `/compare` for that document type. Confirm Node logs a `GET /api/models/<new-id>/download` from Colab and the response is correct.
5. **Auth failure.** In a fresh terminal: `curl -i $NODE_URL/api/models/active -H "X-Sync-Token: wrong"` returns 401.
6. **No-token configuration.** Comment out `NODE_SYNC_TOKEN` and re-run the sync config cell — assertion should fire.

## Done when

- [ ] Sync Config cell exists with assertion guarding empty token.
- [ ] Boot Sync cell exists, calls `sync_models_from_api()` on run.
- [ ] Cold start of the notebook (after `Disconnect and delete runtime`) ends in a state where `/compare` works without manual `.pt` uploads.
- [ ] Cached models are not re-downloaded.
- [ ] Tampered files are detected and re-downloaded.
- [ ] Lazy fallback path in `get_yolo_model` still works for mid-session new models.
- [ ] [api/README.md](../api/README.md) has a "Running with Colab — networking" section.

## Common pitfalls

- **Tunnel URL changes.** Every time ngrok/cloudflared restarts, you have to update both `PUBLIC_API_URL` (Node) and `NODE_API_URL` (Colab). This is annoying; it is also the reality of free tunnels. Use cloudflared with a named tunnel if you need stability.
- **Mixed `http` and `https`.** Browsers and Python both care. Make sure both sides use `https://` (tunnels are TLS-terminated for you).
- **Hairpin networking.** If you're testing entirely on one machine and Node + tunnel are running there, Colab still has to go out to the public internet and back. That's fine; just be aware that latencies you see are real-world latencies.
- **Cache eviction.** This stage does not implement eviction. If you upload many model versions, `/content/models/` grows. For a single-user dev setup this is fine. If we ever need eviction, add it as a follow-up that LRU-evicts based on `_YOLO_CACHE` access order.
- **Not running `sync_models_from_api()` automatically.** The cell calls it on run; if a junior dev "Run all"s the notebook, it executes. If they run cells one-by-one and skip this one, the first compare downloads on demand — slower but correct.

## Hand-off

- Stage 8's regression tests will exercise both the boot sync and the lazy fallback paths.
