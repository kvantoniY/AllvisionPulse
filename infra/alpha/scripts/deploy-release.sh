#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_RELEASE_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

PROJECT_NAME="${PROJECT_NAME:-allvision-alpha}"
APP_ROOT="${APP_ROOT:-/opt/allvision-pulse}"
RELEASE_SHA="${RELEASE_SHA:-}"
ALPHA_HOST="${ALPHA_HOST:-}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://allvision-pulse.ru}"
AUTH_COOKIE_SECURE="${AUTH_COOKIE_SECURE:-true}"
AUTH_COOKIE_DOMAIN="${AUTH_COOKIE_DOMAIN:-.allvision-pulse.ru}"
TURN_HOST="${TURN_HOST:-turn.allvision-pulse.ru}"
TURN_PORT="${TURN_PORT:-3478}"
TURN_MIN_PORT="${TURN_MIN_PORT:-49152}"
TURN_MAX_PORT="${TURN_MAX_PORT:-49252}"
TURN_TTL_SEC="${TURN_TTL_SEC:-43200}"
GENERATED_WEB_PUSH_VAPID_PUBLIC_KEY="${GENERATED_WEB_PUSH_VAPID_PUBLIC_KEY:-}"
GENERATED_WEB_PUSH_VAPID_PRIVATE_KEY="${GENERATED_WEB_PUSH_VAPID_PRIVATE_KEY:-}"

if [ -z "${RELEASE_SHA}" ]; then
  echo "RELEASE_SHA is required" >&2
  exit 1
fi

RELEASES_DIR="${APP_ROOT}/releases"
SHARED_DIR="${APP_ROOT}/shared"
SHARED_ENV_FILE="${SHARED_DIR}/infra/alpha/.env"
CURRENT_PATH="${APP_ROOT}/current"
PREVIOUS_PATH="${APP_ROOT}/previous"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_SHA}"
RELEASE_ENV_FILE="${RELEASE_DIR}/infra/alpha/.env"

log() {
  printf '=== %s ===\n' "$*"
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is missing: ${command_name}" >&2
    exit 1
  fi
}

assert_path_exists() {
  local path="$1"
  if [ ! -e "${path}" ]; then
    echo "Required path is missing: ${path}" >&2
    exit 1
  fi
}

resolve_path() {
  local path="$1"
  if [ -L "${path}" ] || [ -d "${path}" ]; then
    readlink -f "${path}"
  fi
}

get_env_value() {
  local key="$1"
  local file="$2"
  awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "${file}"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp_file

  tmp_file="$(mktemp)"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { updated = 0 }
    $0 ~ ("^" key "=") {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "${file}" > "${tmp_file}"
  mv "${tmp_file}" "${file}"
}

set_env_if_missing() {
  local key="$1"
  local value="$2"
  local file="$3"
  local current_value

  current_value="$(get_env_value "${key}" "${file}" || true)"
  if [ -z "${current_value}" ]; then
    set_env_value "${key}" "${value}" "${file}"
  fi
}

trim_value() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

csv_contains() {
  local csv_value="$1"
  local expected="$2"
  local item

  IFS=',' read -r -a items <<< "${csv_value}"
  for item in "${items[@]}"; do
    if [ "$(trim_value "${item}")" = "${expected}" ]; then
      return 0
    fi
  done

  return 1
}

append_csv_env_unique() {
  local key="$1"
  local value="$2"
  local file="$3"
  local current_value

  if [ -z "${value}" ]; then
    return 0
  fi

  current_value="$(get_env_value "${key}" "${file}" || true)"
  if csv_contains "${current_value}" "${value}"; then
    return 0
  fi

  if [ -n "${current_value}" ]; then
    set_env_value "${key}" "${current_value},${value}" "${file}"
  else
    set_env_value "${key}" "${value}" "${file}"
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

wait_for_service() {
  local release_dir="$1"
  local service="$2"
  local timeout_sec="${3:-240}"
  local elapsed=0
  local container_id
  local status

  container_id="$(compose_in_release "${release_dir}" ps -q "${service}")"
  if [ -z "${container_id}" ]; then
    echo "Service ${service} container was not created" >&2
    return 1
  fi

  while [ "${elapsed}" -lt "${timeout_sec}" ]; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
    if [ "${status}" = "healthy" ] || [ "${status}" = "running" ]; then
      return 0
    fi
    if [ "${status}" = "unhealthy" ] || [ "${status}" = "dead" ] || [ "${status}" = "exited" ]; then
      echo "Service ${service} entered bad state: ${status}" >&2
      return 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  echo "Timed out waiting for ${service} to become healthy" >&2
  return 1
}

verify_release_sha() {
  local release_dir="$1"
  local service="$2"
  local expected_sha="$3"
  local container_id
  local actual_sha

  container_id="$(compose_in_release "${release_dir}" ps -q "${service}")"
  if [ -z "${container_id}" ]; then
    echo "Service ${service} container is missing during release verification" >&2
    return 1
  fi

  actual_sha="$(docker inspect --format '{{ index .Config.Labels "org.allvision.release-sha" }}' "${container_id}" 2>/dev/null || true)"
  if [ "${actual_sha}" != "${expected_sha}" ]; then
    echo "Service ${service} release mismatch: expected ${expected_sha}, got ${actual_sha:-<empty>}" >&2
    return 1
  fi

  printf 'Verified %s release SHA: %s\n' "${service}" "${actual_sha}"
}

service_container_name() {
  case "$1" in
    backend) printf '%s\n' 'allvision-alpha-backend' ;;
    frontend) printf '%s\n' 'allvision-alpha-frontend' ;;
    nginx) printf '%s\n' 'allvision-alpha-nginx' ;;
    turn) printf '%s\n' 'allvision-alpha-turn' ;;
    postgres) printf '%s\n' 'allvision-alpha-postgres' ;;
    *) return 1 ;;
  esac
}

