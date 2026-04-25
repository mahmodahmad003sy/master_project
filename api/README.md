## Schema changes

This project uses TypeORM with `db.synchronize: true` in `config/default.json`.
That means: add or modify a `@Column` on an entity in `src/entities/`, restart
the API, and the corresponding column is created/altered automatically. We do
not maintain SQL migration files. If you ever set `synchronize: false`, you
must generate migrations manually with `typeorm migration:generate`.

## Running with Colab - networking

Colab cannot call `http://localhost:3000` on your machine directly. The Node
API must be exposed through a public tunnel, and both Node and Colab must use
the same public API base URL.

Typical local workflow:

1. Start the API locally on port `3000`.
2. Start a tunnel to that port.
3. Copy the public `https://...` URL into:
   `config/default.json` -> `PUBLIC_API_URL`
4. Use the matching `/api` URL in the Colab notebook Sync Config cell as
   `NODE_API_URL`.
5. Set Colab `NODE_SYNC_TOKEN` to the same value as
   `config.COLAB_SYNC_TOKEN`.

Examples:

```bash
# Option A: ngrok
ngrok http 3000

# Option B: cloudflared
cloudflared tunnel --url http://localhost:3000
```

If your tunnel URL is `https://abc.ngrok-free.app`, then set:

```json
{
  "PUBLIC_API_URL": "https://abc.ngrok-free.app/api"
}
```

and in Colab:

```python
NODE_API_URL = "https://abc.ngrok-free.app/api"
```

Tunnel URLs usually change after restart unless you use a reserved domain. When
that happens, update both `PUBLIC_API_URL` and `NODE_API_URL` together.

## Seeding Receipts

The receipt flow is seeded into the dynamic document-type model.

1. Put the receipt detector weights at
   `scripts/seed_assets/yolov11_receipt.pt` in the repo root.
   This file is gitignored. It should be a copy of the Colab receipt weights
   file `yolov11_text_detector_fixed2vlast.pt`.
2. From `api/`, run `npm run seed` or `yarn seed`.
3. The script creates or updates:
   `receipt` document type
   `receipt-yolov11-v1` detector model
4. On success both are left in `active` status.

If the seed asset is missing, the script fails with the expected absolute path.

## Adding A Document Type

The admin UI at `/document-types` is the normal way to add a new document type.
Use the 5-step wizard to define:

1. Basic info and prompt template
2. Schema JSON
3. Detector class map, label roles, and grouping rules
4. Detector upload or selection
5. Activation

For Colab-backed compare runs, keep the Stage 5 networking setup in place so
the notebook can sync active detector models from the Node API.
