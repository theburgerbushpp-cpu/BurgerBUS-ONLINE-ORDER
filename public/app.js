const state = {
  business: null,
  menu: [],
  inventoryAvailabilityTable: [],
  apiEnabled: true,
  serverCartId: null,
  selectedVariants: new Map(),
  cart: [],
  pendingItem: null,
};

const elements = {
  brandName: document.querySelector('#brand-name'),
  businessCopy: document.querySelector('#business-copy'),
  address: document.querySelector('#address'),
  phone: document.querySelector('#phone'),
  serviceRules: document.querySelector('#service-rules'),
  rewardCopy: document.querySelector('#reward-copy'),
  menuGrid: document.querySelector('#menu-grid'),
  inventoryTableBody: document.querySelector('#inventory-table-body'),
  cartItems: document.querySelector('#cart-items'),
  cartTotal: document.querySelector('#cart-total'),
  orderResult: document.querySelector('#order-result'),
  fulfillmentType: document.querySelector('#fulfillment-type'),
  paymentMethod: document.querySelector('#payment-method'),
  customerName: document.querySelector('#customer-name'),
  customerPhone: document.querySelector('#customer-phone'),
  customerAddress: document.querySelector('#customer-address'),
  customerCard: document.querySelector('#customer-card'),
  rewardsMember: document.querySelector('#rewards-member'),
  submitOrder: document.querySelector('#submit-order'),
  modifierDialog: document.querySelector('#modifier-dialog'),
  dialogTitle: document.querySelector('#dialog-title'),
  dialogCopy: document.querySelector('#dialog-copy'),
  modifierOptions: document.querySelector('#modifier-options'),
  comboDialog: document.querySelector('#combo-dialog'),
  comboCopy: document.querySelector('#combo-copy'),
  comboToggle: document.querySelector('#combo-toggle'),
  saveModifiers: document.querySelector('#save-modifiers'),
  saveCombo: document.querySelector('#save-combo'),
};

const formatCurrency = (value) => `$${value.toFixed(2)}`;
const lowStockThreshold = 5;

function getInventoryRow(variantId) {
  return state.inventoryAvailabilityTable.find((row) => row.variantId === variantId) ?? null;
}

function isVariantAvailable(variant) {
  const inventoryRow = getInventoryRow(variant.id);
  return inventoryRow ? inventoryRow.isAvailable : variant.available && variant.inventory > 0;
}

function syncCartFromServer(cart) {
  state.serverCartId = cart.cartId;
  state.cart = cart.items.map((item) => ({
    ...item,
    modifierIds: item.modifiers.map((modifier) => modifier.id),
  }));
}

function buildInventoryTableFromMenu(menu) {
  return menu.flatMap((item) =>
    item.variants.map((variant) => ({
      itemId: item.id,
      itemName: item.name,
      variantId: variant.id,
      variantName: variant.name,
      startingInventory: variant.inventory,
      usedQuantity: 0,
      remainingQuantity: variant.inventory,
      isAvailable: variant.available && variant.inventory > 0,
    }))
  );
}

function validateOrderPayload(payload) {
  if (!payload.customer.name || !payload.customer.phone) {
    throw new Error('Customer is missing required fields: name, phone');
  }
  if (payload.paymentMethod === 'credit_card') {
    if (!payload.customer.address) {
      throw new Error('Credit card orders require customer address');
    }
    if (!payload.customer.cardLast4) {
      throw new Error('Credit card orders require card details');
    }
  }
  if (payload.fulfillmentType === 'delivery' && !payload.customer.address) {
    throw new Error('Delivery orders require customer address');
  }
  if (payload.fulfillmentType === 'delivery' && payload.paymentMethod === 'cash') {
    throw new Error('Payment method cash is not allowed for delivery orders.');
  }
}

