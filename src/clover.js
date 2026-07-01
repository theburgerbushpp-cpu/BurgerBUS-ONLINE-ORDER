const CLOVER_MODE = (process.env.CLOVER_MODE || 'production').toLowerCase();
const CLOVER_BASE_URL =
  process.env.CLOVER_API_BASE_URL ||
  (CLOVER_MODE === 'sandbox' ? 'https://sandbox.dev.clover.com' : 'https://api.clover.com');
const MAX_ITEMS_PER_REQUEST = 200;
const DEFAULT_INVENTORY_QUANTITY = 10;

async function cloverRequest(path, token, { method = 'GET', body } = {}) {
  const response = await fetch(`${CLOVER_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Clover API responded with ${response.status} for ${path}`);
  }
  return response.json();
}

async function cloverFetch(path, token) {
  return cloverRequest(path, token);
}

async function fetchItemImageUrl(merchantId, itemId, token) {
  try {
    const data = await cloverFetch(`/v3/merchants/${merchantId}/items/${itemId}/images`, token);
    return data.elements?.[0]?.url ?? '';
  } catch {
    return '';
  }
}

export async function fetchCloverMenu(merchantId, token) {
  const data = await cloverFetch(
    `/v3/merchants/${merchantId}/items?expand=modifierGroups,categories,itemStock&limit=${MAX_ITEMS_PER_REQUEST}`,
    token
  );

  const cloverItems = (data.elements ?? []).filter((item) => !item.hidden);

  return Promise.all(
    cloverItems.map(async (cloverItem) => {
      const imageUrl = await fetchItemImageUrl(merchantId, cloverItem.id, token);
      const categoryName = cloverItem.categories?.elements?.[0]?.name?.toLowerCase() ?? 'other';
      const modifiers = (cloverItem.modifierGroups?.elements ?? []).flatMap(
        (group) =>
          (group.modifiers?.elements ?? []).map((mod) => ({
            id: mod.id,
            name: mod.name,
            price: (mod.price ?? 0) / 100,
          }))
      );
      const inventory = Math.max(cloverItem.itemStock?.quantity ?? DEFAULT_INVENTORY_QUANTITY, 0);
      return {
        id: cloverItem.id,
        name: cloverItem.name,
        category: categoryName,
        description: cloverItem.alternateName || cloverItem.name,
        image: imageUrl,
        variants: [
          {
            id: `${cloverItem.id}-default`,
            name: 'Regular',
            price: (cloverItem.price ?? 0) / 100,
            available: cloverItem.available !== false && inventory > 0,
            inventory,
          },
        ],
        modifiers,
        comboUpgrade: null,
      };
    })
  );
}

export async function processCloverCartPayment({ merchantId, token, cart, customer, fulfillmentType, amount }) {
  try {
    const order = await cloverRequest(`/v3/merchants/${merchantId}/orders`, token, {
      method: 'POST',
      body: {
        state: 'open',
        title: `${fulfillmentType} online order`,
        note: `Burger Bus cart ${cart.cartId} for ${customer.name}`,
      },
    });

    const payment = await cloverRequest(`/v3/merchants/${merchantId}/payments`, token, {
      method: 'POST',
      body: {
        amount: Math.round(amount * 100),
        currency: 'USD',
        note: `Online checkout for ${customer.name}`,
        order: {
          id: order.id,
        },
      },
    });

    return {
      cloverOrderId: order.id,
      cloverPaymentId: payment.id,
      status: payment.result ?? 'succeeded',
    };
  } catch (error) {
    throw new Error(`Clover checkout failed: ${error.message}`);
  }
}
