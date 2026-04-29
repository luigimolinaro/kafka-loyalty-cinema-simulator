# Cinema Points System - Event-Driven Architecture Workshop

A complete event-driven application demonstrating microservices architecture with Apache Kafka, Redis database, and real-time event processing for managing customer loyalty points across cinema locations.

## 🎯 Overview

This workshop implements a cinema points collection system with:
- **Frontend UI** with landing page, simulator, and admin dashboard
- **Backend API** for transaction processing and Kafka event production
- **Redis Database** for persistent data storage
- **Consumer Service** for Kafka event processing and API queries
- **Kafka** as event streaming backbone
- **Kubernetes** deployment on kind/k3s

## 📋 Architecture

```
Browser (Simulator) → Backend API → Kafka → Consumer Service → Redis
                                                                  ↓
                                                            Dashboard API
```

**Complete Flow:**
1. User submits transaction in Simulator
2. Backend API validates and sends event to Kafka
3. Kafka stores event in topic (points-events)
4. Consumer Service processes event from Kafka
5. Consumer Service updates Redis database
6. Dashboard queries Consumer Service API
7. Consumer Service reads from Redis and returns data

## 🚀 Quick Start

### Prerequisites
- Docker
- kubectl
- Kubernetes cluster (kind, k3s, or minikube)
- Strimzi Kafka Operator installed

### One-Command Deployment

```bash
# Clone and deploy
cd /Users/lmolinaro/owldev/kafka-workshop
./deploy.sh
```

The script will:
1. ✅ Check prerequisites (kubectl, docker)
2. ✅ Detect cluster type (kind/k3s/colima)
3. ✅ Deploy/verify Kafka cluster
4. ✅ Create Kafka topic (points-events)
5. ✅ Build Docker images (backend-api, consumer-service, frontend)
6. ✅ Load images to cluster
7. ✅ Deploy Redis database
8. ✅ Deploy all services
9. ✅ Wait for pods to be ready
10. ✅ Display access information

### Access the Application

```bash
# Start port-forwarding (single command - only frontend needed)
kubectl port-forward -n kafka svc/frontend 8080:80

# Open in browser
open http://localhost:8080
```

**Architecture Note:** The frontend uses nginx as a reverse proxy to route API requests internally within the Kubernetes cluster. This eliminates the need for multiple port-forwards and follows DevOps best practices:

- **Frontend (nginx)**: Serves static files and proxies API requests
- **Internal routing**: 
  - `/api/consumer/*` → `consumer-service.kafka.svc.cluster.local:3001`
  - `/api/backend/*` → `backend-api.kafka.svc.cluster.local:3000`
- **Benefits**: 
  - Single port-forward required
  - No CORS issues
  - Internal service discovery via Kubernetes DNS
  - Production-ready architecture

## 📦 Project Structure

```
kafka-workshop/
├── frontend/                  # Web UI (Nginx + Static Files)
│   ├── index.html            # Landing page with navigation
│   ├── dashboard.html        # Admin dashboard (real-time stats)
│   ├── simulate.html         # Cinema simulator (points manager)
│   └── Dockerfile
├── backend-api/              # Backend API (Kafka Producer)
│   ├── server.js             # Express API + Kafka producer
│   ├── package.json
│   └── Dockerfile
├── consumer-service/         # Kafka Consumer + API
│   ├── consumer.js           # Event processor + REST API
│   ├── package.json
│   ├── Dockerfile
│   └── k8s-deployment.yaml
├── k8s/                      # Kubernetes manifests
│   ├── kafka-topic.yaml
│   ├── frontend.yaml
│   ├── backend-api.yaml
│   └── redis.yaml
├── kafka/                    # Kafka configuration
│   └── kafka-cluster.yaml
├── deploy.sh                 # Automated deployment script
├── README.md                 # This file
└── ARCHITECTURE.md           # Detailed architecture docs
```

## 🎮 Using the Application

### 1. Landing Page (index.html)

The home page provides two main options:

- **📊 Dashboard** - View real-time statistics from Redis
- **🎭 Simulate Cinemas** - Manage points for two cinema locations

### 2. Cinema Simulator (simulate.html)