function processStaticOrder(payload) {
  validateOrderPayload(payload);

  const nextTable = state.inventoryAvailabilityTable.map((row) => ({ ...row }));
  const rowByVariantId = new Map(nextTable.map((row) => [row.variantId, row]));

  payload.items.forEach((item) => {
    const row = rowByVariantId.get(item.variantId);
    if (!row || !row.isAvailable || row.remainingQuantity < 1) {
      throw new Error(`Variant ${item.variantId} is currently unavailable.`);
    }
    row.usedQuantity += 1;
    row.remainingQuantity = Math.max(row.startingInventory - row.usedQuantity, 0);
    row.isAvailable = row.remainingQuantity > 0;
  });

  state.inventoryAvailabilityTable = nextTable;
  renderInventoryTable();

  const subtotal = state.cart.reduce((sum, item) => sum + item.subtotal, 0);
  return {
    orderId: `static-${Date.now()}`,
    cloverOrderId: `clv-static-${Date.now()}`,
    mode: 'static_pages_fallback',
    subtotal,
    paymentStatus: payload.paymentMethod === 'cash' ? 'awaiting_cash_at_pickup' : 'paid',
    inventoryStatus: 'reserved_locally_for_demo',
    items: payload.items,
  };
}

function syncPaymentOptions() {
  if (elements.fulfillmentType.value === 'delivery') {
    elements.paymentMethod.value = 'credit_card';
    elements.paymentMethod.querySelector('[value="cash"]').disabled = true;
  } else {
    elements.paymentMethod.querySelector('[value="cash"]').disabled = false;
  }
}

function updateCart() {
  elements.cartItems.innerHTML = '';
  const total = state.cart.reduce((sum, item) => sum + item.subtotal, 0);
  elements.cartTotal.textContent = `Total: ${formatCurrency(total)}`;
  if (state.cart.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'Your cart is empty.';
    elements.cartItems.append(empty);
    return;
  }

  state.cart.forEach((item) => {
    const li = document.createElement('li');
    const mods = item.modifiers.length ? ` | Mods: ${item.modifiers.map((modifier) => modifier.name).join(', ')}` : '';
    const combo = item.comboUpgrade ? ` | Combo: ${item.comboUpgrade.name}` : '';
    li.textContent = `${item.itemName} (${item.variantName})${mods}${combo} — ${formatCurrency(item.subtotal)}`;
    elements.cartItems.append(li);
  });
}

function getSelectedVariant(item) {
  const selectedId = state.selectedVariants.get(item.id) ?? item.variants[0].id;
  return item.variants.find((variant) => variant.id === selectedId) ?? item.variants[0];
}

function renderMenu() {
  elements.menuGrid.innerHTML = '';
  state.menu.forEach((item) => {
    const selectedVariant = getSelectedVariant(item);
    const selectedVariantAvailable = isVariantAvailable(selectedVariant);
    const card = document.createElement('article');
    card.className = 'menu-card';

    const variantsMarkup = item.variants
      .map(
        (variant) => `
          <button
            class="variant-chip ${variant.id === selectedVariant.id ? 'active' : ''}"
            data-item-id="${item.id}"
            data-variant-id="${variant.id}"
            ${!isVariantAvailable(variant) ? 'disabled' : ''}
          >
            ${variant.name}
          </button>
        `
      )
      .join('');

    card.innerHTML = `
      <img src="${item.image}" alt="${item.name}" />
      <div class="menu-card-content">
        <div class="badge-row">
          <span class="status-badge">${item.category}</span>
          <span class="status-badge">${selectedVariantAvailable ? 'Available' : 'Sold out'}</span>
        </div>
        <h3>${item.name}</h3>
        <p>${item.description}</p>
        <div class="variant-row">${variantsMarkup}</div>
        <div class="price-row">
          <strong>${formatCurrency(selectedVariant.price)}</strong>
          <button class="primary-button" data-customize-id="${item.id}" ${!selectedVariantAvailable ? 'disabled' : ''}>Customize</button>
        </div>
      </div>
    `;

    elements.menuGrid.append(card);
  });

  elements.menuGrid.querySelectorAll('[data-variant-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedVariants.set(button.dataset.itemId, button.dataset.variantId);
      renderMenu();
    });
  });

  elements.menuGrid.querySelectorAll('[data-customize-id]').forEach((button) => {
    button.addEventListener('click', () => openModifierDialog(button.dataset.customizeId));
  });
}

