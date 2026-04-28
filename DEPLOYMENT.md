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

## 3. Deployment model

This setup now assumes:

- GitHub-hosted runner builds and pushes the Docker image to `ghcr.io`
- a `self-hosted GitHub runner` runs inside your private network
- that self-hosted runner has direct access to Docker on the deployment machine

This is the right model for your VPN/internal server setup because GitHub-hosted runners cannot join your OpenVPN network.

Best case:

- install the self-hosted runner on the target server itself

That avoids SSH completely during deploy.

## 4. Production env file

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

## 5. Server requirements

Install on the server:

- Docker Engine
- Docker Compose plugin
- a self-hosted GitHub Actions runner

Quick check:

```bash
docker --version
docker compose version
```

## 6. Self-hosted runner setup

In your GitHub repository:

1. Open `Settings -> Actions -> Runners`
2. Click `New self-hosted runner`
3. Choose `Linux x64`
4. Run the commands GitHub shows on the target server

Important:

- install the runner on the same machine that should run Docker, or on a machine that has direct Docker access to that host
- keep the runner online as a service
- make sure the runner has the labels `self-hosted`, `linux`, and `x64`

## 7. First server setup

Create a deployment directory on the machine that hosts the self-hosted runner:

```bash
mkdir -p /opt/application
```

That same path should be stored as the GitHub repository variable `DEPLOY_PATH`.

If Docker requires elevated permissions on that machine, run the runner service under a user that can access Docker.

## 8. GitHub Actions settings

In `GitHub -> Settings -> Secrets and variables -> Actions`, add:

Secrets:

- `PROD_ENV_FILE`

Variables:

- `DEPLOY_PATH`

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

Example variable:

```text
DEPLOY_PATH=/opt/application
```

## 9. What the workflows do

`CI`:

- builds the API TypeScript
- builds the React app
- builds the Docker image

`Deploy`:

- builds and pushes the app image to GitHub Container Registry
- runs on your self-hosted runner
- copies `docker-compose.yml` into `DEPLOY_PATH`
- writes `.env.production` from `PROD_ENV_FILE`
- pulls the latest image and starts the containers locally with Docker Compose

## 10. First deployment

After the repo is pushed, the runner is online, and the secrets/variables are added:

1. Push to `master`, or run the `Deploy` workflow manually from the Actions tab.
2. Open `https://your-domain.example.com`.
3. Verify API health by opening `https://your-domain.example.com/api`.

If the workflow fails, first check:

- the self-hosted runner is online
- `DEPLOY_PATH` exists and is writable
- the runner user can run `docker` and `docker compose`
- `PROD_ENV_FILE` has valid production values

## 11. Local Docker run

For a local production-like run:

```powershell
Copy-Item .env.production.example .env.production
docker compose up --build
```

The app will be on `http://localhost:3000`.
