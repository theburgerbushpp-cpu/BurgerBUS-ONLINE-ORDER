import { business, menu } from './data/menu.js';

const rewardsLedger = new Map();
const carts = [];
const orders = [];
const cartHoldMinutes = 15;
const defaultPaymentProcessor = async ({ amount }) => ({
  cloverOrderId: `clv-order-${Date.now()}`,
  cloverPaymentId: `clv-payment-${Date.now()}`,
  amount,
  status: 'succeeded',
});
let nextCartSequence = 1;
let nextOrderSequence = 1;

function findMenuItem(itemId) {
  return menu.find((item) => item.id === itemId);
}

function requireFields(source, fields, message) {
  const missing = fields.filter((field) => !source[field]);
  if (missing.length > 0) {
    throw new Error(`${message}: ${missing.join(', ')}`);
  }
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function getExpiryTimestamp(now = new Date()) {
  return new Date(now.getTime() + cartHoldMinutes * 60_000).toISOString();
}

function cleanupExpiredCarts(now = new Date()) {
  const currentTime = now.getTime();
  for (const cart of carts) {
    if (cart.status !== 'active') {
      continue;
    }

    if (new Date(cart.expiresAt).getTime() <= currentTime) {
      cart.status = 'expired';
      cart.inventoryStatus = 'released_after_hold_expired';
    }
  }
}

function getOrderUsageMap() {
  const usage = new Map();

  for (const order of orders) {
    for (const item of order.items) {
      usage.set(item.variantId, (usage.get(item.variantId) ?? 0) + 1);
    }
  }

  return usage;
}

function getActiveCartUsageMap() {
  cleanupExpiredCarts();

  const usage = new Map();

  for (const cart of carts) {
    if (cart.status !== 'active') {
      continue;
    }

    for (const item of cart.items) {
      usage.set(item.variantId, (usage.get(item.variantId) ?? 0) + 1);
    }
  }

  return usage;
}

function getVariantUsageMap() {
  const usage = getOrderUsageMap();

  for (const [variantId, quantity] of getActiveCartUsageMap()) {
    usage.set(variantId, (usage.get(variantId) ?? 0) + quantity);
  }

  return usage;
}

function validateCheckoutPayload({ customer = {}, fulfillmentType, paymentMethod }) {
  if (!['pickup', 'delivery'].includes(fulfillmentType)) {
    throw new Error('Fulfillment type must be pickup or delivery.');
  }

  if (!business.payments[fulfillmentType].includes(paymentMethod)) {
    throw new Error(`Payment method ${paymentMethod} is not allowed for ${fulfillmentType} orders.`);
  }

  requireFields(customer, ['name', 'phone'], 'Customer is missing required fields');

  if (paymentMethod === 'credit_card') {
    requireFields(customer, ['address'], 'Credit card orders require customer address');
    requireFields(customer, ['cardLast4'], 'Credit card orders require card details');
  }

  if (fulfillmentType === 'delivery') {
    requireFields(customer, ['address'], 'Delivery orders require customer address');
  }
}

function normalizeItems(items, variantUsage = getVariantUsageMap()) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one item must be added to the order.');
  }

  const pendingUsage = new Map();

  return items.map((item) => {
    const menuItem = findMenuItem(item.itemId);
    if (!menuItem) {
      throw new Error(`Menu item ${item.itemId} was not found.`);
    }

    const variant = menuItem.variants.find((option) => option.id === item.variantId);
    if (!variant) {
      throw new Error(`Variant ${item.variantId} was not found for ${menuItem.name}.`);
    }

    const nextRequestedQuantity = (pendingUsage.get(variant.id) ?? 0) + 1;
    const usedQuantity = variantUsage.get(variant.id) ?? 0;
    const remainingQuantity = variant.inventory - usedQuantity - nextRequestedQuantity + 1;
    if (!variant.available || remainingQuantity < 1) {
      throw new Error(`${variant.name} is currently unavailable.`);
    }
    pendingUsage.set(variant.id, nextRequestedQuantity);

    const selectedModifiers = (item.modifierIds ?? []).map((modifierId) => {
      const modifier = menuItem.modifiers.find((option) => option.id === modifierId);
      if (!modifier) {
        throw new Error(`Modifier ${modifierId} was not found for ${menuItem.name}.`);
      }
      return modifier;
    });

    const combo = item.comboUpgrade ? menuItem.comboUpgrade : null;
    const subtotal = roundCurrency(
      variant.price +
        selectedModifiers.reduce((sum, modifier) => sum + modifier.price, 0) +
        (combo?.price ?? 0)
    );

    return {
      itemId: menuItem.id,
      itemName: menuItem.name,
      variantId: variant.id,
      variantName: variant.name,
      modifiers: selectedModifiers,
      comboUpgrade: combo,
      subtotal,
    };
  });
}

function calculateSubtotal(items) {
  return roundCurrency(items.reduce((sum, item) => sum + item.subtotal, 0));
}

function applyRewards(rewardsMemberId, rewardsPointsEarned) {
  if (!rewardsMemberId) {
    return;
  }

  const existing = rewardsLedger.get(rewardsMemberId) ?? { memberId: rewardsMemberId, points: 0 };
  existing.points += rewardsPointsEarned;
  rewardsLedger.set(rewardsMemberId, existing);
}

