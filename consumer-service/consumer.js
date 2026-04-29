const { Kafka } = require('kafkajs');
const express = require('express');
const cors = require('cors');
const redis = require('redis');

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'points-events';
const CONSUMER_GROUP = process.env.CONSUMER_GROUP || 'points-processor';
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3001', 10);
const REDIS_HOST = process.env.REDIS_HOST || 'redis.kafka.svc.cluster.local';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// Force stdout to flush immediately
process.stdout.write('='.repeat(50) + '\n');
process.stdout.write('🚀 Starting Points Consumer Service with Redis\n');
process.stdout.write(`📡 HTTP_PORT: ${HTTP_PORT}\n`);
process.stdout.write(`📦 REDIS: ${REDIS_HOST}:${REDIS_PORT}\n`);
process.stdout.write('='.repeat(50) + '\n');

// Redis client setup
const redisClient = redis.createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT
  }
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('✅ Redis connected'));

// Kafka setup
const kafka = new Kafka({
  clientId: 'points-consumer',
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const consumer = kafka.consumer({ 
  groupId: CONSUMER_GROUP,
  sessionTimeout: 30000,
  heartbeatInterval: 3000
});

// Redis helper functions
async function getUserPoints(userId) {
  const points = await redisClient.get(`user:${userId}:points`);
  return points ? parseInt(points) : 0;
}

async function setUserPoints(userId, points) {
  await redisClient.set(`user:${userId}:points`, points.toString());
}

async function addUserTransaction(userId, transaction) {
  await redisClient.rPush(`user:${userId}:history`, JSON.stringify(transaction));
}

async function getUserHistory(userId) {
  const history = await redisClient.lRange(`user:${userId}:history`, 0, -1);
  return history.map(h => JSON.parse(h));
}

async function getAllUsers() {
  const users = [];
  
  try {
    console.log('🔍 Scanning Redis for user keys...');
    console.log('🔍 Redis client status:', redisClient.isOpen ? 'OPEN' : 'CLOSED');
    
    // Use SCAN instead of KEYS for better performance
    const iterator = redisClient.scanIterator({
      MATCH: 'user:*:points',
      COUNT: 100
    });
    
    console.log('🔍 Created iterator');
    
    for await (const key of iterator) {
      console.log('🔑 Found key:', key);
      const userId = key.split(':')[1];
      const points = await getUserPoints(userId);
      const name = await redisClient.get(`user:${userId}:name`) || userId;
      const history = await getUserHistory(userId);
      console.log(`👤 User ${userId} (${name}): ${points} points, ${history.length} transactions`);
      users.push({
        userId,
        name,
        points,
        transactionCount: history.length
      });
    }
    console.log(`✅ Found ${users.length} total users`);
  } catch (error) {
    console.error('❌ Error scanning Redis:', error);
    console.error('❌ Error stack:', error.stack);
    throw error;
  }
  
  return users.sort((a, b) => b.points - a.points);
}

// Process event
async function processPointsEvent(event) {
  const { eventId, userId, points, action, collectionPoint, timestamp, source } = event;
  const currentPoints = await getUserPoints(userId);
  const newPoints = currentPoints + points;
  
  await setUserPoints(userId, newPoints);
  
  const transaction = {
    eventId, points, action, collectionPoint, timestamp,
    source: source || 'online',
    previousBalance: currentPoints, newBalance: newPoints
  };
  
  await addUserTransaction(userId, transaction);
  
  console.log(`✅ Processed event ${eventId}`);
  console.log(`   User: ${userId}, Action: ${action}, Points: ${points}`);
  console.log(`   Collection Point: ${collectionPoint}`);
  console.log(`   Balance: ${currentPoints} → ${newPoints}`);
  console.log(`   ---`);
  
  return { userId, previousBalance: currentPoints, newBalance: newPoints, pointsAdded: points };
}

// Handle late events
function handleLateEvent(event) {
  const eventTime = new Date(event.timestamp);
  const now = new Date();
  const delaySeconds = (now - eventTime) / 1000;
  
  if (delaySeconds > 60) {
    console.warn(`⚠️  Late event: ${event.eventId}, Delay: ${delaySeconds.toFixed(2)}s`);
  }
  
  return delaySeconds;
}

// Main consumer logic
async function runConsumer() {
  try {
    await consumer.connect();
    console.log('✅ Kafka consumer connected');
    console.log(`📍 Consumer Group: ${CONSUMER_GROUP}`);
    console.log(`🔗 Kafka Broker: ${KAFKA_BROKER}`);
    console.log(`📨 Kafka Topic: ${KAFKA_TOPIC}`);
    console.log('---');
    
    await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
    
    console.log(`📥 Subscribed to topic: ${KAFKA_TOPIC}`);
    console.log('🎧 Waiting for events...');
    console.log('---');
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          const delay = handleLateEvent(event);
          await processPointsEvent(event);
          if (delay > 5) {
            console.log(`⏰ Event processed with ${delay.toFixed(2)}s delay`);
          }
        } catch (error) {
          console.error('❌ Error processing message:', error);
        }
      }
    });
  } catch (error) {
    console.error('❌ Fatal error in consumer:', error);
    process.exit(1);
  }
}

