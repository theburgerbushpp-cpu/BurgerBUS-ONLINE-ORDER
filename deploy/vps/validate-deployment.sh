#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1}"
VALIDATION_ORDER_PAYLOAD="${VALIDATION_ORDER_PAYLOAD:-{
  \"fulfillmentType\":\"pickup\",
  \"paymentMethod\":\"credit_card\",
  \"customer\":{\"name\":\"Deploy Check\",\"phone\":\"(808) 555-1111\"},
  \"items\":[{\"itemId\":\"clv-item-golden-fries\",\"variantId\":\"clv-item-golden-fries-does-not-exist\"}]
}}"
TMP_RESPONSE_FILE="$(mktemp)"
trap 'rm -f "${TMP_RESPONSE_FILE}"' EXIT

check_endpoint() {
  local method="$1"
  local url="$2"
  local expected_status="$3"
  local payload=""
  if [[ $# -ge 4 ]]; then
    payload="$4"
  fi

  local status
  if [[ -n "${payload}" ]]; then
    status="$(curl -sS -o "${TMP_RESPONSE_FILE}" -w "%{http_code}" -X "${method}" "${url}" \
      -H "Content-Type: application/json" \
      -d "${payload}")"
  else
    status="$(curl -sS -o "${TMP_RESPONSE_FILE}" -w "%{http_code}" -X "${method}" "${url}")"
  fi

  if [[ "${status}" != "${expected_status}" ]]; then
    echo "Request failed: ${method} ${url} returned HTTP ${status}, expected ${expected_status}"
    echo "--- response body ---"
    cat "${TMP_RESPONSE_FILE}"
    echo
    exit 1
  fi
}

echo "Checking service..."
if ! sudo systemctl is-active --quiet burgerbus; then
  echo "burgerbus service is not active. Check: sudo journalctl -u burgerbus -n 50"
  echo "Also verify env file exists at /etc/burgerbus/burgerbus.env"
  sudo systemctl status burgerbus --no-pager || true
  exit 1
fi
echo "burgerbus service is active."

echo "Checking bootstrap endpoint..."
check_endpoint "GET" "${BASE_URL}/api/bootstrap" "200"
echo "Bootstrap endpoint is healthy."

echo "Checking order validation endpoint behavior..."
check_endpoint "POST" "${BASE_URL}/api/orders" "400" "${VALIDATION_ORDER_PAYLOAD}"
echo "Order API validation path is reachable."

echo "Recent service logs:"
sudo journalctl -u burgerbus -n 20 --no-pager

echo "Deployment validation passed."
