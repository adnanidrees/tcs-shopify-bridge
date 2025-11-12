// api/index.js
const serverless = require("serverless-http");

// Agar app root ke server.js me export ho raha:
const app = require("../server");
// (Agar tumhara app kisi aur jagah hai to path adjust: e.g. "../src/app")

module.exports = (req, res) => serverless(app)(req, res);
