import express from 'express';
import bodyParser from 'body-parser';
import { verifyShopifyHmac, normalizeOrder } from './shopify.js';
import { makeBridge } from './bridge.js';
import { all as allShipments } from './store.js';

async function loadEnv() {
  try {
    const mod = await import('dotenv');
    const dotenv = mod?.default || mod;
    if (dotenv?.config) dotenv.config();
  } catch (err) {
    if (process.env.DEBUG_ENV) {
      console.warn('dotenv not loaded', err);
    }
  }
}

await loadEnv();

const env = process.env;
const app = express();

let cron;
try {
  const mod = await import('node-cron');
  cron = mod?.default || mod;
} catch (err) {
  if (process.env.DEBUG_ENV) {
    console.warn('node-cron not loaded', err);
  }
}

app.use('/webhooks/shopify/orders/create', bodyParser.raw({ type: '*/*' }));
app.use(bodyParser.json());

const bridge = makeBridge(env);

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/debug/env', (req, res) => {
  res.json({
    MODE: env.MODE || '',
    ECOM_BASE_URL: env.ECOM_BASE_URL || '',
    ECOM_BEARER_len: (env.ECOM_BEARER || '').length,
    TCS_BASE_URL: env.TCS_BASE_URL || '',
    TCS_BEARER_len: (env.TCS_BEARER || '').length,
    STORER_CODE: env.STORER_CODE || '',
    WH_CODE: env.WH_CODE || '',
    PROJECT_CODE: env.PROJECT_CODE || '',
    SHIPPER_CODE: env.SHIPPER_CODE || ''
  });
});

app.get('/shipments', async (_req, res) => {
  const rows = await allShipments();
  res.json({ ok: true, rows });
});

app.post('/tasks/sync', async (req, res) => {
  try {
    const result = await bridge.syncPendingShipments({ notifyCustomer: req.body?.notifyCustomer !== false });
    res.json({ ok: true, synced: result.length, rows: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/test/order', express.json(), async (req, res) => {
  try {
    const order = normalizeOrder(req.body || {});
    const record = await bridge.handleShopifyOrder(order);
    res.json({ ok: true, test: true, order, record });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/webhooks/shopify/orders/create', async (req, res) => {
  try {
    const hmac = req.get('x-shopify-hmac-sha256') || '';
    const rawBody = req.body?.length ? req.body : Buffer.from([]);
    if (!verifyShopifyHmac(env, rawBody, hmac)) return res.status(401).json({ ok: false, error: 'Invalid HMAC' });

    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const order = normalizeOrder(payload);

    const record = await bridge.handleShopifyOrder(order);

    res.json({ ok: true, order, record });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const cronSchedule = env.CRON_SYNC_SCHEDULE || '0 11,18 * * *';
if (cronSchedule && cron?.schedule) {
  cron.schedule(cronSchedule, async () => {
    try {
      await bridge.syncPendingShipments();
    } catch (err) {
      console.error('Cron sync failed', err);
    }
  });
} else if (cronSchedule) {
  console.warn('Cron not scheduled because node-cron is unavailable.');
}

const PORT = Number(env.PORT || 8090);
app.listen(PORT, () => console.log(`Bridge listening on :${PORT}`));