**Features:**
- Two cinema cards: Cinema Artimondo (Milan) and Cinema Paradiso (Rome)
- User management with search/autocomplete (localStorage)
- Add or remove points via Backend API
- Online/Offline mode toggle with queue
- Transaction history (last 5)
- Reset database button (clears Redis + localStorage)

**How to Use:**

1. **Create/Select User**
   ```
   - Type user ID (e.g., "mario.rossi")
   - If new, user is created automatically with 0 points
   - If exists, current balance is displayed from localStorage
   ```

2. **Add Points**
   ```
   - Select "Add Points"
   - Enter amount (e.g., 100)
   - Click "Submit Transaction"
   - Event sent to Backend API → Kafka → Consumer → Redis
   - Balance updates in localStorage for UI display
   ```

3. **Remove Points**
   ```
   - Select "Remove Points"
   - Enter amount (e.g., 50)
   - System validates sufficient balance
   - Click "Submit Transaction"
   - Event processed through full pipeline
   ```

4. **Offline Mode**
   ```
   - Click "Go Offline" button
   - Cinema card gets red border
   - Transactions are queued locally
   - Click "Go Online" to sync all queued transactions
   - Or use "Sync Now" button to sync manually
   ```

5. **Reset Database**
   ```
   - Click "🗑️ Reset Database" button
   - Confirm the action
   - Clears all data from Redis (via API)
   - Clears localStorage
   - All users and points are deleted
   ```

### 3. Admin Dashboard (dashboard.html)

**Features:**
- Real-time statistics from Consumer Service API (Redis data)
- Auto-refresh every 5 seconds (toggle on/off)
- User leaderboard sorted by points
- Collection point statistics
- Detailed user transaction history modal
- Reset database button (clears Redis)

**Statistics Displayed:**
- Total users
- Total points distributed
- Total transactions
- Active collection points

**Interactive Features:**
- Click any user to see detailed transaction history
- Manual refresh button
- Auto-refresh toggle
- Reset database with confirmation

## 🔧 Technical Details

### Backend API

**Endpoints:**
- `GET /health` - Health check
- `POST /api/points` - Submit transaction

**Request Format:**
```json
{
  "userId": "mario.rossi",
  "points": 100,
  "action": "add",
  "cinema": "Cinema Artimondo"
}
```

**Response Format:**
```json
{
  "success": true,
  "eventId": "uuid-v4",
  "message": "Added 100 points to mario.rossi"
}
```

### Consumer Service API

**Endpoints:**
- `GET /health` - Health check (includes Redis status)
- `GET /api/users` - List all users with points
- `GET /api/users/:userId` - Get user details and history
- `GET /api/stats` - Get system statistics
- `DELETE /api/reset` - Reset database (delete all Redis keys)

**Example Response (GET /api/users):**
```json
{
  "users": [
    {
      "userId": "mario.rossi",
      "points": 150,
      "transactionCount": 5
    }
  ],
  "totalUsers": 1,
  "totalPoints": 150
}
```

### Redis Database

**Data Structure:**
```
user:{userId}:points → String (integer)
  Example: "user:mario.rossi:points" → "150"

user:{userId}:history → List (JSON strings)
  Example: "user:mario.rossi:history" →
  [
    "{\"eventId\":\"...\",\"points\":100,...}",
    "{\"eventId\":\"...\",\"points\":50,...}"
  ]
```

**Operations:**
- `GET user:{userId}:points` - Get user balance
- `SET user:{userId}:points {value}` - Update balance
- `RPUSH user:{userId}:history {json}` - Add transaction
- `LRANGE user:{userId}:history 0 -1` - Get all transactions
- `SCAN 0 MATCH user:*:points` - List all users
- `DEL user:*` - Reset database

**Configuration:**
- Max Memory: 256MB
- Eviction Policy: allkeys-lru
- Persistence: RDB snapshots (15min/1 change, 5min/10 changes, 1min/10k changes)
- Storage: EmptyDir (ephemeral for development)

### Kafka Events

