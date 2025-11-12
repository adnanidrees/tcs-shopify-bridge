const express = require("express");
const app = express();

app.get("/", (_req, res) => res.send("OK - tcs-shopify-bridge running"));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on", PORT));
