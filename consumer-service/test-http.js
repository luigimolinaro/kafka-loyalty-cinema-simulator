const express = require('express');
const app = express();
const PORT = process.env.HTTP_PORT || 3001;

console.log('Starting test HTTP server...');
console.log(`PORT: ${PORT}`);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
  console.log(`Test: http://localhost:${PORT}/health`);
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

console.log('After app.listen() call');
