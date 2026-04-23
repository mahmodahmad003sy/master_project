# Application

## Quick start

- Requirements: Node 18+, npm, Postgres, and the Python compare service.
- Create the database and user expected by `api/config/default.json`.
- Start the compare service so `COMPARE_SERVICE_URL` is reachable.
- Run `.\run.ps1` from the repository root.
- Open `http://localhost:3000`.

## Notes

- The Node process serves both the API and the built React app.
- Existing runs, benchmarks, and analytics remain usable even if the compare
  service is temporarily unavailable.
