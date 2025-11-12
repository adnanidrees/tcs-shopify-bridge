// server.js (ROOT)
const express = require("express");
const app = express();

app.use(express.json());

// ⬇️ Tumhare routes yahan:
app.get("/", (req, res) => res.send("OK"));
// eg: app.post("/tcs/create-order", handler);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("Local running on", PORT));
}

// Vercel serverless ke liye:
module.exports = app;
