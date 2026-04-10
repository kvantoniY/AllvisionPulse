#!/usr/bin/env bash

set -euo pipefail

EXPECTED_RELEASE_SHA="${1:-}"
BASE_URL="${2:-https://allvision-pulse.ru}"
VERIFY_ATTEMPTS="${VERIFY_ATTEMPTS:-10}"
VERIFY_DELAY_SEC="${VERIFY_DELAY_SEC:-6}"
CURL_CONNECT_TIMEOUT_SEC="${CURL_CONNECT_TIMEOUT_SEC:-10}"
CURL_MAX_TIME_SEC="${CURL_MAX_TIME_SEC:-20}"

if [ -z "${EXPECTED_RELEASE_SHA}" ]; then
  echo "Usage: bash infra/alpha/scripts/verify-public-release.sh <expected_release_sha> [base_url]" >&2
  exit 1
fi

TLS_WARNING_EMITTED=0
NETWORK_WARNING_EMITTED=0
LAST_CURL_EXIT=0
LAST_CURL_STDERR=""
LAST_RESPONSE=""

for attempt in $(seq 1 "${VERIFY_ATTEMPTS}"); do
  RESPONSE=""
  CURL_EXIT=0

  set +e
  RESPONSE="$(curl --connect-timeout "${CURL_CONNECT_TIMEOUT_SEC}" --max-time "${CURL_MAX_TIME_SEC}" -H 'Cache-Control: no-cache, no-store' -fsS "${BASE_URL}/api/release?ts=${EXPECTED_RELEASE_SHA}" 2>/tmp/public-release-curl.err)"
  CURL_EXIT=$?
  set -e
  LAST_CURL_EXIT="${CURL_EXIT}"
  LAST_CURL_STDERR="$(cat /tmp/public-release-curl.err 2>/dev/null || true)"

  if [ "${CURL_EXIT}" = "60" ]; then
    if [ "${TLS_WARNING_EMITTED}" = "0" ]; then
      echo "::warning::Strict TLS verification for ${BASE_URL} failed on the GitHub runner (curl exit 60). Falling back to an insecure read for release propagation only. The public edge likely serves an incomplete certificate chain."
      cat /tmp/public-release-curl.err >&2 || true
      TLS_WARNING_EMITTED=1
    fi
    RESPONSE="$(curl --connect-timeout "${CURL_CONNECT_TIMEOUT_SEC}" --max-time "${CURL_MAX_TIME_SEC}" -k -H 'Cache-Control: no-cache, no-store' -fsS "${BASE_URL}/api/release?ts=${EXPECTED_RELEASE_SHA}" || true)"
  elif [ "${CURL_EXIT}" = "7" ] || [ "${CURL_EXIT}" = "28" ] || [ "${CURL_EXIT}" = "35" ] || [ "${CURL_EXIT}" = "52" ] || [ "${CURL_EXIT}" = "56" ]; then
    if [ "${NETWORK_WARNING_EMITTED}" = "0" ]; then
      echo "::warning::Public endpoint ${BASE_URL} is unreachable from the GitHub runner (curl exit ${CURL_EXIT}). The origin deploy may be healthy, but the external HTTPS edge or port 443 is not responding."
      cat /tmp/public-release-curl.err >&2 || true
      NETWORK_WARNING_EMITTED=1
    fi
    RESPONSE=""
  elif [ "${CURL_EXIT}" != "0" ]; then
    RESPONSE=""
  fi
  LAST_RESPONSE="${RESPONSE}"

  if printf '%s' "${RESPONSE}" | grep -q "${EXPECTED_RELEASE_SHA}"; then
    echo "Public release is up to date: ${RESPONSE}"
    exit 0
  fi

  if [ "${CURL_EXIT}" != "0" ] && [ -z "${RESPONSE}" ]; then
    echo "Attempt ${attempt}/${VERIFY_ATTEMPTS}: public domain did not return a release payload (curl exit ${CURL_EXIT})"
  else
    echo "Attempt ${attempt}/${VERIFY_ATTEMPTS}: public domain still serves stale release: ${RESPONSE:-<empty>}"
  fi
  sleep "${VERIFY_DELAY_SEC}"
done

if [ "${LAST_CURL_EXIT}" != "0" ] && [ -z "${LAST_RESPONSE}" ]; then
  echo "Public domain did not return a readable release payload for ${EXPECTED_RELEASE_SHA} (last curl exit ${LAST_CURL_EXIT})" >&2
  if [ -n "${LAST_CURL_STDERR}" ]; then
    printf '%s\n' "${LAST_CURL_STDERR}" >&2
  fi
else
  echo "Public domain did not switch to release ${EXPECTED_RELEASE_SHA}" >&2
fi
exit 1
