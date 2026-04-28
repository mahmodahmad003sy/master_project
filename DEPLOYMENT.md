# Deployment

## 1. Connect this project to GitHub

This folder already has a local Git repository on branch `master`, but it has no remote yet.

Create an empty GitHub repository, then run:

```powershell
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin master
```

If GitHub asks for auth, use either GitHub Desktop, Git Credential Manager, or a Personal Access Token.

## 2. Files added for deployment

- `Dockerfile`
- `docker-compose.yml`
- `.env.production.example`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

## 3. Production env file

Create a local copy before the first deploy:

```powershell
Copy-Item .env.production.example .env.production
```

Set at least these values:

- `JWT_SECRET`
- `COMPARE_SERVICE_URL`
- `PUBLIC_API_URL`
- `COLAB_SYNC_TOKEN`
- `DB_PASSWORD`

For Docker deployment, keep:

- `DB_HOST=db`
- `MODELS_BASE_PATH=/app/api/tmp`
- `RUNS_BASE_PATH=/app/api/tmp/runs`

## 4. Server requirements

Install on the server:

- Docker Engine
- Docker Compose plugin

Quick check:

```bash
docker --version
docker compose version
```

## 5. First server setup

SSH into the server and create a deployment directory:

```bash
mkdir -p /opt/application
```

That same path should be used as the GitHub secret `SERVER_APP_DIR`.

## 6. GitHub secrets

In `GitHub -> Settings -> Secrets and variables -> Actions`, add:

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `SERVER_PORT`
- `SERVER_APP_DIR`
- `PROD_ENV_FILE`

`PROD_ENV_FILE` should contain the full contents of your `.env.production`, for example:

```env
APP_PORT=3000
PORT=3000
JWT_SECRET=replace-this
COMPARE_SERVICE_URL=https://your-compare-service.example.com
PUBLIC_API_URL=https://your-domain.example.com/api
COLAB_SYNC_TOKEN=replace-this
MODELS_BASE_PATH=/app/api/tmp
RUNS_BASE_PATH=/app/api/tmp/runs
DB_HOST=db
DB_PORT=5432
DB_HOST_PORT=5432
DB_USERNAME=ai_service_api
DB_PASSWORD=replace-this
DB_DATABASE=ai_service_api
DB_SYNCHRONIZE=true
DB_LOGGING=false
```

## 7. What the workflows do

`CI`:

- builds the API TypeScript
- builds the React app
- builds the Docker image

`Deploy`:

- builds and pushes the app image to GitHub Container Registry
- uploads `docker-compose.yml` to the server
- writes `.env.production` on the server from `PROD_ENV_FILE`
- pulls the latest image and starts the containers

## 8. First deployment

After the repo is pushed and secrets are added:

1. Push to `master`, or run the `Deploy` workflow manually from the Actions tab.
2. Open `https://your-domain.example.com`.
3. Verify API health by opening `https://your-domain.example.com/api`.

## 9. Local Docker run

For a local production-like run:

```powershell
Copy-Item .env.production.example .env.production
docker compose up --build
```

The app will be on `http://localhost:3000`.
