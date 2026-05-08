import { business, menu } from './data/menu.js';

const rewardsLedger = new Map();
const orders = [];

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

export function getOrderingSnapshot() {
  return {
    business,
    menu,
    rewardsMembers: Array.from(rewardsLedger.values()),
    orders,
  };
}

export function createOrder(payload) {
  const { customer = {}, fulfillmentType, paymentMethod, items = [], rewardsMemberId } = payload;

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

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one item must be added to the order.');
  }

  const normalizedItems = items.map((item) => {
    const menuItem = findMenuItem(item.itemId);
    if (!menuItem) {
      throw new Error(`Menu item ${item.itemId} was not found.`);
    }

    const variant = menuItem.variants.find((option) => option.id === item.variantId);
    if (!variant) {
      throw new Error(`Variant ${item.variantId} was not found for ${menuItem.name}.`);
    }
    if (!variant.available || variant.inventory < 1) {
      throw new Error(`${variant.name} is currently unavailable.`);
    }

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

  const subtotal = roundCurrency(normalizedItems.reduce((sum, item) => sum + item.subtotal, 0));
  const rewardsPointsEarned = Math.floor(subtotal * business.rewards.pointsPerDollar);
  const orderId = `order-${orders.length + 1}`;
  const order = {
    orderId,
    cloverOrderId: `clv-${orderId}`,
    fulfillmentType,
    paymentMethod,
    customer,
    items: normalizedItems,
    subtotal,
    rewardsPointsEarned,
    paymentStatus: paymentMethod === 'cash' ? 'awaiting_cash_at_pickup' : 'paid',
    inventoryStatus: 'reserved_in_clover_sandbox',
    messaging: [
      `Text queued: We received your order. Estimated completion is ${business.pickupWaitMinutes} minutes.`,
      'Text queued: Clover KDS marked the order ready for completion notification.',
    ],
  };

  orders.push(order);

  if (rewardsMemberId) {
    const existing = rewardsLedger.get(rewardsMemberId) ?? { memberId: rewardsMemberId, points: 0 };
    existing.points += rewardsPointsEarned;
    rewardsLedger.set(rewardsMemberId, existing);
  }

  return {
    ...order,
    deliveryPartner: fulfillmentType === 'delivery' ? business.deliveryPartners[0] : null,
    cloverMode: business.cloverMode,
  };
}
