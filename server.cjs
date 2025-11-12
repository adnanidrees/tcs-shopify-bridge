const express = require("express");
const fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));
const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => res.send("OK - tcs-shopify-bridge running"));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// --- Shopify test: read 1 product ---
app.get("/api/shopify/ping", async (_req, res) => {
  try {
    const url = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION}/products.json?limit=1`;
    const r = await fetch(url, {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN }
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const data = await r.json();
    res.json({ ok: true, count: data.products?.length ?? 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Create TCS shipment (example) ---
app.post("/api/tcs/create-shipment", async (req, res) => {
  try {
    const payload = req.body; // {orderId, name, address, phone, ...}
    // TODO: map to TCS fields
    const r = await fetch(`${process.env.TCS_BASE_URL}/shipments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: data || await r.text() });
    res.json({ ok: true, tcs: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Shopify order webhook (optional) ---
app.post("/webhooks/orders/create", async (req, res) => {
  // verify HMAC later; for now just 200
  console.log("Order webhook:", req.body?.id);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on", PORT));
