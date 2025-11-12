// server.cjs  — minimal Express server for Render
const express = require("express");
const app = express();

app.use(express.json());

// health + root routes
app.get("/healthz", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.send("OK - tcs-shopify-bridge running"));

// (optional) mount your existing routes here
// const router = require("./src/your-routes.cjs");
// app.use("/api", router);

// IMPORTANT: listen on Render’s port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