function buildOrderRecord({
  customer,
  fulfillmentType,
  paymentMethod,
  normalizedItems,
  rewardsMemberId,
  paymentResult = null,
}) {
  const subtotal = calculateSubtotal(normalizedItems);
  const rewardsPointsEarned = Math.floor(subtotal * business.rewards.pointsPerDollar);
  const orderId = `order-${nextOrderSequence++}`;
  const isCardPayment = paymentMethod === 'credit_card';
  const order = {
    orderId,
    cloverOrderId: paymentResult?.cloverOrderId ?? `clv-${orderId}`,
    cloverPaymentId: paymentResult?.cloverPaymentId ?? null,
    fulfillmentType,
    paymentMethod,
    customer,
    items: normalizedItems,
    subtotal,
    rewardsPointsEarned,
    paymentStatus: isCardPayment ? 'paid' : 'awaiting_cash_at_pickup',
    inventoryStatus: isCardPayment ? 'deducted_after_successful_payment' : 'reserved_until_pickup_payment',
    messaging: [
      `Text queued: We received your order. Estimated completion is ${business.pickupWaitMinutes} minutes.`,
      'Text queued: Clover KDS marked the order ready for completion notification.',
    ],
  };

  orders.push(order);
  applyRewards(rewardsMemberId, rewardsPointsEarned);

  return {
    ...order,
    deliveryPartner: fulfillmentType === 'delivery' ? business.deliveryPartners[0] : null,
    cloverMode: business.cloverMode,
  };
}

function getActiveCart(cartId) {
  cleanupExpiredCarts();

  const cart = carts.find((candidate) => candidate.cartId === cartId);
  if (!cart || cart.status !== 'active') {
    throw new Error(`Cart ${cartId} was not found or is no longer active.`);
  }

  return cart;
}

function serializeCart(cart) {
  return {
    cartId: cart.cartId,
    cloverCartId: cart.cloverCartId,
    status: cart.status,
    inventoryStatus: cart.inventoryStatus,
    createdAt: cart.createdAt,
    expiresAt: cart.expiresAt,
    subtotal: cart.subtotal,
    items: cart.items,
  };
}

export function getInventoryAvailabilityTable() {
  const variantUsage = getVariantUsageMap();

  return menu.flatMap((item) =>
    item.variants.map((variant) => {
      const usedQuantity = variantUsage.get(variant.id) ?? 0;
      const remainingQuantity = Math.max(variant.inventory - usedQuantity, 0);
      const isAvailable = variant.available && remainingQuantity > 0;

      return {
        itemId: item.id,
        itemName: item.name,
        variantId: variant.id,
        variantName: variant.name,
        startingInventory: variant.inventory,
        usedQuantity,
        remainingQuantity,
        isAvailable,
      };
    })
  );
}

export function getOrderingSnapshot() {
  cleanupExpiredCarts();

  return {
    business,
    menu,
    inventoryAvailabilityTable: getInventoryAvailabilityTable(),
    rewardsMembers: Array.from(rewardsLedger.values()),
    carts: carts.filter((cart) => cart.status === 'active').map(serializeCart),
    orders,
  };
}

export function createCart(payload) {
  const { items = [] } = payload;
  const normalizedItems = normalizeItems(items);
  const now = new Date();
  const cartId = `cart-${nextCartSequence++}`;
  const cart = {
    cartId,
    cloverCartId: `clv-${cartId}`,
    status: 'active',
    inventoryStatus: 'reserved_in_cart',
    createdAt: now.toISOString(),
    expiresAt: getExpiryTimestamp(now),
    subtotal: calculateSubtotal(normalizedItems),
    items: normalizedItems,
  };

  carts.push(cart);

  return serializeCart(cart);
}

export function addCartItem(cartId, item) {
  const cart = getActiveCart(cartId);
  const [normalizedItem] = normalizeItems([item]);
  cart.items.push(normalizedItem);
  cart.subtotal = calculateSubtotal(cart.items);
  cart.expiresAt = getExpiryTimestamp();

  return serializeCart(cart);
}

export async function checkoutCart(cartId, payload, options = {}) {
  const cart = getActiveCart(cartId);
  const { customer = {}, fulfillmentType, paymentMethod, rewardsMemberId } = payload;

  validateCheckoutPayload({ customer, fulfillmentType, paymentMethod });

  let paymentResult = null;
  if (paymentMethod === 'credit_card') {
    const processPayment = options.processPayment ?? defaultPaymentProcessor;
    paymentResult = await processPayment({
      cart,
      customer,
      fulfillmentType,
      paymentMethod,
      amount: cart.subtotal,
    });
  }

  cart.status = 'checked_out';
  cart.inventoryStatus = paymentMethod === 'credit_card' ? 'deducted_after_successful_payment' : 'reserved_until_pickup_payment';
  cart.checkedOutAt = new Date().toISOString();

  return buildOrderRecord({
    customer,
    fulfillmentType,
    paymentMethod,
    normalizedItems: cart.items,
    rewardsMemberId,
    paymentResult,
  });
}

export function createOrder(payload) {
  const { customer = {}, fulfillmentType, paymentMethod, items = [], rewardsMemberId } = payload;

  validateCheckoutPayload({ customer, fulfillmentType, paymentMethod });

  return buildOrderRecord({
    customer,
    fulfillmentType,
    paymentMethod,
    normalizedItems: normalizeItems(items),
    rewardsMemberId,
  });
}

export function resetOrderingState() {
  rewardsLedger.clear();
  carts.length = 0;
  orders.length = 0;
  nextCartSequence = 1;
  nextOrderSequence = 1;
}
