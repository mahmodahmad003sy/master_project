# Stage 0 — Foundation: config keys, sync token, conventions

**Estimated effort:** half a day. **Dependencies:** none. **Unblocks:** all other stages.

## Goal

Lay down the minimum scaffolding every other stage depends on:

1. Two new configuration keys in the Node API (`PUBLIC_API_URL`, `COLAB_SYNC_TOKEN`).
2. A tiny `requireSyncToken` middleware that any "Colab-facing" endpoint can use.
3. A short developer note documenting that schema changes happen via TypeORM `synchronize: true` (no migration files).

Nothing in this stage exposes new behavior to users. Once it merges, Stages 1–8 can wire endpoints to it.

## Project background you must know first

- The Node API uses Express 5 (see [api/package.json](../api/package.json)) and TypeORM 0.2.x. Configuration is loaded from a JSON file:
  - [api/config/default.json](../api/config/default.json) is imported as a regular JSON module by controllers (e.g. `import config from "../../config/default.json"` in [api/src/controllers/modelController.ts](../api/src/controllers/modelController.ts) line 6).
  - There is **no** `process.env` usage in `api/src/*` other than `dotenv/config` at the top of [api/src/app.ts](../api/src/app.ts). So when you add a config key, add it to `default.json`.
- TypeORM auto-syncs entities to the DB because `db.synchronize` is `true` in `default.json` line 19. So adding a `@Column` to an entity class is enough — restarting the API creates the DB column.
- Existing middleware lives in [api/src/utils/](../api/src/utils/). The auth middleware [authMiddleware.ts](../api/src/utils/authMiddleware.ts) is the closest model for what you'll build.

## Files to read first (~10 minutes)

1. [api/src/app.ts](../api/src/app.ts) — see how middleware and routes are wired.
2. [api/src/utils/authMiddleware.ts](../api/src/utils/authMiddleware.ts) — your `requireSyncToken` middleware will mirror its style.
3. [api/config/default.json](../api/config/default.json) — see existing keys.
4. [api/src/controllers/modelController.ts](../api/src/controllers/modelController.ts) lines 1–10 — see how config is imported and used.

## Tasks

### Task 0.1 — Add new config keys

Edit [api/config/default.json](../api/config/default.json). Add two new top-level keys (next to the existing `MODELS_BASE_PATH`, `COMPARE_SERVICE_URL`, etc.):

```json
{
  "...": "...",
  "MODELS_BASE_PATH": "D:/Master/service/api/tmp",
  "COMPARE_SERVICE_URL": "http://localhost:8001",
  "PUBLIC_API_URL": "http://localhost:3000/api",
  "COLAB_SYNC_TOKEN": "change-me-to-a-long-random-string",
  "...": "..."
}
```

What they mean:

- `PUBLIC_API_URL` — the externally reachable URL of the Node API (e.g. an ngrok URL when developing). Colab calls this URL to download `.pt` files. **For local-only development you can leave it as `http://localhost:3000/api`; it won't work for Colab until you run a tunnel.**
- `COLAB_SYNC_TOKEN` — shared secret. Colab sends this in the `X-Sync-Token` header for sync endpoints. Generate at least 32 random chars.

If a `.gitignore`d `local.json` or environment-specific override file exists in `api/config/`, add the same keys there too.

### Task 0.2 — Build the `requireSyncToken` middleware

Create new file [api/src/utils/syncTokenMiddleware.ts](../api/src/utils/syncTokenMiddleware.ts):

```ts
import { Request, Response, NextFunction } from "express";
import config from "../../config/default.json";

export const requireSyncToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const provided = req.header("x-sync-token");
  const expected = config.COLAB_SYNC_TOKEN;

  if (!expected || expected === "change-me-to-a-long-random-string") {
    res.status(500).json({ error: "COLAB_SYNC_TOKEN is not configured" });
    return;
  }

  if (!provided || provided !== expected) {
    res.status(401).json({ error: "invalid or missing X-Sync-Token" });
    return;
  }

  next();
};
```

Notes:

- Header names in Express are case-insensitive but `req.header()` should be lowercased — keep `"x-sync-token"`.
- We deliberately reject the placeholder default to fail loudly if someone forgets to set a real token in production.
- This middleware does **not** call `requireAuth`. Colab is a service, not a user.

### Task 0.3 — Add a TypeScript type for config (optional but recommended)

Because [api/config/default.json](../api/config/default.json) is imported as JSON, TypeScript infers a structural type from its current contents. When you add new keys this is automatic. **However**, if you ever see `Property 'PUBLIC_API_URL' does not exist on type ...` errors, run a clean rebuild (`yarn build`) — TypeScript caches JSON imports.

No code change required here unless you hit that error.

### Task 0.4 — Add a developer note about TypeORM sync

Add a short section to [api/README.md](../api/README.md) (create it if absent) titled "Schema changes":

```md
## Schema changes

This project uses TypeORM with `db.synchronize: true` in `config/default.json`.
That means: add or modify a `@Column` on an entity in `src/entities/`, restart
the API, and the corresponding column is created/altered automatically. We do
not maintain SQL migration files. If you ever set `synchronize: false`, you
must generate migrations manually with `typeorm migration:generate`.
```

## How to verify

1. The API still starts: `cd api && yarn dev` (or `npm run dev` — check [api/package.json](../api/package.json) scripts). No compile errors.
2. Hit any existing endpoint and confirm nothing changed: `curl http://localhost:3000/api/document-types -H "Authorization: Bearer <token>"` returns the same response as before.
3. Manually invoke the new middleware on a throwaway test route to confirm it rejects missing/wrong tokens with 401 and accepts valid ones with 200. (You don't need to commit the test route — delete it after verifying.)

## Done when

- [ ] `PUBLIC_API_URL` and `COLAB_SYNC_TOKEN` exist in `api/config/default.json`.
- [ ] `api/src/utils/syncTokenMiddleware.ts` exists, exports `requireSyncToken`.
- [ ] Existing endpoints behave identically (no regression).
- [ ] The README note about `synchronize: true` exists.
- [ ] `yarn build` passes with no TS errors.

## Common pitfalls

- **Forgetting to restart the API after editing `default.json`.** The JSON is imported at module load; changes only take effect on restart.
- **Using `process.env` instead of `config.X`.** This codebase does not load env vars into `config`. Stick to the JSON file.
- **Putting the middleware behind `requireAuth`.** It must run **before** `requireAuth` so Colab (which has no JWT) can pass through.
- **Using a placeholder token in committed config.** It's OK to commit a placeholder like `change-me-to-a-long-random-string` because the middleware refuses to accept it. But the real token in your dev machine should be set in a `local.json` or env override.

## Hand-off to next stages

After this merges, Stages 1 and 5 can use:

- `import { requireSyncToken } from "../utils/syncTokenMiddleware"`
- `import config from "../../config/default.json"` and read `config.PUBLIC_API_URL`, `config.COLAB_SYNC_TOKEN`.
