#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

RELEASE_SHA="${1:-}"
OUTPUT_ARCHIVE="${2:-}"

if [ -z "${RELEASE_SHA}" ] || [ -z "${OUTPUT_ARCHIVE}" ]; then
  echo "Usage: bash infra/alpha/scripts/build-release.sh <release_sha> <output_archive>" >&2
  exit 1
fi

FRONTEND_DIR="${ROOT_DIR}/frontend"
PACKAGE_DIR="/tmp/allvision-alpha-package-${RELEASE_SHA}"

log() {
  printf '=== %s ===\n' "$*"
}

assert_file() {
  local path="$1"
  if [ ! -e "${path}" ]; then
    echo "Required file is missing: ${path}" >&2
    exit 1
  fi
}

assert_archive_entry() {
  local archive_path="$1"
  local entry_path="$2"

  if ! tar -tzf "${archive_path}" | grep -Eq "^(\./)?${entry_path}$"; then
    echo "Required archive entry is missing: ${entry_path}" >&2
    exit 1
  fi
}

log "Validate deployment scripts"
bash -n "${ROOT_DIR}/infra/alpha/scripts/build-release.sh"
bash -n "${ROOT_DIR}/infra/alpha/scripts/deploy-release.sh"
bash -n "${ROOT_DIR}/infra/alpha/scripts/collect-runtime-diagnostics.sh"
bash -n "${ROOT_DIR}/infra/alpha/scripts/verify-public-release.sh"

log "Build frontend release bundle"
export NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-https://allvision-pulse.ru}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://allvision-pulse.ru}"
export PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://allvision-pulse.ru}"
export AUTH_COOKIE_SECURE="${AUTH_COOKIE_SECURE:-true}"
export AUTH_COOKIE_DOMAIN="${AUTH_COOKIE_DOMAIN:-.allvision-pulse.ru}"
export ACCESS_TTL_MIN="${ACCESS_TTL_MIN:-15}"
export REFRESH_TTL_DAYS="${REFRESH_TTL_DAYS:-30}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
export NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org/}"

cd "${FRONTEND_DIR}"
rm -rf .next
npm ci --no-audit --no-fund
assert_file "${FRONTEND_DIR}/node_modules/next/dist/bin/next"
npm run build

assert_file "${FRONTEND_DIR}/.next/standalone/server.js"
assert_file "${FRONTEND_DIR}/.next/static"
assert_file "${FRONTEND_DIR}/public/sw.js"
assert_file "${FRONTEND_DIR}/public/brand-eye-180.png"
assert_file "${FRONTEND_DIR}/public/brand-eye-192.png"
assert_file "${FRONTEND_DIR}/public/brand-eye-32.png"
assert_file "${FRONTEND_DIR}/public/brand-eye-512.png"

log "Package release archive"
rm -rf "${PACKAGE_DIR}"
rm -f "${OUTPUT_ARCHIVE}"
mkdir -p "${PACKAGE_DIR}"

cd "${ROOT_DIR}"
git archive --format=tar HEAD | tar -xf - -C "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/frontend"
cp -R "${FRONTEND_DIR}/.next" "${PACKAGE_DIR}/frontend/.next"

tar -czf "${OUTPUT_ARCHIVE}" -C "${PACKAGE_DIR}" .
assert_archive_entry "${OUTPUT_ARCHIVE}" 'frontend/.next/standalone/server.js'
assert_archive_entry "${OUTPUT_ARCHIVE}" 'infra/alpha/docker-compose.alpha.yml'
assert_archive_entry "${OUTPUT_ARCHIVE}" 'infra/alpha/scripts/deploy-release.sh'

log "Release archive ready"
printf '%s\n' "${OUTPUT_ARCHIVE}"
