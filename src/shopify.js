import crypto from 'crypto';

let axiosModule;
try {
  const mod = await import('axios');
  axiosModule = mod?.default || mod;
} catch (err) {
  if (process.env.DEBUG_ENV) {
    console.warn('axios not loaded, falling back to fetch in shopify.js', err);
  }
}

export function verifyShopifyHmac(env, rawBody, receivedHmac) {
  if (String(env.VERIFY_HMAC ?? 'true').toLowerCase() === 'false') return true;
  const secret = env.SHOPIFY_WEBHOOK_SECRET || '';
  if (!secret) return true;
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(receivedHmac || '', 'utf8'));
}

export function normalizeOrder(payload) {
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    phone: payload.phone || payload?.shipping_address?.phone || payload?.billing_address?.phone || '',
    shipping_address: payload.shipping_address || {},
    billing_address: payload.billing_address || {},
    customer: payload.customer || {},
    line_items: (payload.line_items || []).map(li => ({
      id: li.id,
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      fulfillable_quantity: li.fulfillable_quantity ?? li.quantity ?? 0,
      price: String(li.price ?? '0'),
      grams: li.grams || 0
    }))
  };
}

function buildShopifyError(err, fallback) {
  if (!err) return fallback;
  if (err.response) {
    const status = err.response.status;
    const data = typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : String(err.response.data || '');
    return `${fallback} (HTTP ${status}): ${data}`;
  }
  if (err.request) return `${fallback}: no response from Shopify`;
  return `${fallback}: ${err.message || err}`;
}

export function makeShopifyAdmin(env) {
  const store = env.SHOPIFY_STORE || env.SHOPIFY_STORE_URL;
  const token = env.SHOPIFY_ADMIN_TOKEN;
  const version = env.SHOPIFY_API_VERSION || '2024-01';
  if (!store || !token) {
    return {
      async createFulfillment() {
        throw new Error('Shopify credentials missing');
      }
    };
  }

  const baseURL = `https://${store}/admin/api/${version}`;
  const http = axiosModule?.create
    ? axiosModule.create({
        baseURL,
        timeout: 20000,
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      })
    : null;

  async function createFulfillment({ orderId, lineItems = [], trackingNumber, trackingUrl, notifyCustomer = true }) {
    if (!orderId) throw new Error('orderId is required to create fulfillment');
    const payload = {
      fulfillment: {
        notify_customer: notifyCustomer,
        tracking_info: {
          number: trackingNumber || undefined,
          url: trackingUrl || undefined
        },
        tracking_numbers: trackingNumber ? [trackingNumber] : undefined,
        tracking_urls: trackingUrl ? [trackingUrl] : undefined,
        line_items: lineItems.map(item => ({ id: item.id, quantity: item.quantity }))
      }
    };
    if (!trackingNumber && !trackingUrl) {
      delete payload.fulfillment.tracking_info;
      delete payload.fulfillment.tracking_numbers;
      delete payload.fulfillment.tracking_urls;
    }
    if (env.SHOPIFY_LOCATION_ID) {
      payload.fulfillment.location_id = Number(env.SHOPIFY_LOCATION_ID);
    }
    try {
      if (http) {
        const { data } = await http.post(`/orders/${orderId}/fulfillments.json`, payload);
        return data?.fulfillment || data;
      }
      const url = `${baseURL}/orders/${orderId}/fulfillments.json`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) {
        const error = new Error('Failed to create Shopify fulfillment');
        error.response = { status: res.status, data };
        throw error;
      }
      return data?.fulfillment || data;
    } catch (err) {
      throw new Error(buildShopifyError(err, 'Failed to create Shopify fulfillment'));
    }
  }

  return { createFulfillment };
}
