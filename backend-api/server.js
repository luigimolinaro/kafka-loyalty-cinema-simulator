const express = require('express');
const cors = require('cors');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const redis = require('redis');

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'points-events';
const COLLECTION_POINT = process.env.COLLECTION_POINT || 'Cinema Backend';
const REDIS_HOST = process.env.REDIS_HOST || 'redis.kafka.svc.cluster.local';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// Redis client for cinema status tracking
const redisClient = redis.createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('✅ Redis connected'));
redisClient.on('ready', () => console.log('✅ Redis ready'));
redisClient.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));

console.log('='.repeat(50));
console.log('🚀 Starting Backend API Service');
console.log(`📡 HTTP_PORT: ${HTTP_PORT}`);
console.log(`🔗 KAFKA_BROKER: ${KAFKA_BROKER}`);
console.log(`📨 KAFKA_TOPIC: ${KAFKA_TOPIC}`);
console.log(`📍 COLLECTION_POINT: ${COLLECTION_POINT}`);
console.log('='.repeat(50));

// Kafka setup
const kafka = new Kafka({
  clientId: 'backend-api',
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer();

// Express setup
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'backend-api',
    collectionPoint: COLLECTION_POINT,
    redis: redisClient.isOpen
  });
});

// Cinema status management
app.post('/api/cinema-status', async (req, res) => {
  try {
    if (!redisClient.isOpen) {
      return res.status(503).json({ error: 'Redis not connected' });
    }
    
    const { cinema, status } = req.body;
    
    if (!cinema || !status) {
      return res.status(400).json({ error: 'cinema and status are required' });
    }
    
    if (!['online', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'status must be "online" or "offline"' });
    }
    
    await redisClient.set(`cinema:${cinema}:status`, status);
    console.log(`📡 Cinema status updated: ${cinema} → ${status}`);
    
    res.json({ success: true, cinema, status });
  } catch (error) {
    console.error('Error updating cinema status:', error);
    res.status(500).json({ error: 'Failed to update cinema status', details: error.message });
  }
});

app.get('/api/cinema-status/:cinema', async (req, res) => {
  try {
    if (!redisClient.isOpen) {
      return res.status(503).json({ error: 'Redis not connected' });
    }
    
    const { cinema } = req.params;
    const status = await redisClient.get(`cinema:${cinema}:status`) || 'online';
    res.json({ cinema, status });
  } catch (error) {
    console.error('Error getting cinema status:', error);
    res.status(500).json({ error: 'Failed to get cinema status', details: error.message });
  }
});

// Add/Remove points endpoint
app.post('/api/points', async (req, res) => {
  try {
    const { userId, points, action, cinema, source } = req.body;
    
    // Validation
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required and must be a string' });
    }
    
    if (!points || typeof points !== 'number' || points <= 0) {
      return res.status(400).json({ error: 'points must be a positive number' });
    }
    
    if (!action || !['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'action must be "add" or "remove"' });
    }
    
    // Check cinema status - reject if offline (infrastructure failure simulation)
    if (cinema && source !== 'synced') {
      if (!redisClient.isOpen) {
        console.log('⚠️ Redis not connected, allowing transaction');
      } else {
        const cinemaStatus = await redisClient.get(`cinema:${cinema}:status`);
        if (cinemaStatus === 'offline') {
          console.log(`❌ Rejected transaction from offline cinema: ${cinema}`);
          return res.status(503).json({ 
            error: 'Cinema is offline',
            message: 'Infrastructure failure: Cinema cannot communicate with backend',
            cinema: cinema,
            retry: true
          });
        }
      }
    }
    
    // Create event
    const event = {
      eventId: uuidv4(),
      userId,
      points: action === 'remove' ? -points : points,
      action,
      collectionPoint: cinema || COLLECTION_POINT,
      source: source || 'online',
      timestamp: new Date().toISOString()
    };
    
    // Send to Kafka
    await producer.send({
      topic: KAFKA_TOPIC,
      messages: [
        {
          key: userId,
          value: JSON.stringify(event)
        }
      ]
    });
    
    console.log(`✅ Event sent: ${event.eventId}`);
    console.log(`   User: ${userId}, Action: ${action}, Points: ${points}`);
    console.log(`   Cinema: ${event.collectionPoint}`);
    
    res.json({
      success: true,
      eventId: event.eventId,
      message: `${action === 'add' ? 'Added' : 'Removed'} ${points} points ${action === 'add' ? 'to' : 'from'} ${userId}`
    });
    
  } catch (error) {
    console.error('❌ Error processing request:', error);
    res.status(500).json({ 
      error: 'Failed to process points transaction',
      details: error.message 
    });
  }
});

// Graceful shutdown
let server;
async function shutdown() {
  console.log('🛑 Shutting down...');
  if (server) {
    server.close(() => console.log('✅ HTTP server closed'));
  }
  await producer.disconnect();
  console.log('✅ Kafka producer disconnected');
  await redisClient.quit();
  console.log('✅ Redis disconnected');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start service
async function start() {
  try {
    // Connect Redis first
    await redisClient.connect();
    console.log('✅ Redis connected for cinema status tracking');
    
    // Connect Kafka producer
    await producer.connect();
    console.log('✅ Kafka producer connected');
    
    // Start HTTP server
    server = app.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`✅ Backend API listening on port ${HTTP_PORT}`);
      console.log(`   Health: http://localhost:${HTTP_PORT}/health`);
      console.log(`   Points: POST http://localhost:${HTTP_PORT}/api/points`);
      console.log('='.repeat(50));
    });
    
    server.on('error', (err) => {
      console.error('❌ HTTP server error:', err.message);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Failed to start service:', error);
    process.exit(1);
  }
}

start();