recreate_service() {
  local release_dir="$1"
  local service="$2"
  local container_name

  if compose_in_release "${release_dir}" up -d --force-recreate --remove-orphans "${service}"; then
    return 0
  fi

  container_name="$(service_container_name "${service}" || true)"
  if [ -n "${container_name}" ] && docker ps -a --format '{{.Names}}' | grep -qx "${container_name}"; then
    log "Retry ${service} after clearing stale container"
    docker rm -f "${container_name}" || true
  fi

  compose_in_release "${release_dir}" up -d --force-recreate --remove-orphans "${service}"
}

frontend_release_check() {
  local release_dir="$1"
  local expected_sha="$2"

  compose_in_release "${release_dir}" exec -T frontend node -e "fetch('http://127.0.0.1:3000/api/release?ts=' + encodeURIComponent(process.env.APP_RELEASE_SHA || 'missing')).then(async (response) => { const text = await response.text(); if (!response.ok) { console.error(text); process.exit(1); } process.stdout.write(text); }).catch((error) => { console.error(error); process.exit(1); });" | tee /tmp/allvision-frontend-release.json
  grep -q "${expected_sha}" /tmp/allvision-frontend-release.json
}

socket_polling_check() {
  local release_dir="$1"
  local token

  token="$(compose_in_release "${release_dir}" exec -T backend node -e "const jwt=require('jsonwebtoken'); process.stdout.write(jwt.sign({ sub: 'healthcheck-socket', role: 'USER' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '2m' }));")"
  curl --retry 15 --retry-delay 2 --retry-all-errors -fsS \
    -H "Authorization: Bearer ${token}" \
    "http://127.0.0.1/socket.io?EIO=4&transport=polling" | grep -q '"sid"'
}

failed_release_diagnostics() {
  local release_dir="$1"

  log "Failed release diagnostics"
  compose_in_release "${release_dir}" ps || true
  printf '\n'
  compose_in_release "${release_dir}" logs backend --tail=300 || true
  printf '\n'
  compose_in_release "${release_dir}" logs postgres --tail=120 || true
  printf '\n'
  compose_in_release "${release_dir}" logs frontend --tail=120 || true
  printf '\n'
  compose_in_release "${release_dir}" logs nginx --tail=120 || true
  printf '\n'
  compose_in_release "${release_dir}" logs turn --tail=120 || true
}

rollback_previous_release() {
  local previous_release_dir="$1"

  if [ -z "${previous_release_dir}" ] || [ ! -d "${previous_release_dir}" ]; then
    return 0
  fi

  log "Rollback to previous release"
  compose_in_release "${previous_release_dir}" up -d --build --force-recreate --remove-orphans postgres turn backend frontend nginx || true
}

fail_release() {
  local message="$1"

  echo "${message}" >&2
  failed_release_diagnostics "${RELEASE_DIR}" || true
  rollback_previous_release "${CURRENT_RELEASE_DIR:-}" || true
  exit 1
}

replace_with_symlink() {
  local link_path="$1"
  local target_path="$2"

  if [ -L "${link_path}" ]; then
    rm -f "${link_path}"
  elif [ -e "${link_path}" ]; then
    rm -rf "${link_path}"
  fi

  ln -s "${target_path}" "${link_path}"
}

