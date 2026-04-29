const express = require('express');
const cors = require('cors');

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3001', 10);

console.log('Starting simple HTTP server test...');
console.log(`Port: ${HTTP_PORT}`);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok', service: 'consumer-service-test' });
});

app.get('/api/users', (req, res) => {
  console.log('Users API requested');
  res.json({ users: [], totalUsers: 0, totalPoints: 0 });
});

const server = app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP server listening on port ${HTTP_PORT}`);
  console.log(`Test: curl http://localhost:${HTTP_PORT}/health`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

console.log('Server setup complete');