**Event Structure:**
```json
{
  "eventId": "uuid-v4",
  "userId": "mario.rossi",
  "points": 100,
  "action": "add",
  "collectionPoint": "Cinema Artimondo",
  "timestamp": "2026-04-29T10:00:00.000Z"
}
```

**Topic Configuration:**
- Name: points-events
- Partitions: 3
- Replication: 1
- Retention: 7 days

## 🧪 Testing Scenarios

### Scenario 1: Basic Points Management
```bash
1. Open simulator: http://localhost:8080/simulate.html
2. Enter user ID: "test-user-1"
3. Select "Add Points", enter 100
4. Submit - verify balance shows 100
5. Open dashboard: http://localhost:8080/dashboard.html
6. Verify user appears with 100 points
7. Return to simulator
8. Select "Remove Points", enter 30
9. Submit - verify balance shows 70
10. Refresh dashboard - verify updated balance
```

### Scenario 2: Offline Mode
```bash
1. Click "Go Offline" on Cinema Artimondo
2. Add 50 points for "test-user-2"
3. Add 30 points for "test-user-2"
4. Verify queue shows 2 transactions
5. Click "Go Online"
6. Verify transactions are synced
7. Check dashboard - verify user has 80 points
```

### Scenario 3: Real-time Dashboard
```bash
1. Open dashboard in one browser tab
2. Open simulator in another tab
3. Enable auto-refresh on dashboard
4. Add points in simulator
5. Watch dashboard update automatically
6. Click on user in dashboard
7. View detailed transaction history
```

### Scenario 4: Database Reset
```bash
1. Create multiple users with points
2. Verify data in dashboard
3. Click "Reset Database" in dashboard
4. Confirm action
5. Verify all data is cleared
6. Check simulator - localStorage also cleared
7. Verify Redis is empty:
   kubectl exec -it redis-pod -n kafka -- redis-cli KEYS "user:*"
```

### Scenario 5: Event Flow Verification
```bash
# Terminal 1: Watch consumer logs
kubectl logs -n kafka -l app=consumer-service -f

# Terminal 2: Submit transaction
curl -X POST http://localhost:3000/api/points \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","points":100,"action":"add","cinema":"Test Cinema"}'

# Terminal 1: Verify event processing
# Should see: "✅ Processed event {eventId}"

# Terminal 3: Check Redis
kubectl exec -it redis-pod -n kafka -- redis-cli GET "user:test-user:points"
# Should return: "100"

# Terminal 4: Query API
curl http://localhost:3001/api/users/test-user
# Should return user with 100 points
```

## 📊 Monitoring

### View Consumer Logs
```bash
kubectl logs -n kafka -l app=consumer-service -f
```

### View Backend API Logs
```bash
kubectl logs -n kafka -l app=backend-api -f
```

### Check Redis Data
```bash
# List all user keys
kubectl exec -it redis-pod -n kafka -- redis-cli KEYS "user:*"

# Get user points
kubectl exec -it redis-pod -n kafka -- redis-cli GET "user:mario.rossi:points"

# Get user history
kubectl exec -it redis-pod -n kafka -- redis-cli LRANGE "user:mario.rossi:history" 0 -1

# Check Redis info
kubectl exec -it redis-pod -n kafka -- redis-cli INFO
```

### Check Kafka Topics
```bash
kubectl exec -it kafka-cluster-broker-0 -n kafka -- \
  bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list
```

### View Kafka Messages
```bash
kubectl exec -it kafka-cluster-broker-0 -n kafka -- \
  bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic points-events \
  --from-beginning
```

### Check Consumer Group
```bash
kubectl exec -it kafka-cluster-broker-0 -n kafka -- \
  bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group points-processor \
  --describe
```

## ✅ Verification Checklist

After deployment, verify:

