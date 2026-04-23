$ErrorActionPreference = "Stop"

Push-Location (Join-Path $PSScriptRoot "api")
npm install
npm run tsc
Pop-Location

Push-Location (Join-Path $PSScriptRoot "react")
npm install
npm run build
Pop-Location

Push-Location (Join-Path $PSScriptRoot "api")
$env:NODE_ENV = "production"
node dist/src/app.js