// HTTP API
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'consumer-service', redis: redisClient.isOpen }));

app.get('/api/users', async (req, res) => {
  try {
    console.log('📊 Fetching all users from Redis...');
    const users = await getAllUsers();
    console.log(`📊 Found ${users.length} users`);
    const totalPoints = users.reduce((sum, u) => sum + u.points, 0);
    res.json({
      users,
      totalUsers: users.length,
      totalPoints
    });
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { userId, name, initialPoints } = req.body;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required and must be a string' });
    }
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required and must be a string' });
    }
    
    // Check if user already exists
    const existingPoints = await redisClient.get(`user:${userId}:points`);
    if (existingPoints !== null) {
      return res.status(409).json({ error: 'User already exists', userId });
    }
    
    // Create user with initial points (default 0) and name
    const points = typeof initialPoints === 'number' ? initialPoints : 0;
    await redisClient.set(`user:${userId}:points`, points);
    await redisClient.set(`user:${userId}:name`, name);
    await redisClient.sAdd('users', userId);
    
    console.log(`✅ Created user: ${userId} (${name}) with ${points} points`);
    
    res.json({
      success: true,
      userId,
      name,
      points,
      message: `User ${name} created successfully`
    });
  } catch (error) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const points = await getUserPoints(userId);
    
    if (points === 0) {
      const history = await getUserHistory(userId);
      if (history.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
    }
    
    const name = await redisClient.get(`user:${userId}:name`) || userId;
    const history = await getUserHistory(userId);
    res.json({
      userId,
      name,
      points,
      transactionCount: history.length,
      history: history.reverse()
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.delete('/api/reset', async (req, res) => {
  try {
    console.log('🗑️  Resetting database...');
    
    // Get all user keys
    const userKeys = [];
    for await (const key of redisClient.scanIterator({
      MATCH: 'user:*',
      COUNT: 100
    })) {
      userKeys.push(key);
    }
    
    // Delete all user keys
    if (userKeys.length > 0) {
      await redisClient.del(userKeys);
      console.log(`🗑️  Deleted ${userKeys.length} keys from Redis`);
    }
    
    res.json({
      success: true,
      message: `Database reset successfully. Deleted ${userKeys.length} keys.`,
      keysDeleted: userKeys.length
    });
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    res.status(500).json({ error: 'Failed to reset database', details: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const users = await getAllUsers();
    const allHistory = [];
    
    for (const user of users) {
      const history = await getUserHistory(user.userId);
      allHistory.push(...history.map(tx => ({ ...tx, userId: user.userId })));
    }
    
    const pointStats = {};
    allHistory.forEach(tx => {
      if (!pointStats[tx.collectionPoint]) {
        pointStats[tx.collectionPoint] = { count: 0, totalPoints: 0 };
      }
      pointStats[tx.collectionPoint].count++;
      pointStats[tx.collectionPoint].totalPoints += tx.points;
    });
    
    res.json({
      totalUsers: users.length,
      totalTransactions: allHistory.length,
      totalPoints: users.reduce((sum, u) => sum + u.points, 0),
      collectionPoints: pointStats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const users = await getAllUsers();
    const allHistory = [];
    
    for (const user of users) {
      const history = await getUserHistory(user.userId);
      allHistory.push(...history.map(tx => ({ ...tx, userId: user.userId })));
    }
    
    // Sort by timestamp descending (most recent first)
    allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      transactions: allHistory.slice(0, limit),
      total: allHistory.length
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Graceful shutdown
let server;
async function shutdown() {
  console.log('🛑 Shutting down...');
  if (server) server.close(() => console.log('✅ HTTP server closed'));
  await consumer.disconnect();
  console.log('✅ Consumer disconnected');
  await redisClient.quit();
  console.log('✅ Redis disconnected');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start services
async function start() {
  try {
    // Connect to Redis first
    await redisClient.connect();
    console.log('✅ Redis client connected');
    
    // Start HTTP server
    process.stdout.write('🌐 Starting HTTP server...\n');
    server = app.listen(HTTP_PORT, '0.0.0.0', () => {
      process.stdout.write('✅ HTTP API listening on port ' + HTTP_PORT + '\n');
      process.stdout.write('   Health: http://localhost:' + HTTP_PORT + '/health\n');
      process.stdout.write('   Users: http://localhost:' + HTTP_PORT + '/api/users\n');
      process.stdout.write('   Stats: http://localhost:' + HTTP_PORT + '/api/stats\n');
      process.stdout.write('   Reset: DELETE http://localhost:' + HTTP_PORT + '/api/reset\n');
      process.stdout.write('='.repeat(50) + '\n');
      
      // Start Kafka consumer after HTTP is ready
      runConsumer().catch(err => {
        console.error('❌ Failed to start consumer:', err);
        process.exit(1);
      });
    });

    server.on('error', (err) => {
      process.stdout.write('❌ HTTP server error: ' + err.message + '\n');
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
  }
}

start();
