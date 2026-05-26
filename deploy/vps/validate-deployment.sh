#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1}"

echo "Checking service..."
sudo systemctl is-active --quiet burgerbus
echo "burgerbus service is active."

echo "Checking bootstrap endpoint..."
curl -fsS "${BASE_URL}/api/bootstrap" >/dev/null
echo "Bootstrap endpoint is healthy."

echo "Checking sample order..."
curl -fsS -X POST "${BASE_URL}/api/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentType":"pickup",
    "paymentMethod":"cash",
    "customer":{"name":"Deploy Check","phone":"(808) 555-1111"},
    "items":[{"itemId":"clv-item-golden-fries","variantId":"clv-item-golden-fries-small"}]
  }' >/dev/null
echo "Order API accepted sample request."

echo "Recent service logs:"
sudo journalctl -u burgerbus -n 20 --no-pager

echo "Deployment validation passed."
