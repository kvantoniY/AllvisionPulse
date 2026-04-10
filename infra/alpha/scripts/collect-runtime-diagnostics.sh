#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/allvision-pulse}"
PROJECT_NAME="${PROJECT_NAME:-allvision-alpha}"
CURRENT_PATH="${APP_ROOT}/current"
PREVIOUS_PATH="${APP_ROOT}/previous"
RELEASES_DIR="${APP_ROOT}/releases"
REQUESTED_RELEASE_SHA="${RELEASE_SHA:-}"
REQUESTED_RELEASE_DIR="${RELEASE_DIR:-}"

resolve_release_path() {
  local candidate="$1"
  if [ -L "${candidate}" ] || [ -d "${candidate}" ]; then
    readlink -f "${candidate}"
  fi
}

read_release_sha() {
  local release_dir="$1"
  local env_file="${release_dir}/infra/alpha/.env"

  if [ ! -f "${env_file}" ]; then
    return 0
  fi

  awk -F= '$1 == "RELEASE_SHA" { sub(/^[^=]*=/, ""); print; exit }' "${env_file}"
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
PREVIOUS_RELEASE_DIR="$(resolve_release_path "${PREVIOUS_PATH}" || true)"
LATEST_RELEASE_DIR=""

if [ -d "${RELEASES_DIR}" ]; then
  LATEST_RELEASE_DIR="$(ls -1dt "${RELEASES_DIR}"/* 2>/dev/null | head -n 1 || true)"
fi

if [ -n "${REQUESTED_RELEASE_DIR}" ] && [ ! -d "${REQUESTED_RELEASE_DIR}" ]; then
  REQUESTED_RELEASE_DIR=""
fi

if [ -z "${REQUESTED_RELEASE_DIR}" ] && [ -n "${REQUESTED_RELEASE_SHA}" ] && [ -d "${RELEASES_DIR}/${REQUESTED_RELEASE_SHA}" ]; then
  REQUESTED_RELEASE_DIR="${RELEASES_DIR}/${REQUESTED_RELEASE_SHA}"
fi

TARGET_RELEASE_DIR="${REQUESTED_RELEASE_DIR:-${CURRENT_RELEASE_DIR}}"
if [ -z "${TARGET_RELEASE_DIR}" ]; then
  TARGET_RELEASE_DIR="${LATEST_RELEASE_DIR}"
fi

if [ -z "${TARGET_RELEASE_DIR}" ] || [ ! -d "${TARGET_RELEASE_DIR}" ]; then
  exit 0
fi

echo "=== release pointers ==="
echo "requested_sha=${REQUESTED_RELEASE_SHA:-<empty>}"
echo "requested_dir=${REQUESTED_RELEASE_DIR:-<missing>}"
echo "current=${CURRENT_RELEASE_DIR:-<missing>} sha=$(read_release_sha "${CURRENT_RELEASE_DIR:-/nonexistent}" || true)"
echo "previous=${PREVIOUS_RELEASE_DIR:-<missing>} sha=$(read_release_sha "${PREVIOUS_RELEASE_DIR:-/nonexistent}" || true)"
echo "latest=${LATEST_RELEASE_DIR:-<missing>} sha=$(read_release_sha "${LATEST_RELEASE_DIR:-/nonexistent}" || true)"
echo "target=${TARGET_RELEASE_DIR}"
echo

echo "=== diagnostics release ==="
echo "${TARGET_RELEASE_DIR}"
echo

echo "=== docker compose ps ==="
compose_in_release "${TARGET_RELEASE_DIR}" ps || true
echo

echo "=== backend logs ==="
compose_in_release "${TARGET_RELEASE_DIR}" logs backend --tail=300 || true
echo

echo "=== postgres logs ==="
compose_in_release "${TARGET_RELEASE_DIR}" logs postgres --tail=120 || true
echo

echo "=== frontend logs ==="
compose_in_release "${TARGET_RELEASE_DIR}" logs frontend --tail=120 || true
echo

echo "=== nginx logs ==="
compose_in_release "${TARGET_RELEASE_DIR}" logs nginx --tail=120 || true
echo

echo "=== turn logs ==="
compose_in_release "${TARGET_RELEASE_DIR}" logs turn --tail=120 || true
echo

echo "=== nginx rendered config ==="
NGINX_ID="$(compose_in_release "${TARGET_RELEASE_DIR}" ps -q nginx)"
if [ -n "${NGINX_ID}" ]; then
  docker exec "${NGINX_ID}" nginx -T 2>/dev/null | sed -n "1,220p"
fi
echo

echo "=== docker inspect health ==="
for service in backend frontend nginx; do
  CID="$(compose_in_release "${TARGET_RELEASE_DIR}" ps -q "${service}")"
  if [ -n "${CID}" ]; then
    echo "--- ${service} ---"
    docker inspect --format '{{json .State.Health}}' "${CID}" 2>/dev/null || true
  fi
done
echo

echo "=== docker inspect labels ==="
for service in backend frontend nginx; do
  CID="$(compose_in_release "${TARGET_RELEASE_DIR}" ps -q "${service}")"
  if [ -n "${CID}" ]; then
    echo "--- ${service} ---"
    docker inspect --format '{{ index .Config.Labels "org.allvision.release-sha" }}' "${CID}" 2>/dev/null || true
  fi
done
