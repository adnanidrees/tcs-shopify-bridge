// --- Shopify minimal ping (shop.json) ---
app.get("/api/shopify/ping", async (_req, res) => {
  try {
    const STORE = (process.env.SHOPIFY_STORE_URL || "").trim();
    const API_VERSION = (process.env.SHOPIFY_API_VERSION || "2024-10").trim();
    const TOKEN = (process.env.SHOPIFY_ADMIN_TOKEN || "").trim();

    if (!STORE || !API_VERSION || !TOKEN) {
      return res.status(500).json({ ok:false, error:"Missing envs" });
    }

    const url = `https://${STORE}/admin/api/${API_VERSION}/shop.json`;
    const r = await fetch(url, { headers: { "X-Shopify-Access-Token": TOKEN } });

    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }

    if (!r.ok) {
      return res.status(r.status).json({ ok:false, status:r.status, data });
    }
    return res.json({ ok:true, shop: data?.shop?.name || data });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e) });
  }
});
