#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1}"

check_endpoint() {
  local method="$1"
  local url="$2"
  local payload="${3:-}"

  local status
  if [[ -n "${payload}" ]]; then
    status="$(curl -sS -o /tmp/burgerbus-response.out -w "%{http_code}" -X "${method}" "${url}" \
      -H "Content-Type: application/json" \
      -d "${payload}")"
  else
    status="$(curl -sS -o /tmp/burgerbus-response.out -w "%{http_code}" -X "${method}" "${url}")"
  fi

  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    echo "Request failed: ${method} ${url} returned HTTP ${status}"
    echo "--- response body ---"
    cat /tmp/burgerbus-response.out
    echo
    exit 1
  fi
}

echo "Checking service..."
sudo systemctl is-active --quiet burgerbus
echo "burgerbus service is active."

echo "Checking bootstrap endpoint..."
check_endpoint "GET" "${BASE_URL}/api/bootstrap"
echo "Bootstrap endpoint is healthy."

echo "Checking sample order..."
check_endpoint "POST" "${BASE_URL}/api/orders" '{
    "fulfillmentType":"pickup",
    "paymentMethod":"cash",
    "customer":{"name":"Deploy Check","phone":"(808) 555-1111"},
    "items":[{"itemId":"clv-item-golden-fries","variantId":"clv-item-golden-fries-small"}]
  }'
echo "Order API accepted sample request."

echo "Recent service logs:"
sudo journalctl -u burgerbus -n 20 --no-pager

echo "Deployment validation passed."
