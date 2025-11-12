import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { verifyShopifyHmac, normalizeOrder } from './shopify.js';
import { makeTcs } from './tcs.js';
import { sendAdminMail } from './mailer.js';

dotenv.config();
const env = process.env;
const app = express();

app.use('/webhooks/shopify/orders/create', bodyParser.raw({ type: '*/*' }));
app.use(bodyParser.json());

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

// Manual test route (no HMAC)
app.post('/test/order', express.json(), async (req, res) => {
  try {
    const order = normalizeOrder(req.body || {});
    const tcs = makeTcs(env);
    const cn = await tcs.createCNFromOrder(order);

    await sendAdminMail(env,
      `TEST ORDER RECEIVED ${order.name || order.id}`,
      `Order: ${JSON.stringify(order, null, 2)}\nTCS: ${JSON.stringify(cn, null, 2)}`
    );

    res.json({ ok: true, test: true, order, cn });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Real Shopify webhook
app.post('/webhooks/shopify/orders/create', async (req, res) => {
  try {
    const hmac = req.get('x-shopify-hmac-sha256') || '';
    const rawBody = req.body?.length ? req.body : Buffer.from([]);
    if (!verifyShopifyHmac(env, rawBody, hmac)) return res.status(401).json({ ok: false, error: 'Invalid HMAC' });

    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const order = normalizeOrder(payload);

    const tcs = makeTcs(env);
    const cn = await tcs.createCNFromOrder(order);

    await sendAdminMail(env,
      `LIVE ORDER RECEIVED ${order.name || order.id}`,
      `Order: ${JSON.stringify(order, null, 2)}\nTCS: ${JSON.stringify(cn, null, 2)}`
    );

    res.json({ ok: true, order, cn });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const PORT = Number(env.PORT || 8090);
app.listen(PORT, () => console.log(`Bridge listening on :${PORT}`));
