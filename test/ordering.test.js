import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCartItem,
  checkoutCart,
  createCart,
  createOrder,
  getInventoryAvailabilityTable,
  resetOrderingState,
} from '../src/ordering.js';

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

test.beforeEach(() => {
  resetOrderingState();
});

test('creates a pickup cash order with rewards and combo upgrades', () => {
  const order = createOrder({ ...pickupCashOrder, rewardsMemberId: 'member-1' });

  assert.equal(order.paymentStatus, 'awaiting_cash_at_pickup');
  assert.equal(order.subtotal, 15.25);
  assert.equal(order.rewardsPointsEarned, 15);
  assert.equal(order.items[0].comboUpgrade.name, 'Upgrade combo with specialty fries');
  assert.equal(order.cloverMode, 'production');
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

test('builds Clover inventory availability table with usage information', () => {
  const variantId = 'clv-item-golden-fries-large';
  const before = getInventoryAvailabilityTable().find((row) => row.variantId === variantId);

  assert.ok(before, 'Expected a table row for the Clover variant.');

  createOrder({
    fulfillmentType: 'pickup',
    paymentMethod: 'cash',
    customer: {
      name: 'Inventory Tester',
      phone: '(808) 555-0101',
    },
    items: [
      {
        itemId: 'clv-item-golden-fries',
        variantId,
      },
    ],
  });

  const after = getInventoryAvailabilityTable().find((row) => row.variantId === variantId);

  assert.ok(after, 'Expected a table row for the Clover variant after ordering.');
  assert.equal(after.usedQuantity, before.usedQuantity + 1);
  assert.equal(after.remainingQuantity, after.startingInventory - after.usedQuantity);
  assert.equal(after.isAvailable, after.remainingQuantity > 0);
});

test('reserves inventory as soon as a cart is created and extended', () => {
  const variantId = 'clv-item-bus-shake-regular';

  const cart = createCart({
    items: [
      {
        itemId: 'clv-item-bus-shake',
        variantId,
      },
    ],
  });

  let availability = getInventoryAvailabilityTable().find((row) => row.variantId === variantId);

  assert.equal(cart.status, 'active');
  assert.equal(cart.inventoryStatus, 'reserved_in_cart');
  assert.ok(availability, 'Expected reserved inventory row after cart creation.');
  assert.equal(availability.usedQuantity, 1);
  assert.equal(availability.remainingQuantity, availability.startingInventory - 1);

  addCartItem(cart.cartId, {
    itemId: 'clv-item-bus-shake',
    variantId,
  });

  availability = getInventoryAvailabilityTable().find((row) => row.variantId === variantId);
  assert.ok(availability, 'Expected inventory row after adding another reserved item.');
  assert.equal(availability.usedQuantity, 2);
  assert.equal(availability.remainingQuantity, availability.startingInventory - 2);
});

test('keeps inventory reserved through Clover-backed checkout without double counting', async () => {
  const variantId = 'clv-item-bus-shake-regular';
  const cart = createCart({
    items: [
      {
        itemId: 'clv-item-bus-shake',
        variantId,
      },
    ],
  });

  const reservedBeforeCheckout = getInventoryAvailabilityTable().find((row) => row.variantId === variantId);
  const paymentRequests = [];

  const order = await checkoutCart(
    cart.cartId,
    {
      fulfillmentType: 'pickup',
      paymentMethod: 'credit_card',
      customer: {
        name: 'Checkout Tester',
        phone: '(808) 555-0102',
        address: '15-1660 32nd Ave., Keaau, HI 96749',
        cardLast4: '4242',
      },
    },
    {
      processPayment: async (request) => {
        paymentRequests.push(request);
        return {
          cloverOrderId: 'clv-remote-order-1',
          cloverPaymentId: 'clv-remote-payment-1',
        };
      },
    }
  );

  const availabilityAfterCheckout = getInventoryAvailabilityTable().find((row) => row.variantId === variantId);

  assert.equal(paymentRequests.length, 1);
  assert.equal(paymentRequests[0].amount, 5.75);
  assert.equal(order.paymentStatus, 'paid');
  assert.equal(order.cloverOrderId, 'clv-remote-order-1');
  assert.equal(order.cloverPaymentId, 'clv-remote-payment-1');
  assert.ok(reservedBeforeCheckout, 'Expected reserved inventory before checkout.');
  assert.ok(availabilityAfterCheckout, 'Expected inventory row after checkout.');
  assert.equal(reservedBeforeCheckout.usedQuantity, 1);
  assert.equal(availabilityAfterCheckout.usedQuantity, 1);
  assert.equal(availabilityAfterCheckout.remainingQuantity, availabilityAfterCheckout.startingInventory - 1);
});
