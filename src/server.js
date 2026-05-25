import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { business, menu } from './data/menu.js';
import { createOrder, getInventoryAvailabilityTable, getInventoryAvailabilityTableFromOrders, getOrderingSnapshot } from './ordering.js';
import { isSupabaseEnabled, loadPersistedOrderingSnapshot, persistOrder } from './database/supabase.js';

const port = process.env.PORT || 3000;
const root = join(process.cwd(), 'public');
const maxRequestBodySize = 1024 * 1024;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function serveStaticFile(response, filePath) {
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'text/plain; charset=utf-8' });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    let inventoryAvailabilityTable = getInventoryAvailabilityTable();
    let snapshot = getOrderingSnapshot();

    if (isSupabaseEnabled()) {
      try {
        const persisted = await loadPersistedOrderingSnapshot();
        inventoryAvailabilityTable = getInventoryAvailabilityTableFromOrders(persisted.orders);
        snapshot = {
          business,
          menu,
          inventoryAvailabilityTable,
          rewardsMembers: persisted.rewardsMembers,
          orders: persisted.orders,
        };
      } catch (error) {
        return sendJson(response, 500, { error: error.message });
      }
    }

    return sendJson(response, 200, {
      business,
      menu,
      inventoryAvailabilityTable,
      snapshot,
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/orders') {
    let body = '';
    let bodySize = 0;
    let bodyTooLarge = false;
    request.on('data', (chunk) => {
      if (bodyTooLarge) {
        return;
      }
      bodySize += chunk.length;
      if (bodySize > maxRequestBodySize) {
        bodyTooLarge = true;
        if (!response.writableEnded) {
          sendJson(response, 413, { error: 'Request body exceeds the 1 MB limit.' });
        }
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      if (bodyTooLarge) {
        return;
      }
      try {
        const payload = JSON.parse(body || '{}');
        const order = createOrder(payload);

        if (isSupabaseEnabled()) {
          persistOrder(order, payload.rewardsMemberId)
            .then(() => sendJson(response, 201, order))
            .catch((error) => sendJson(response, 500, { error: error.message }));
          return;
        }

        sendJson(response, 201, order);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
    });
    return;
  }

  const filePath = url.pathname === '/' ? join(root, 'index.html') : join(root, url.pathname);
  return serveStaticFile(response, filePath);
});

server.listen(port, () => {
  console.log(`Burger Bus ordering app is running on http://localhost:${port}`);
});
