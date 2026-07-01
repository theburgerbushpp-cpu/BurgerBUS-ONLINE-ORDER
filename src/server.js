import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { business, menu, setMenu } from './data/menu.js';
import { addCartItem, checkoutCart, createCart, createOrder, getInventoryAvailabilityTable, getOrderingSnapshot } from './ordering.js';
import { fetchCloverMenu, processCloverCartPayment } from './clover.js';

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

function buildCheckoutProcessor() {
  if (!CLOVER_MERCHANT_ID || !CLOVER_TOKEN) {
    return undefined;
  }

  return (context) =>
    processCloverCartPayment({
      merchantId: CLOVER_MERCHANT_ID,
      token: CLOVER_TOKEN,
      ...context,
    });
}

function readJsonBody(request, response) {
  return new Promise((resolve, reject) => {
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
        reject(new Error('REQUEST_TOO_LARGE'));
        return;
      }

      body += chunk;
    });

    request.on('end', () => {
      if (bodyTooLarge) {
        return;
      }

      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
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
    return sendJson(response, 200, {
      business,
      menu,
      inventoryAvailabilityTable: getInventoryAvailabilityTable(),
      snapshot: getOrderingSnapshot(),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/carts') {
    try {
      const payload = await readJsonBody(request, response);
      const cart = createCart(payload);
      return sendJson(response, 201, {
        cart,
        inventoryAvailabilityTable: getInventoryAvailabilityTable(),
      });
    } catch (error) {
      if (error.message === 'REQUEST_TOO_LARGE') {
        return;
      }
      return sendJson(response, 400, { error: error.message });
    }
  }

  const cartItemMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/carts\/([^/]+)\/items$/) : null;
  if (cartItemMatch) {
    try {
      const payload = await readJsonBody(request, response);
      const cart = addCartItem(cartItemMatch[1], payload.item ?? payload);
      return sendJson(response, 200, {
        cart,
        inventoryAvailabilityTable: getInventoryAvailabilityTable(),
      });
    } catch (error) {
      if (error.message === 'REQUEST_TOO_LARGE') {
        return;
      }
      return sendJson(response, 400, { error: error.message });
    }
  }

  const cartCheckoutMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/carts\/([^/]+)\/checkout$/) : null;
  if (cartCheckoutMatch) {
    try {
      const payload = await readJsonBody(request, response);
      const order = await checkoutCart(cartCheckoutMatch[1], payload, {
        processPayment: buildCheckoutProcessor(),
      });
      return sendJson(response, 201, {
        order,
        inventoryAvailabilityTable: getInventoryAvailabilityTable(),
      });
    } catch (error) {
      if (error.message === 'REQUEST_TOO_LARGE') {
        return;
      }
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/orders') {
    try {
      const payload = await readJsonBody(request, response);
      const order = createOrder(payload);
      return sendJson(response, 201, order);
    } catch (error) {
      if (error.message === 'REQUEST_TOO_LARGE') {
        return;
      }
      return sendJson(response, 400, { error: error.message });
    }
  }

  const filePath = url.pathname === '/' ? join(root, 'index.html') : join(root, url.pathname);
  return serveStaticFile(response, filePath);
});

const { CLOVER_MERCHANT_ID, CLOVER_API_TOKEN, CLOVER_ACCESS_TOKEN } = process.env;
const CLOVER_TOKEN = CLOVER_API_TOKEN || CLOVER_ACCESS_TOKEN;

if (CLOVER_MERCHANT_ID && CLOVER_TOKEN) {
  try {
    const cloverMenu = await fetchCloverMenu(CLOVER_MERCHANT_ID, CLOVER_TOKEN);
    if (cloverMenu.length > 0) {
      setMenu(cloverMenu);
      console.log(`Loaded ${cloverMenu.length} item(s) from Clover merchant ${CLOVER_MERCHANT_ID}.`);
    } else {
      console.warn('Clover returned no items. Using fallback demo menu.');
    }
  } catch (error) {
    console.error(`Failed to load Clover menu: ${error.message}. Using fallback demo menu.`);
  }
} else {
  console.log('CLOVER_MERCHANT_ID and Clover token not set (CLOVER_API_TOKEN or CLOVER_ACCESS_TOKEN). Using fallback demo menu.');
}

server.listen(port, () => {
  console.log(`Burger Bus ordering app is running on http://localhost:${port}`);
});
