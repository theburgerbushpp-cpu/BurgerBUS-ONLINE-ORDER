import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder } from '../src/ordering.js';

const pickupCashOrder = {
  fulfillmentType: 'pickup',
  paymentMethod: 'cash',
  customer: {
    name: 'Bus Rider',
    phone: '(808) 555-0100',
  },
  items: [
    {
      itemId: 'clv-item-bus-burger',
      variantId: 'clv-item-bus-burger-single',
      modifierIds: ['clv-mod-burger-cheese'],
      comboUpgrade: true,
    },
  ],
};

test('creates a pickup cash order with rewards and combo upgrades', () => {
  const order = createOrder({ ...pickupCashOrder, rewardsMemberId: 'member-1' });

  assert.equal(order.paymentStatus, 'awaiting_cash_at_pickup');
  assert.equal(order.subtotal, 15.25);
  assert.equal(order.rewardsPointsEarned, 15);
  assert.equal(order.items[0].comboUpgrade.name, 'Upgrade combo with specialty fries');
  assert.equal(order.cloverMode, 'sandbox');
});

test('requires address and card details for credit card orders', () => {
  assert.throws(
    () =>
      createOrder({
        ...pickupCashOrder,
        paymentMethod: 'credit_card',
      }),
    /Credit card orders require customer address/
  );
});

test('rejects cash delivery orders', () => {
  assert.throws(
    () =>
      createOrder({
        ...pickupCashOrder,
        fulfillmentType: 'delivery',
      }),
    /Payment method cash is not allowed for delivery orders/
  );
});

test('rejects unavailable variants', () => {
  assert.throws(
    () =>
      createOrder({
        ...pickupCashOrder,
        items: [
          {
            itemId: 'clv-item-bus-burger',
            variantId: 'clv-item-bus-burger-quadruple',
          },
        ],
      }),
    /Quadruple is currently unavailable/
  );
});