archive_legacy_current_dir() {
  local current_real_dir="$1"
  local legacy_dir

  legacy_dir="${RELEASES_DIR}/legacy-$(date +%Y%m%d%H%M%S)"

  if [ "${current_real_dir}" != "${CURRENT_PATH}" ]; then
    printf '%s\n' "${current_real_dir}"
    return 0
  fi

  mv "${CURRENT_PATH}" "${legacy_dir}"
  printf '%s\n' "${legacy_dir}"
}

cleanup_old_releases() {
  local keep_current
  local keep_previous
  local removable=()
  local path

  keep_current="$(resolve_path "${CURRENT_PATH}" || true)"
  keep_previous="$(resolve_path "${PREVIOUS_PATH}" || true)"

  mapfile -t release_paths < <(find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort)
  for path in "${release_paths[@]}"; do
    if [ "${path}" = "${keep_current}" ] || [ "${path}" = "${keep_previous}" ]; then
      continue
    fi
    removable+=("${path}")
  done

  while [ "${#removable[@]}" -gt 5 ]; do
    rm -rf "${removable[0]}"
    removable=("${removable[@]:1}")
  done
}

log "Check remote prerequisites"
require_command docker
require_command curl
require_command awk
require_command sed
require_command grep
require_command tar
require_command openssl
docker compose version >/dev/null

CURRENT_RELEASE_DIR="$(resolve_path "${CURRENT_PATH}" || true)"

log "Stage release files"
mkdir -p "${RELEASES_DIR}" "${SHARED_DIR}/infra/alpha"
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"
cp -a "${SOURCE_RELEASE_DIR}/." "${RELEASE_DIR}/"

assert_path_exists "${RELEASE_DIR}/backend/Dockerfile.alpha"
assert_path_exists "${RELEASE_DIR}/frontend/Dockerfile.alpha"
assert_path_exists "${RELEASE_DIR}/frontend/.next/standalone/server.js"
assert_path_exists "${RELEASE_DIR}/frontend/public/sw.js"
assert_path_exists "${RELEASE_DIR}/infra/alpha/docker-compose.alpha.yml"
assert_path_exists "${RELEASE_DIR}/infra/alpha/nginx.alpha.conf"

log "Hydrate environment"
if [ ! -f "${SHARED_ENV_FILE}" ]; then
  if [ -n "${CURRENT_RELEASE_DIR}" ] && [ -f "${CURRENT_RELEASE_DIR}/infra/alpha/.env" ]; then
    cp "${CURRENT_RELEASE_DIR}/infra/alpha/.env" "${SHARED_ENV_FILE}"
  else
    cp "${RELEASE_DIR}/infra/alpha/.env.example" "${SHARED_ENV_FILE}"
  fi
fi

cp "${SHARED_ENV_FILE}" "${RELEASE_ENV_FILE}"

set_env_value RELEASE_SHA "${RELEASE_SHA}" "${RELEASE_ENV_FILE}"
set_env_if_missing PUBLIC_APP_URL "${PUBLIC_APP_URL}" "${RELEASE_ENV_FILE}"
set_env_if_missing AUTH_COOKIE_SECURE "${AUTH_COOKIE_SECURE}" "${RELEASE_ENV_FILE}"
set_env_if_missing AUTH_COOKIE_DOMAIN "${AUTH_COOKIE_DOMAIN}" "${RELEASE_ENV_FILE}"
set_env_if_missing TURN_HOST "${TURN_HOST}" "${RELEASE_ENV_FILE}"
set_env_if_missing TURN_PORT "${TURN_PORT}" "${RELEASE_ENV_FILE}"
set_env_if_missing TURN_MIN_PORT "${TURN_MIN_PORT}" "${RELEASE_ENV_FILE}"
set_env_if_missing TURN_MAX_PORT "${TURN_MAX_PORT}" "${RELEASE_ENV_FILE}"
set_env_if_missing TURN_TTL_SEC "${TURN_TTL_SEC}" "${RELEASE_ENV_FILE}"
set_env_if_missing WEB_PUSH_VAPID_SUBJECT "mailto:notify@allvision-pulse.ru" "${RELEASE_ENV_FILE}"

append_csv_env_unique CORS_ORIGIN "http://allvision-pulse.ru" "${RELEASE_ENV_FILE}"
append_csv_env_unique CORS_ORIGIN "http://www.allvision-pulse.ru" "${RELEASE_ENV_FILE}"
append_csv_env_unique CORS_ORIGIN "https://allvision-pulse.ru" "${RELEASE_ENV_FILE}"
append_csv_env_unique CORS_ORIGIN "https://www.allvision-pulse.ru" "${RELEASE_ENV_FILE}"
if [ -n "${ALPHA_HOST}" ]; then
  append_csv_env_unique CORS_ORIGIN "http://${ALPHA_HOST}" "${RELEASE_ENV_FILE}"
  append_csv_env_unique CORS_ORIGIN "https://${ALPHA_HOST}" "${RELEASE_ENV_FILE}"
