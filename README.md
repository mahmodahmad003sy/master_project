# Application

## Quick start

- Requirements: Node 18+, npm, Postgres, and the Python compare service.
- Create the database and user expected by `api/config/default.json`.
- Put the receipt seed weights at `scripts/seed_assets/yolov11_receipt.pt`.
- From `api/`, run `npm run seed` or `yarn seed` on a fresh database.
- Start the compare service so `COMPARE_SERVICE_URL` is reachable.
- Run `.\run.ps1` from the repository root.
- Open `http://localhost:3000`.

## Multi-document conversion

This project has been converted from a receipt-only compare flow into a dynamic
multi-document platform. Document types now own schema, prompt, detector
mapping, and active model selection; compare runs snapshot the document and
model versions used at runtime; and the Colab service syncs active detector
weights from the Node API. The staged migration plan is documented in
[MULTI_DOCUMENT_CONVERSION_PLAN.md](./MULTI_DOCUMENT_CONVERSION_PLAN.md).

## Notes

- The Node process serves both the API and the built React app.
- Existing runs, benchmarks, and analytics remain usable even if the compare
  service is temporarily unavailable.
- Deployment files and setup steps are documented in
  [DEPLOYMENT.md](./DEPLOYMENT.md).
