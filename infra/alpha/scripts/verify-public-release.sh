#!/usr/bin/env bash

set -euo pipefail

EXPECTED_RELEASE_SHA="${1:-}"
BASE_URL="${2:-https://allvision-pulse.ru}"
VERIFY_ATTEMPTS="${VERIFY_ATTEMPTS:-20}"
VERIFY_DELAY_SEC="${VERIFY_DELAY_SEC:-6}"

if [ -z "${EXPECTED_RELEASE_SHA}" ]; then
  echo "Usage: bash infra/alpha/scripts/verify-public-release.sh <expected_release_sha> [base_url]" >&2
  exit 1
fi

TLS_WARNING_EMITTED=0

for attempt in $(seq 1 "${VERIFY_ATTEMPTS}"); do
  RESPONSE=""
  CURL_EXIT=0

  set +e
  RESPONSE="$(curl --retry 3 --retry-delay 2 --retry-all-errors -H 'Cache-Control: no-cache, no-store' -fsS "${BASE_URL}/api/release?ts=${EXPECTED_RELEASE_SHA}" 2>/tmp/public-release-curl.err)"
  CURL_EXIT=$?
  set -e

  if [ "${CURL_EXIT}" = "60" ]; then
    if [ "${TLS_WARNING_EMITTED}" = "0" ]; then
      echo "::warning::Strict TLS verification for ${BASE_URL} failed on the GitHub runner (curl exit 60). Falling back to an insecure read for release propagation only. The public edge likely serves an incomplete certificate chain."
      cat /tmp/public-release-curl.err >&2 || true
      TLS_WARNING_EMITTED=1
    fi
    RESPONSE="$(curl --retry 3 --retry-delay 2 --retry-all-errors -k -H 'Cache-Control: no-cache, no-store' -fsS "${BASE_URL}/api/release?ts=${EXPECTED_RELEASE_SHA}" || true)"
  elif [ "${CURL_EXIT}" != "0" ]; then
    RESPONSE=""
  fi

  if printf '%s' "${RESPONSE}" | grep -q "${EXPECTED_RELEASE_SHA}"; then
    echo "Public release is up to date: ${RESPONSE}"
    exit 0
  fi

  echo "Attempt ${attempt}/${VERIFY_ATTEMPTS}: public domain still serves stale release: ${RESPONSE:-<empty>}"
  sleep "${VERIFY_DELAY_SEC}"
done

echo "Public domain did not switch to release ${EXPECTED_RELEASE_SHA}" >&2
exit 1