fi

if [ -z "$(get_env_value TURN_EXTERNAL_IP "${RELEASE_ENV_FILE}" || true)" ]; then
  TURN_EXTERNAL_IP="$({ getent ahostsv4 "$(get_env_value TURN_HOST "${RELEASE_ENV_FILE}")" 2>/dev/null || true; } | awk 'NR == 1 { print $1 }')"
  if [ -z "${TURN_EXTERNAL_IP}" ] && [ -n "${ALPHA_HOST}" ]; then
    TURN_EXTERNAL_IP="$({ getent ahostsv4 "${ALPHA_HOST}" 2>/dev/null || true; } | awk 'NR == 1 { print $1 }')"
  fi
  if [ -z "${TURN_EXTERNAL_IP}" ] && [ -n "${ALPHA_HOST}" ]; then
    TURN_EXTERNAL_IP="${ALPHA_HOST}"
  fi
  if [ -n "${TURN_EXTERNAL_IP}" ]; then
    set_env_value TURN_EXTERNAL_IP "${TURN_EXTERNAL_IP}" "${RELEASE_ENV_FILE}"
  fi
fi

if [ -z "$(get_env_value TURN_SECRET "${RELEASE_ENV_FILE}" || true)" ]; then
  set_env_value TURN_SECRET "$(openssl rand -hex 32)" "${RELEASE_ENV_FILE}"
fi

if [ -z "$(get_env_value WEB_PUSH_VAPID_PUBLIC_KEY "${RELEASE_ENV_FILE}" || true)" ]; then
  set_env_value WEB_PUSH_VAPID_PUBLIC_KEY "${GENERATED_WEB_PUSH_VAPID_PUBLIC_KEY}" "${RELEASE_ENV_FILE}"
fi

if [ -z "$(get_env_value WEB_PUSH_VAPID_PRIVATE_KEY "${RELEASE_ENV_FILE}" || true)" ]; then
  set_env_value WEB_PUSH_VAPID_PRIVATE_KEY "${GENERATED_WEB_PUSH_VAPID_PRIVATE_KEY}" "${RELEASE_ENV_FILE}"
fi

if [ -z "$(get_env_value WEB_PUSH_VAPID_PUBLIC_KEY "${RELEASE_ENV_FILE}" || true)" ] || [ -z "$(get_env_value WEB_PUSH_VAPID_PRIVATE_KEY "${RELEASE_ENV_FILE}" || true)" ]; then
  fail_release "WEB_PUSH_VAPID keys are empty after hydration"
fi

if grep -n 'replace_with_' "${RELEASE_ENV_FILE}" >/dev/null 2>&1; then
  fail_release "Shared alpha env still contains placeholder values. Fill the real secrets on the host before deploying."
fi

cp "${RELEASE_ENV_FILE}" "${SHARED_ENV_FILE}"

log "Validate rendered compose config"
compose_in_release "${RELEASE_DIR}" config >/dev/null || fail_release "docker compose config validation failed"

log "Pull base runtime images"
compose_in_release "${RELEASE_DIR}" pull postgres turn nginx || fail_release "Failed to pull runtime images"

log "Build backend image"
compose_in_release "${RELEASE_DIR}" build --pull backend || fail_release "Failed to build backend image"

log "Build frontend image"
compose_in_release "${RELEASE_DIR}" build --pull frontend || fail_release "Failed to build frontend image"

log "Start postgres"
recreate_service "${RELEASE_DIR}" postgres || fail_release "Failed to start postgres"
wait_for_service "${RELEASE_DIR}" postgres 180 || fail_release "Postgres did not become healthy"

log "Start turn"
recreate_service "${RELEASE_DIR}" turn || fail_release "Failed to start turn"
wait_for_service "${RELEASE_DIR}" turn 90 || fail_release "Turn container did not enter running state"

log "Run prisma migrations"
compose_in_release "${RELEASE_DIR}" run --rm --no-deps backend sh -lc "npx prisma migrate deploy --schema prisma/schema.prisma" || fail_release "Prisma migrate deploy failed"

log "Start backend"
recreate_service "${RELEASE_DIR}" backend || fail_release "Failed to start backend"
wait_for_service "${RELEASE_DIR}" backend 240 || fail_release "Backend did not become healthy"
verify_release_sha "${RELEASE_DIR}" backend "${RELEASE_SHA}" || fail_release "Backend release SHA verification failed"

