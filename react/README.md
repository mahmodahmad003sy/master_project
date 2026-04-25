# React Frontend

## Development

From `react/`:

- `npm start` runs the dev server
- `npm run build` builds the production bundle

The frontend talks to the Node API through `REACT_APP_API_URL`. If the value
does not end in `/api`, the client appends `/api` automatically.

## Document Types

The admin flow for new document types lives at `/document-types`.

Use the wizard to:

1. Define the key, name, and prompt template
2. Paste the schema JSON
3. Map detector classes to canonical schema labels
4. Upload or select a detector model
5. Activate the document type

Only active document types appear in `/compare`.

## Seeded Receipt Flow

After the backend seed runs, the default `receipt` document type is available
through the same UI and compare flow as any new document type. See
`../api/README.md` for seed setup and Colab networking notes.