function renderInventoryTable() {
  elements.inventoryTableBody.innerHTML = '';

  const menuByItemId = new Map(state.menu.map((item) => [item.id, item]));

  state.inventoryAvailabilityTable.forEach((row) => {
    const item = menuByItemId.get(row.itemId);
    const tableRow = document.createElement('tr');
    const statusLabel = !row.isAvailable
      ? 'Sold out'
      : row.remainingQuantity <= lowStockThreshold
        ? 'Low stock'
        : 'Available';
    const statusClass = !row.isAvailable
      ? 'status-pill unavailable'
      : row.remainingQuantity <= lowStockThreshold
        ? 'status-pill low-stock'
        : 'status-pill available';

    tableRow.innerHTML = `
      <td>
        <div class="item-cell">
          <img src="${item?.image ?? ''}" alt="${row.itemName}" loading="lazy" />
          <div>
            <strong>${row.itemName}</strong>
            <p>${row.itemId}</p>
          </div>
        </div>
      </td>
      <td>
        <strong>${row.variantName}</strong>
        <p>${row.variantId}</p>
      </td>
      <td>${row.startingInventory}</td>
      <td>${row.usedQuantity}</td>
      <td>${row.remainingQuantity}</td>
      <td><span class="${statusClass}">${statusLabel}</span></td>
    `;

    elements.inventoryTableBody.append(tableRow);
  });
}

function openModifierDialog(itemId) {
  const item = state.menu.find((candidate) => candidate.id === itemId);
  const variant = getSelectedVariant(item);
  state.pendingItem = {
    itemId: item.id,
    variantId: variant.id,
    modifiers: [],
    comboUpgrade: false,
  };

  elements.dialogTitle.textContent = `${item.name} modifiers`;
  elements.dialogCopy.textContent = `Selected variant: ${variant.name} at ${formatCurrency(variant.price)}`;
  elements.modifierOptions.innerHTML = '';

  if (item.modifiers.length === 0) {
    const note = document.createElement('p');
    note.textContent = 'This item has no modifiers. Continue to combo options.';
    elements.modifierOptions.append(note);
  }

  item.modifiers.forEach((modifier) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${modifier.id}" /> ${modifier.name} (+${formatCurrency(modifier.price)})`;
    elements.modifierOptions.append(label);
  });

  elements.modifierDialog.showModal();
}

function openComboDialog() {
  const item = state.menu.find((candidate) => candidate.id === state.pendingItem.itemId);
  if (!item.comboUpgrade) {
    void addPendingItemToCart();
    return;
  }

  elements.comboCopy.textContent = `${item.comboUpgrade.name} (+${formatCurrency(item.comboUpgrade.price)})`;
  elements.comboToggle.checked = false;
  elements.comboDialog.showModal();
}

async function addPendingItemToCart() {
  const item = state.menu.find((candidate) => candidate.id === state.pendingItem.itemId);
  const variant = item.variants.find((candidate) => candidate.id === state.pendingItem.variantId);
  const modifiers = state.pendingItem.modifiers
    .map((modifierId) => item.modifiers.find((modifier) => modifier.id === modifierId))
    .filter(Boolean);
  const comboUpgrade = state.pendingItem.comboUpgrade ? item.comboUpgrade : null;
  const subtotal = variant.price + modifiers.reduce((sum, modifier) => sum + modifier.price, 0) + (comboUpgrade?.price ?? 0);
  const cartItem = {
    itemId: item.id,
    itemName: item.name,
    variantId: variant.id,
    variantName: variant.name,
    modifiers,
    modifierIds: modifiers.map((modifier) => modifier.id),
    comboUpgrade,
    subtotal,
  };

  if (state.apiEnabled) {
    try {
      const response = await fetch(state.serverCartId ? `api/carts/${state.serverCartId}/items` : 'api/carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          state.serverCartId
            ? {
                item: {
                  itemId: cartItem.itemId,
                  variantId: cartItem.variantId,
                  modifierIds: cartItem.modifierIds,
                  comboUpgrade: Boolean(cartItem.comboUpgrade),
                },
              }
            : {
                items: [
                  {
                    itemId: cartItem.itemId,
                    variantId: cartItem.variantId,
                    modifierIds: cartItem.modifierIds,
                    comboUpgrade: Boolean(cartItem.comboUpgrade),
                  },
                ],
              }
        ),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to reserve item in cart.');
      }

      syncCartFromServer(body.cart);
      state.inventoryAvailabilityTable = body.inventoryAvailabilityTable ?? state.inventoryAvailabilityTable;
      updateCart();
      renderInventoryTable();
      renderMenu();
      elements.orderResult.textContent = JSON.stringify(
        {
          cartId: body.cart.cartId,
          inventoryStatus: body.cart.inventoryStatus,
          expiresAt: body.cart.expiresAt,
        },
        null,
        2
      );
    } catch (error) {
      elements.orderResult.textContent = JSON.stringify({ error: error.message }, null, 2);
    } finally {
      state.pendingItem = null;
    }
    return;
  }

  state.cart.push(cartItem);

  updateCart();
  state.pendingItem = null;
}

