// src/app.js
const express = require('express');

const app = express();

// simple health route (no auth)
app.get('/api/shopify/ping', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

module.exports = app;