log "Start frontend"
recreate_service "${RELEASE_DIR}" frontend || fail_release "Failed to start frontend"
wait_for_service "${RELEASE_DIR}" frontend 240 || fail_release "Frontend did not become healthy"
verify_release_sha "${RELEASE_DIR}" frontend "${RELEASE_SHA}" || fail_release "Frontend release SHA verification failed"
frontend_release_check "${RELEASE_DIR}" "${RELEASE_SHA}" || fail_release "Frontend container does not serve the expected release"

log "Check frontend public assets"
compose_in_release "${RELEASE_DIR}" exec -T frontend sh -lc "test -f /app/public/sw.js && test -f /app/public/brand-eye-180.png && test -f /app/public/brand-eye-192.png && test -f /app/public/brand-eye-32.png && test -f /app/public/brand-eye-512.png" || fail_release "Frontend public asset check failed"

log "Start nginx"
recreate_service "${RELEASE_DIR}" nginx || fail_release "Failed to start nginx"
wait_for_service "${RELEASE_DIR}" nginx 180 || fail_release "Nginx did not become healthy"
verify_release_sha "${RELEASE_DIR}" nginx "${RELEASE_SHA}" || fail_release "Nginx release SHA verification failed"

log "Verify localhost release"
curl --retry 15 --retry-delay 2 --retry-all-errors -fsS http://127.0.0.1/healthz >/dev/null || fail_release "Local nginx health check failed"
curl --retry 15 --retry-delay 2 --retry-all-errors -H "Cache-Control: no-cache, no-store" -fsS "http://127.0.0.1/api/release?ts=${RELEASE_SHA}" | tee /tmp/allvision-release.json >/dev/null || fail_release "Local release endpoint is unavailable"
grep -q "${RELEASE_SHA}" /tmp/allvision-release.json || fail_release "Local release endpoint serves an unexpected release"
curl --retry 15 --retry-delay 2 --retry-all-errors -fsS "http://127.0.0.1/sw.js?ts=${RELEASE_SHA}" >/dev/null || fail_release "Local sw.js check failed"
curl --retry 15 --retry-delay 2 --retry-all-errors -fsS "http://127.0.0.1/brand-eye-180.png?ts=${RELEASE_SHA}" >/dev/null || fail_release "Local brand-eye-180.png check failed"
curl --retry 15 --retry-delay 2 --retry-all-errors -fsS "http://127.0.0.1/brand-eye-192.png?ts=${RELEASE_SHA}" >/dev/null || fail_release "Local brand-eye-192.png check failed"
socket_polling_check "${RELEASE_DIR}" || fail_release "Socket.io polling check failed"

log "Update release pointers"
if [ -n "${CURRENT_RELEASE_DIR}" ] && [ "${CURRENT_RELEASE_DIR}" != "${RELEASE_DIR}" ]; then
  if [ -d "${CURRENT_PATH}" ] && [ ! -L "${CURRENT_PATH}" ]; then
    CURRENT_RELEASE_DIR="$(archive_legacy_current_dir "${CURRENT_RELEASE_DIR}")"
  fi

  if [ -e "${PREVIOUS_PATH}" ] && [ ! -L "${PREVIOUS_PATH}" ]; then
    rm -rf "${PREVIOUS_PATH}"
  fi
  replace_with_symlink "${PREVIOUS_PATH}" "${CURRENT_RELEASE_DIR}"
fi

replace_with_symlink "${CURRENT_PATH}" "${RELEASE_DIR}"

log "Current public env"
grep -E '^(RELEASE_SHA|CORS_ORIGIN|PUBLIC_APP_URL|AUTH_COOKIE_SECURE|AUTH_COOKIE_DOMAIN|TURN_HOST|TURN_PORT|TURN_MIN_PORT|TURN_MAX_PORT|TURN_TTL_SEC|TURN_EXTERNAL_IP|WEB_PUSH_VAPID_SUBJECT|WEB_PUSH_VAPID_PUBLIC_KEY)=' "${RELEASE_ENV_FILE}" || true

log "Runtime container timestamps"
docker inspect allvision-alpha-backend --format 'backend created={{.Created}} image={{.Image}}' || true
docker inspect allvision-alpha-frontend --format 'frontend created={{.Created}} image={{.Image}}' || true
docker inspect allvision-alpha-nginx --format 'nginx created={{.Created}} image={{.Image}}' || true

log "Cleanup old releases"
cleanup_old_releases
docker image prune -af --filter "until=168h" || true

log "Deployed release"
printf 'RELEASE_SHA=%s\n' "${RELEASE_SHA}"
