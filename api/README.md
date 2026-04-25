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