```bash
# 1. All pods running
kubectl get pods -n kafka
# Expected: frontend, backend-api, consumer-service, redis, kafka-cluster-broker-0 all Running

# 2. Services accessible
kubectl get svc -n kafka
# Expected: All services with ClusterIP

# 3. Port-forwards active
lsof -i :8080
lsof -i :3000
lsof -i :3001
# Expected: kubectl processes listening

# 4. Frontend accessible
curl -I http://localhost:8080
# Expected: HTTP/1.1 200 OK

# 5. Backend API accessible
curl http://localhost:3000/health
# Expected: {"status":"ok","service":"backend-api"}

# 6. Consumer API accessible
curl http://localhost:3001/health
# Expected: {"status":"ok","service":"consumer-service","redis":true}

# 7. Redis accessible
kubectl exec -it redis-pod -n kafka -- redis-cli ping
# Expected: PONG

# 8. Test full flow
curl -X POST http://localhost:3000/api/points \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","points":100,"action":"add","cinema":"Test"}'
# Expected: {"success":true,"eventId":"..."}

sleep 2

curl http://localhost:3001/api/users
# Expected: User "test" with 100 points

# 9. Test simulator
# - Open http://localhost:8080/simulate.html
# - Create user and add points
# - Verify balance updates

# 10. Test dashboard
# - Open http://localhost:8080/dashboard.html
# - Verify statistics display
# - Check auto-refresh works
```

## 🔧 Troubleshooting

### Frontend Not Loading

```bash
# Check pod status
kubectl describe pod -n kafka -l app=frontend

# Check logs
kubectl logs -n kafka -l app=frontend

# Verify port-forward
lsof -i :8080
```

### Backend API Not Responding

```bash
# Check pod status
kubectl get pods -n kafka -l app=backend-api

# Check logs
kubectl logs -n kafka -l app=backend-api -f

# Test API directly
kubectl port-forward -n kafka svc/backend-api 3000:3000
curl http://localhost:3000/health
```

### Consumer Service Not Processing

```bash
# Check pod status
kubectl get pods -n kafka -l app=consumer-service

# Check logs (look for event processing)
kubectl logs -n kafka -l app=consumer-service -f

# Test API
curl http://localhost:3001/health
curl http://localhost:3001/api/users
```

### Redis Connection Issues

```bash
# Check Redis pod
kubectl get pods -n kafka -l app=redis

# Test Redis connectivity
kubectl exec -it redis-pod -n kafka -- redis-cli ping

# Check Redis logs
kubectl logs -n kafka -l app=redis

# Verify consumer can connect
kubectl logs -n kafka -l app=consumer-service | grep Redis
```

### Kafka Connection Issues

```bash
# Check Kafka cluster
kubectl get kafka -n kafka

# Check broker pods
kubectl get pods -n kafka | grep kafka-cluster

# Test connectivity
kubectl exec -it kafka-cluster-broker-0 -n kafka -- \
  bin/kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092
```

### Events Not Being Processed

```bash
# Check if events are in Kafka
kubectl exec -it kafka-cluster-broker-0 -n kafka -- \
  bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic points-events \
  --from-beginning

# Check consumer group lag
kubectl exec -it kafka-cluster-broker-0 -n kafka -- \
  bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group points-processor \
  --describe

# Check consumer logs for errors
kubectl logs -n kafka -l app=consumer-service | grep -i error
```

## 🧹 Cleanup

### Reset Data Only (Recommended for Testing)

```bash
# Option 1: Via Dashboard UI (Easiest)
# - Open http://localhost:8080/dashboard.html
# - Click "🗑️ Reset Database" button
# - Confirm action
# This clears all Redis data via API

# Option 2: Via API
curl -X DELETE http://localhost:3001/api/reset

# Option 3: Via Redis CLI
kubectl exec -it $(kubectl get pod -n kafka -l app=redis -o jsonpath='{.items[0].metadata.name}') -n kafka -- redis-cli FLUSHDB

# Option 4: Clear localStorage only (from Simulator)
# - Open http://localhost:8080/simulate.html
# - Click "🗑️ Reset Database" button
# This only clears browser localStorage, not Redis
```

### Remove Application Components (Selective)

```bash
# Remove only the application services (keeps Kafka and Redis)
kubectl delete deployment frontend backend-api consumer-service -n kafka
kubectl delete service frontend backend-api consumer-service -n kafka

# Remove Redis only
kubectl delete deployment redis -n kafka
kubectl delete service redis -n kafka
kubectl delete configmap redis-config -n kafka

# Remove Kafka topic only
kubectl delete kafkatopic points-events -n kafka
```

