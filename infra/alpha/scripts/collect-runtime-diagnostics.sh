#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/allvision-pulse}"
PROJECT_NAME="${PROJECT_NAME:-allvision-alpha}"
CURRENT_PATH="${APP_ROOT}/current"
RELEASES_DIR="${APP_ROOT}/releases"

resolve_release_path() {
  local candidate="$1"
  if [ -L "${candidate}" ] || [ -d "${candidate}" ]; then
    readlink -f "${candidate}"
  fi
}

compose_in_release() {
  local release_dir="$1"
  shift

  (
    cd "${release_dir}"
    docker compose \
      --project-name "${PROJECT_NAME}" \
      --env-file infra/alpha/.env \
      -f infra/alpha/docker-compose.alpha.yml \
      "$@"
  )
}

CURRENT_RELEASE_DIR="$(resolve_release_path "${CURRENT_PATH}" || true)"
if [ -z "${CURRENT_RELEASE_DIR}" ] && [ -d "${RELEASES_DIR}" ]; then
  CURRENT_RELEASE_DIR="$(find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
fi

if [ -z "${CURRENT_RELEASE_DIR}" ] || [ ! -d "${CURRENT_RELEASE_DIR}" ]; then
  exit 0
fi

echo "=== diagnostics release ==="
echo "${CURRENT_RELEASE_DIR}"
echo

echo "=== docker compose ps ==="
compose_in_release "${CURRENT_RELEASE_DIR}" ps || true
echo

echo "=== backend logs ==="
compose_in_release "${CURRENT_RELEASE_DIR}" logs backend --tail=300 || true
echo

echo "=== postgres logs ==="
compose_in_release "${CURRENT_RELEASE_DIR}" logs postgres --tail=120 || true
echo

echo "=== frontend logs ==="
compose_in_release "${CURRENT_RELEASE_DIR}" logs frontend --tail=120 || true
echo

echo "=== nginx logs ==="
compose_in_release "${CURRENT_RELEASE_DIR}" logs nginx --tail=120 || true
echo

echo "=== turn logs ==="
compose_in_release "${CURRENT_RELEASE_DIR}" logs turn --tail=120 || true
echo

echo "=== nginx rendered config ==="
NGINX_ID="$(compose_in_release "${CURRENT_RELEASE_DIR}" ps -q nginx)"
if [ -n "${NGINX_ID}" ]; then
  docker exec "${NGINX_ID}" nginx -T 2>/dev/null | sed -n "1,220p"
fi
echo

echo "=== docker inspect health ==="
for service in backend frontend nginx; do
  CID="$(compose_in_release "${CURRENT_RELEASE_DIR}" ps -q "${service}")"
  if [ -n "${CID}" ]; then
    echo "--- ${service} ---"
    docker inspect --format '{{json .State.Health}}' "${CID}" 2>/dev/null || true
  fi
done