async function submitOrder() {
  elements.orderResult.textContent = 'Submitting order...';
  const payload = {
    fulfillmentType: elements.fulfillmentType.value,
    paymentMethod: elements.paymentMethod.value,
    customer: {
      name: elements.customerName.value.trim(),
      phone: elements.customerPhone.value.trim(),
      address: elements.customerAddress.value.trim(),
      cardLast4: elements.customerCard.value.trim(),
    },
    rewardsMemberId: elements.rewardsMember.value.trim() || undefined,
    items: state.cart.map((item) => ({
      itemId: item.itemId,
      variantId: item.variantId,
      modifierIds: item.modifierIds,
      comboUpgrade: Boolean(item.comboUpgrade),
    })),
  };

  try {
    if (state.apiEnabled) {
      if (!state.serverCartId) {
        throw new Error('Add at least one available item to the cart before checkout.');
      }

      const response = await fetch(`api/carts/${state.serverCartId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillmentType: payload.fulfillmentType,
          paymentMethod: payload.paymentMethod,
          customer: payload.customer,
          rewardsMemberId: payload.rewardsMemberId,
        }),
      });
      const body = await response.json();
      elements.orderResult.textContent = JSON.stringify(body.order ?? body, null, 2);

      if (response.ok) {
        state.serverCartId = null;
        state.cart = [];
        updateCart();
        state.inventoryAvailabilityTable = body.inventoryAvailabilityTable ?? [];
        renderInventoryTable();
        renderMenu();
      }
      return;
    }

    const localOrder = processStaticOrder(payload);
    elements.orderResult.textContent = JSON.stringify(localOrder, null, 2);
    state.cart = [];
    updateCart();
  } catch (error) {
    elements.orderResult.textContent = JSON.stringify({ error: error.message }, null, 2);
  }
}

async function bootstrap() {
  let data;

  try {
    const response = await fetch('api/bootstrap');
    if (!response.ok) {
      throw new Error('API bootstrap unavailable');
    }
    data = await response.json();
    state.apiEnabled = true;
  } catch {
    const fallbackResponse = await fetch('bootstrap.json');
    data = await fallbackResponse.json();
    state.apiEnabled = false;
    elements.orderResult.textContent = 'Static mode: using local Clover demo data (GitHub Pages fallback).';
  }

  state.business = data.business;
  state.menu = data.menu;
  state.inventoryAvailabilityTable = data.inventoryAvailabilityTable ?? buildInventoryTableFromMenu(data.menu);
  elements.brandName.textContent = data.business.brand;
  elements.businessCopy.textContent = `${data.business.brand} online ordering mirrors major quick-service flows with Clover production inventory, modifier popups, combo upgrades, cash pickup, credit card checkout, and rewards points.`;
  elements.address.textContent = `${data.business.location.street}, ${data.business.location.city}, ${data.business.location.state} ${data.business.location.postalCode}`;
  elements.phone.textContent = data.business.phone;
  elements.serviceRules.textContent = `Pickup accepts cash or credit. Delivery uses ${data.business.deliveryPartners.join(' or ')} and credit card only.`;
  elements.rewardCopy.textContent = `${data.business.rewards.pointsPerDollar} point per dollar spent. ${data.business.rewards.redemptionNote}`;
  syncPaymentOptions();
  renderMenu();
  renderInventoryTable();
  updateCart();
}

elements.fulfillmentType.addEventListener('change', syncPaymentOptions);
elements.saveModifiers.addEventListener('click', (event) => {
  event.preventDefault();
  state.pendingItem.modifiers = Array.from(elements.modifierOptions.querySelectorAll('input:checked')).map((input) => input.value);
  elements.modifierDialog.close();
  openComboDialog();
});
elements.saveCombo.addEventListener('click', (event) => {
  event.preventDefault();
  state.pendingItem.comboUpgrade = elements.comboToggle.checked;
  elements.comboDialog.close();
  void addPendingItemToCart();
});
elements.submitOrder.addEventListener('click', submitOrder);

bootstrap();
