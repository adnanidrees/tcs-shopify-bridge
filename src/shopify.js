import crypto from 'crypto';

export function verifyShopifyHmac(env, rawBody, receivedHmac) {
  const secret = env.SHOPIFY_WEBHOOK_SECRET || '';
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
    line_items: (payload.line_items || []).map(li => ({
      id: li.id, sku: li.sku, title: li.title, quantity: li.quantity, price: String(li.price ?? '0')
    }))
  };
}