### Complete Cleanup (Use with Caution)

```bash
# Remove all application resources
kubectl delete deployment frontend backend-api consumer-service redis -n kafka
kubectl delete service frontend backend-api consumer-service redis -n kafka
kubectl delete configmap redis-config -n kafka
kubectl delete kafkatopic points-events -n kafka

# Optional: Remove Kafka cluster (takes time to recreate)
kubectl delete kafka kafka-cluster -n kafka

# Optional: Remove entire namespace (removes everything including Strimzi operator)
kubectl delete namespace kafka
```

### Quick Restart (Without Losing Data)

```bash
# Restart all pods to reload code changes
kubectl rollout restart deployment frontend -n kafka
kubectl rollout restart deployment backend-api -n kafka
kubectl rollout restart deployment consumer-service -n kafka
kubectl rollout restart deployment redis -n kafka

# Wait for rollout to complete
kubectl rollout status deployment frontend -n kafka
kubectl rollout status deployment backend-api -n kafka
kubectl rollout status deployment consumer-service -n kafka
kubectl rollout status deployment redis -n kafka
```

## 📚 Learning Objectives

This workshop teaches:

1. **Event-Driven Architecture**
   - Asynchronous communication between services
   - Event sourcing patterns
   - Decoupling of services
   - Event replay capabilities

2. **Microservices Patterns**
   - Service separation and boundaries
   - API design and REST principles
   - Resilience and fault tolerance
   - Database per service pattern

3. **Kafka Fundamentals**
   - Topics and partitions
   - Producers and consumers
   - Consumer groups and offset management
   - Event ordering and delivery guarantees

4. **Redis Database**
   - Key-value storage patterns
   - Data structures (Strings, Lists)
   - Persistence strategies (RDB snapshots)
   - SCAN operations for efficient key iteration

5. **Kubernetes Deployment**
   - Container orchestration
   - Service discovery via DNS
   - Configuration management
   - Health checks and probes

6. **Real-World Scenarios**
   - Handling network failures (offline mode)
   - Late event processing
   - Data consistency strategies
   - Reset and recovery procedures

7. **Full-Stack Development**
   - Frontend UI with vanilla JavaScript
   - Backend API with Express
   - Event processing with KafkaJS
   - Database integration with Redis

## 🎓 Next Steps

### Enhancements

1. **Add Persistence**
   - Replace EmptyDir with PersistentVolume for Redis
   - Configure Redis AOF for better durability
   - Implement backup and restore procedures

2. **Add Authentication**
   - User login system with JWT
   - API key authentication for services
   - Role-based access control (RBAC)

3. **Add Monitoring**
   - Prometheus metrics for all services
   - Grafana dashboards for visualization
   - Alert rules for critical issues
   - Distributed tracing with Jaeger

4. **Scale Services**
   - Multiple backend API replicas
   - Multiple consumer service replicas
   - Redis cluster for horizontal scaling
   - Load balancing with Ingress

5. **Add More Features**
   - Point expiration policies
   - Rewards catalog and redemption
   - Transaction reports and analytics
   - Email notifications for events
   - Batch processing for bulk operations

### Advanced Topics

- Event sourcing with complete event replay
- CQRS (Command Query Responsibility Segregation)
- Saga patterns for distributed transactions
- Stream processing with Kafka Streams
- Change Data Capture (CDC) from databases
- Multi-region deployment strategies

## 📖 Additional Resources

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture documentation with diagrams
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Strimzi Documentation](https://strimzi.io/docs/)
- [KafkaJS Documentation](https://kafka.js.org/)
- [Redis Documentation](https://redis.io/documentation)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Event-Driven Architecture Patterns](https://martinfowler.com/articles/201701-event-driven.html)

## 🤝 Contributing

This is an educational project. Feel free to:
- Report issues
- Suggest improvements
- Add new features
- Improve documentation
- Share your learning experience

## 📄 License

This project is for educational purposes.

---

**Happy Learning! 🎓**

For questions or issues, please check the troubleshooting section or review the detailed architecture documentation in ARCHITECTURE.md.# kafka-loyalty-cinema-simulator
