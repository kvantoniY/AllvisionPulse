# Allvision Pulse — alpha deploy to one Yandex Cloud VM

This setup is intentionally minimal and cheap:
- one VM
- one public IP
- Docker Compose
- PostgreSQL on the same VM
- uploads stored in a Docker volume on the same VM
- auto deploy from the `dev` branch through GitHub Actions

## 1. What you get
- public URL by IP: `http://YOUR_SERVER_IP`
- frontend, backend, nginx and postgres in Docker
- persistent DB volume
- persistent uploads volume
- auto rebuild and restart on each push to `dev`

## 2. Important alpha limitations
- plain HTTP by IP, no HTTPS yet
- cookies are intentionally non-secure for this alpha stand (`AUTH_COOKIE_SECURE=false`)
- uploaded media is stored on the VM, not in Object Storage yet
- this stand is for the team and internal testing, not for public production

## 3. Create a VM in Yandex Cloud
Recommended for alpha:
- Ubuntu 22.04 or 24.04
- 2 vCPU / 4 GB RAM
- 30 GB network SSD or HDD
- one public IPv4

Open inbound ports in the security group:
- TCP 22 for SSH
- TCP 80 for the app

## 4. Prepare SSH locally
Generate a key on your local machine if you do not already have one:

```bash
ssh-keygen -t ed25519 -C "allvision-alpha"
```

## 5. Connect to the VM and install Docker
SSH into the VM:

```bash
ssh ubuntu@YOUR_SERVER_IP
```

Install Docker and Compose plugin:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

After that reconnect to SSH so your user gets Docker access.

## 6. Create project folder on the server

```bash
mkdir -p /opt/allvision-pulse/current/infra/alpha
```

## 7. Put the alpha env file on the server
On the server create:

`/opt/allvision-pulse/current/infra/alpha/.env`

Use this template:

```env
PUBLIC_APP_URL=http://YOUR_SERVER_IP
AUTH_COOKIE_SECURE=false

NODE_ENV=production
BACKEND_PORT=4000
CORS_ORIGIN=http://YOUR_SERVER_IP
UPLOAD_DIR=uploads
JWT_ACCESS_SECRET=replace_with_long_random_access_secret
JWT_REFRESH_SECRET=replace_with_long_random_refresh_secret
ACCESS_TTL_MIN=15
REFRESH_TTL_DAYS=30
SOCKET_RECOVERY_MS=60000
CALL_RECONNECT_GRACE_MS=60000
CALL_MAX_PARTICIPANTS=4

FRONTEND_PORT=3000

POSTGRES_DB=allvision_pulse
POSTGRES_USER=allvision
POSTGRES_PASSWORD=replace_with_long_random_db_password
DATABASE_URL=postgresql://allvision:replace_with_long_random_db_password@postgres:5432/allvision_pulse?schema=public
```

Generate strong secrets locally, for example:

```bash
openssl rand -hex 32
```

## 8. Add GitHub repository secrets
In GitHub:
`Settings -> Secrets and variables -> Actions -> New repository secret`

Create these secrets:
- `ALPHA_HOST` = your VM public IP
- `ALPHA_USER` = your SSH user, for example `ubuntu`
- `ALPHA_SSH_PRIVATE_KEY` = the full private SSH key contents

## 9. First deploy
Push the new deployment files to `dev`.
The workflow `.github/workflows/deploy-dev-alpha.yml` will:
- archive the repo
- upload it to the VM over SSH
- replace `/opt/allvision-pulse/current`
- run Docker Compose build and restart

## 10. Check status on the server

```bash
cd /opt/allvision-pulse/current

docker compose \
  --project-name allvision-alpha \
  --env-file infra/alpha/.env \
  -f infra/alpha/docker-compose.alpha.yml \
  ps
```

See logs:

```bash
docker compose \
  --project-name allvision-alpha \
  --env-file infra/alpha/.env \
  -f infra/alpha/docker-compose.alpha.yml \
  logs -f --tail=200
```

## 11. Open the app
Use:

```text
http://YOUR_SERVER_IP
```

## 12. What changes were made in code for alpha
- backend CORS now reads `CORS_ORIGIN` instead of hardcoded localhost
- frontend auth cookies now support `AUTH_COOKIE_SECURE=false` for HTTP/IP alpha stands
- nginx proxies public traffic to frontend and websocket traffic to backend
- backend runs `prisma migrate deploy` on container start

## 13. Recommended next step after alpha
When the team confirms the alpha stand works:
- move uploads from the VM volume to Yandex Object Storage
- add a real domain
- enable HTTPS
- create a separate staging and production environment
