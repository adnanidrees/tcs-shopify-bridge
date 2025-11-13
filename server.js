// server.js
const app = require('./src/app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server up on', PORT);
});

// optional hardening so crashes show in logs instead of killing silently
process.on('unhandledRejection', err => console.error('unhandledRejection', err));
process.on('uncaughtException',  err => console.error('uncaughtException', err));
