const CLOVER_SANDBOX_BASE = 'https://sandbox.dev.clover.com';

async function cloverFetch(path, token) {
  const response = await fetch(`${CLOVER_SANDBOX_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Clover API responded with ${response.status} for ${path}`);
  }
  return response.json();
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
    `/v3/merchants/${merchantId}/items?expand=modifierGroups,categories,itemStock&limit=200`,
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
      const inventory = Math.max(cloverItem.itemStock?.quantity ?? 10, 0);
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
