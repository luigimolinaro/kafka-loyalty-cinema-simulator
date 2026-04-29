# Cinema Points System - Architecture Documentation

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                               │
│                      (Browser - Port 8080)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Home Page   │  │  Dashboard   │  │  Simulator   │              │
│  │  (index.html)│  │(dashboard.html)│ │(simulate.html)│             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┴──────────────────┘                       │
│                            │                                          │
│                    ┌───────▼────────┐                                │
│                    │ Nginx Frontend │                                │
│                    │  (Port 8080)   │                                │
│                    │                │                                │
│                    │ Reverse Proxy: │                                │
│                    │ /api/consumer/ → Consumer Service (internal)    │
│                    │ /api/backend/  → Backend API (internal)         │
│                    └───────┬────────┘                                │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
                             │ (Internal Kubernetes Network)
                             │ (No port-forwards needed)
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌──────▼──────┐
│  Backend API   │  │ Consumer Service│  │   Redis     │
│  (Port 3000)   │  │   (Port 3001)   │  │  Database   │
│  Internal DNS: │  │  Internal DNS:  │  │ Internal:   │
│  backend-api.  │  │  consumer-      │  │ redis.kafka │
│  kafka.svc     │  │  service.kafka  │  │ .svc:6379   │
│                │  │                 │  │             │
│ - Kafka Prod.  │  │ - Kafka Cons.   │  │ - Users     │
│ - REST API     │  │ - Event Proc.   │  │ - Points    │
│                │  │ - Stats API     │  │ - History   │
└────────┬───────┘  └─────────┬───────┘  └──────▲──────┘
         │                    │                  │
         │                    │                  │
         │            ┌───────▼──────────────────┘
         │            │
    ┌────▼────────────▼────┐
    │   Kafka Cluster      │
    │   - Topic: points-   │
    │     events           │
    │   - Partitions: 3    │
    └──────────────────────┘
```

**Key Architecture Benefits:**
- ✅ **Single Port-Forward**: Only frontend (8080) needs to be exposed
- ✅ **No CORS Issues**: All API calls go through same origin (nginx proxy)
- ✅ **Internal Service Discovery**: Uses Kubernetes DNS for service routing
- ✅ **Production-Ready**: Follows DevOps best practices for microservices
- ✅ **Simplified Deployment**: No need to manage multiple port-forwards

## 📊 Detailed Component Architecture

### 1. Frontend Layer (Nginx + Static Files)

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Nginx)                      │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ index.html - Landing Page                        │   │
│  │ ├─ Dashboard Button → /dashboard.html            │   │
│  │ └─ Simulator Button → /simulate.html             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ dashboard.html - Admin Dashboard                 │   │
│  │ ├─ Real-time Stats (Consumer API)                │   │
│  │ ├─ User Leaderboard                              │   │
│  │ ├─ Collection Point Stats                        │   │
│  │ ├─ Auto-refresh (5s)                             │   │
│  │ ├─ User Detail Modal                             │   │
│  │ └─ Reset Database Button (Redis)                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ simulate.html - Cinema Simulator                 │   │
│  │ ├─ Two Cinema Cards (Artimondo, Paradiso)        │   │
│  │ ├─ User Search/Autocomplete (localStorage)       │   │
│  │ ├─ Add/Remove Points → Backend API               │   │
│  │ ├─ Online/Offline Toggle                         │   │
│  │ ├─ Transaction Queue (Offline Mode)              │   │
│  │ ├─ Transaction History                           │   │
│  │ └─ Reset Database Button (Redis + localStorage)  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Nginx Reverse Proxy Configuration                │   │
│  │                                                   │   │
│  │ location /api/consumer/ {                        │   │
│  │   proxy_pass http://consumer-service.kafka       │   │
│  │              .svc.cluster.local:3001/api/;       │   │
│  │ }                                                 │   │
│  │                                                   │   │
│  │ location /api/backend/ {                         │   │
│  │   proxy_pass http://backend-api.kafka            │   │
│  │              .svc.cluster.local:3000/;           │   │
│  │ }                                                 │   │
│  │                                                   │   │
│  │ Benefits:                                         │   │
│  │ ✅ Single port-forward (8080 only)               │   │
│  │ ✅ No CORS issues (same origin)                  │   │
│  │ ✅ Internal Kubernetes DNS routing               │   │
│  │ ✅ Production-ready architecture                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  Deployment: Kubernetes Pod + Service                    │
│  Port: 80 (internal), 8080 (port-forward)                │
└─────────────────────────────────────────────────────────┘
```

### 2. Backend API Layer

```
┌─────────────────────────────────────────────────────────┐
│              Backend API (Node.js + Express)             │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ REST API Endpoints                                │   │
│  │ ├─ GET  /health                                   │   │
│  │ └─ POST /api/points                               │   │
│  │    ├─ Validates transaction                       │   │
│  │    ├─ Creates event with UUID                     │   │
│  │    └─ Sends to Kafka                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Kafka Producer                                    │   │
│  │ ├─ Topic: points-events                           │   │
│  │ ├─ Key: userId (for partitioning)                 │   │
│  │ └─ Value: JSON event                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  Event Structure:                                        │
│  {                                                       │
│    eventId: "uuid",                                      │
│    userId: "string",                                     │
│    points: number (positive or negative),                │
│    action: "add" | "remove",                             │
│    collectionPoint: "Cinema Name",                       │
│    timestamp: "ISO 8601"                                 │
│  }                                                       │
│                                                           │
│  Deployment: Kubernetes Pod + Service                    │
│  Port: 3000 (internal only - accessed via nginx proxy)   │
│  External Access: http://localhost:8080/api/backend/     │
└─────────────────────────────────────────────────────────┘
```

### 3. Consumer Service Layer

```
┌─────────────────────────────────────────────────────────┐
│         Consumer Service (Node.js + KafkaJS)             │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Kafka Consumer                                    │   │
│  │ ├─ Group: points-processor                        │   │
│  │ ├─ Topic: points-events                           │   │
│  │ ├─ Auto-commit: true                              │   │
│  │ └─ Processing: Real-time event handling           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Event Processing Pipeline                         │   │
│  │ 1. Receive event from Kafka                       │   │
│  │ 2. Get current points from Redis                  │   │
│  │ 3. Calculate new balance                          │   │
│  │ 4. Update points in Redis                         │   │
│  │ 5. Add transaction to history (Redis List)        │   │
│  │ 6. Log processing confirmation                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ HTTP API (Express)                                │   │
│  │ ├─ GET    /health                                 │   │
│  │ ├─ GET    /api/users                              │   │
│  │ ├─ GET    /api/users/:userId                      │   │
│  │ ├─ GET    /api/stats                              │   │
│  │ └─ DELETE /api/reset (NEW!)                       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  Deployment: Kubernetes Pod + Service                    │
│  Port: 3001 (internal only - accessed via nginx proxy)   │
│  External Access: http://localhost:8080/api/consumer/    │
└─────────────────────────────────────────────────────────┘
```

### 4. Redis Database Layer

```
┌─────────────────────────────────────────────────────────┐
│                  Redis Database (v7)                     │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Data Structure                                    │   │
│  │                                                   │   │
│  │ user:{userId}:points → String (integer)           │   │
│  │   Example: "user:mario.rossi:points" → "150"     │   │
│  │                                                   │   │
│  │ user:{userId}:history → List (JSON strings)       │   │
│  │   Example: "user:mario.rossi:history" →          │   │
│  │   [                                               │   │
│  │     "{\"eventId\":\"...\",\"points\":100,...}",   │   │
│  │     "{\"eventId\":\"...\",\"points\":50,...}"     │   │
│  │   ]                                               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Operations                                        │   │
│  │ ├─ GET user:{userId}:points                       │   │
│  │ ├─ SET user:{userId}:points {value}               │   │
│  │ ├─ RPUSH user:{userId}:history {json}             │   │
│  │ ├─ LRANGE user:{userId}:history 0 -1              │   │
│  │ ├─ SCAN 0 MATCH user:*:points                     │   │
│  │ └─ DEL user:* (for reset)                         │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Configuration                                     │   │
│  │ ├─ Max Memory: 256MB                              │   │
│  │ ├─ Eviction Policy: allkeys-lru                   │   │
│  │ ├─ Persistence: RDB snapshots                     │   │
│  │ │  ├─ save 900 1 (15min, 1 change)                │   │
│  │ │  ├─ save 300 10 (5min, 10 changes)              │   │
│  │ │  └─ save 60 10000 (1min, 10k changes)           │   │
│  │ └─ Storage: EmptyDir (ephemeral for dev)          │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  Deployment: Kubernetes Pod + Service                    │
│  Port: 6379 (internal)                                   │
└─────────────────────────────────────────────────────────┘
```

### 5. Kafka Layer

```
┌─────────────────────────────────────────────────────────┐
│                  Kafka Cluster (Strimzi)                 │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Broker(s)                                         │   │
│  │ ├─ kafka-cluster-broker-0                         │   │
│  │ └─ Port: 9092 (internal)                          │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Topics                                            │   │
│  │ └─ points-events                                  │   │
│  │    ├─ Partitions: 3                               │   │
│  │    ├─ Replication: 1                              │   │
│  │    ├─ Retention: 7 days                           │   │
│  │    └─ Cleanup Policy: delete                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Consumer Groups                                   │   │
│  │ └─ points-processor                               │   │
│  │    ├─ Members: 1 (consumer-service)               │   │
│  │    ├─ Partition Assignment: RoundRobin            │   │
│  │    └─ Offset Management: Auto-commit              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  Deployment: Kubernetes StatefulSet                      │
│  Operator: Strimzi 0.45.0                                │
└─────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow Diagrams

### Transaction Flow (Add/Remove Points)

```
┌─────────────┐
│   Browser   │
│  (Simulator)│
└──────┬──────┘
       │ 1. POST /api/points
       │    {userId, points, action, cinema}
       ▼
┌─────────────┐
│ Backend API │
│             │
│ 2. Validate │
│ 3. Create   │
│    Event    │
└──────┬──────┘
       │ 4. Send to Kafka
       │    Topic: points-events
       ▼
┌─────────────┐
│   Kafka     │
│   Broker    │
└──────┬──────┘
       │ 5. Consume Event
       ▼
┌─────────────┐
│ Consumer    │
│ Service     │
│             │
│ 6. Process  │
│    Event    │
└──────┬──────┘
       │ 7. Update Redis
       │    - user:X:points
       │    - user:X:history
       ▼
┌─────────────┐
│   Redis     │
│  Database   │
└─────────────┘
```

### Dashboard Data Flow

```
┌─────────────┐
│   Browser   │
│ (Dashboard) │
└──────┬──────┘
       │ 1. GET /api/users
       │    GET /api/stats
       ▼
┌─────────────┐
│ Consumer    │
│ Service API │
│             │
│ 2. Query    │
│    Redis    │
└──────┬──────┘
       │ 3. SCAN user:*:points
       │    LRANGE user:X:history
       ▼
┌─────────────┐
│   Redis     │
│  Database   │
└──────┬──────┘
       │ 4. Return Data
       ▼
┌─────────────┐
│ Consumer    │
│ Service API │
│             │
│ 5. Format   │
│    Response │
└──────┬──────┘
       │ 6. JSON Response
       ▼
┌─────────────┐
│   Browser   │
│ (Dashboard) │
│             │
│ 7. Render   │
│    UI       │
└─────────────┘
```

### Reset Database Flow

```
┌─────────────┐
│   Browser   │
│(Simulator/  │
│ Dashboard)  │
└──────┬──────┘
       │ 1. User clicks "Reset Database"
       │ 2. Confirm dialog
       │ 3. DELETE /api/reset
       ▼
┌─────────────┐
│ Consumer    │
│ Service API │
│             │
│ 4. SCAN     │
│    user:*   │
└──────┬──────┘
       │ 5. Get all user keys
       ▼
┌─────────────┐
│   Redis     │
│  Database   │
└──────┬──────┘
       │ 6. DEL user:key1 user:key2 ...
       ▼
┌─────────────┐
│ Consumer    │
│ Service API │
│             │
│ 7. Return   │
│    Success  │
└──────┬──────┘
       │ 8. Success Response
       ▼
┌─────────────┐
│   Browser   │
│             │
│ 9. Clear    │
│ localStorage│
│ 10. Reload  │
│     UI      │
└─────────────┘
```

## 🔐 Security Considerations

### Current Implementation
- ✅ CORS enabled for API access
- ✅ Input validation on forms and API
- ✅ Balance validation (prevent negative)
- ✅ Confirmation dialogs for destructive actions
- ✅ Event ID generation (UUID v4)
- ✅ Redis connection authentication (if configured)

### Production Recommendations
- 🔒 Add authentication/authorization (JWT tokens)
- 🔒 Implement rate limiting (Redis-based)
- 🔒 Add request signing for API calls
- 🔒 Use HTTPS/TLS for all communications
- 🔒 Implement audit logging in Redis
- 🔒 Add data encryption at rest (Redis encryption)
- 🔒 Network policies in Kubernetes
- 🔒 Secret management for Redis passwords

## 📈 Scalability Considerations

### Current Architecture Strengths
- ✅ Event-driven design (Kafka)
- ✅ Stateless services (easy to scale)
- ✅ Redis for fast data access
- ✅ Kubernetes-native deployment

### Scaling Path

#### 1. Horizontal Scaling
```
┌─────────────────────────────────────────────────────────┐
│                 Load Balancer                           │
└─────────────┬───────────────┬───────────────┬───────────┘
              │               │               │
    ┌─────────▼─────┐ ┌───────▼─────┐ ┌───────▼─────┐
    │ Backend API   │ │ Backend API │ │ Backend API │
    │   Pod 1       │ │   Pod 2     │ │   Pod 3     │
    └─────────┬─────┘ └───────┬─────┘ └───────┬─────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Kafka Cluster   │
                    │   (3 Brokers)     │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼─────┐ ┌───────▼─────┐ ┌───────▼─────┐
    │ Consumer      │ │ Consumer    │ │ Consumer    │
    │ Service 1     │ │ Service 2   │ │ Service 3   │
    └─────────┬─────┘ └───────┬─────┘ └───────┬─────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Redis Cluster     │
                    │ (Master/Replica)  │
                    └───────────────────┘
```

#### 2. Database Scaling
- **Redis Cluster**: Sharding across multiple nodes
- **Redis Sentinel**: High availability with failover
- **Read Replicas**: Scale read operations
- **Backup Strategy**: Regular RDB/AOF backups

#### 3. Kafka Scaling
- **Multiple Brokers**: 3+ brokers for production
- **Topic Partitioning**: More partitions for parallelism
- **Consumer Groups**: Multiple consumer instances
- **Replication Factor**: 3 for fault tolerance

## 🚀 Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Kubernetes Cluster (kind/k3s)               │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Namespace: kafka                                 │    │
│  │                                                   │    │
│  │  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │   Frontend   │  │ Backend API  │            │    │
│  │  │   Pod        │  │   Pod        │            │    │
│  │  │              │  │              │            │    │
│  │  │ - Nginx      │  │ - Node.js    │            │    │
│  │  │ - Static     │  │ - Express    │            │    │
│  │  │   Files      │  │ - KafkaJS    │            │    │
│  │  └──────┬───────┘  └──────┬───────┘            │    │
│  │         │                  │                     │    │
│  │  ┌──────▼───────┐  ┌──────▼───────┐            │    │
│  │  │   Service    │  │   Service    │            │    │
│  │  │   (ClusterIP)│  │   (ClusterIP)│            │    │
│  │  │   Port: 80   │  │   Port: 3000 │            │    │
│  │  └──────────────┘  └──────────────┘            │    │
│  │                                                   │    │
│  │  ┌──────────────┐  ┌──────────────┐            │    │
│  │  │ Consumer     │  │   Redis      │            │    │
│  │  │ Service Pod  │  │   Pod        │            │    │
│  │  │              │  │              │            │    │
│  │  │ - Node.js    │  │ - Redis 7    │            │    │
│  │  │ - KafkaJS    │  │ - Config     │            │    │
│  │  │ - Redis      │  │ - Persistence│            │    │
│  │  └──────┬───────┘  └──────┬───────┘            │    │
│  │         │                  │                     │    │
│  │  ┌──────▼───────┐  ┌──────▼───────┐            │    │
│  │  │   Service    │  │   Service    │            │    │
│  │  │   (ClusterIP)│  │   (ClusterIP)│            │    │
│  │  │   Port: 3001 │  │   Port: 6379 │            │    │
│  │  └──────────────┘  └──────────────┘            │    │
│  │                                                   │    │
│  │  ┌──────────────────────────────────────────┐   │    │
│  │  │   Kafka Cluster (StatefulSet)            │   │    │
│  │  │   - kafka-cluster-broker-0               │   │    │
│  │  │   - Port: 9092                           │   │    │
│  │  │   - Topic: points-events                 │   │    │
│  │  └──────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  Port-forwards (for local access):                       │
│  - kubectl port-forward svc/frontend 8080:80             │
│  - kubectl port-forward svc/backend-api 3000:3000       │
│  - kubectl port-forward svc/consumer-service 3001:3001  │
└─────────────────────────────────────────────────────────┘
```

## 🎯 Key Features

### 1. Event Sourcing Architecture
- **Immutable Events**: All transactions stored as events in Kafka
- **Event Replay**: Can rebuild state from event log
- **Audit Trail**: Complete history of all operations
- **Temporal Queries**: Can query state at any point in time

### 2. CQRS (Command Query Responsibility Segregation)
- **Commands**: Backend API handles write operations
- **Queries**: Consumer Service API handles read operations
- **Separate Models**: Optimized for different use cases
- **Eventual Consistency**: Acceptable for this use case

### 3. Dual Storage Strategy
- **localStorage**: Fast, local storage for UI responsiveness
- **Redis**: Persistent, shared storage for production data
- **Synchronization**: Reset function clears both storages
- **Fallback**: UI works even if Redis is unavailable

### 4. Real-time Processing
- **Kafka Streaming**: Events processed in real-time
- **Auto-refresh**: Dashboard updates every 5 seconds
- **Live Updates**: Immediate feedback on transactions
- **Event Ordering**: Kafka ensures message ordering per partition

### 5. Reset Capability
- **Complete Reset**: Clears all data from Redis and localStorage
- **Confirmation**: User must confirm destructive action
- **API Endpoint**: DELETE /api/reset for programmatic access
- **Graceful Handling**: UI handles API failures gracefully

## 📝 Configuration

### Environment Variables

**Backend API:**
- `HTTP_PORT`: HTTP server port (default: 3000)
- `KAFKA_BROKER`: Kafka bootstrap server
- `KAFKA_TOPIC`: Topic name (default: points-events)
- `COLLECTION_POINT`: Service identifier

**Consumer Service:**
- `HTTP_PORT`: HTTP server port (default: 3001)
- `KAFKA_BROKER`: Kafka bootstrap server
- `KAFKA_TOPIC`: Topic name (default: points-events)
- `CONSUMER_GROUP`: Consumer group ID (default: points-processor)
- `REDIS_HOST`: Redis hostname
- `REDIS_PORT`: Redis port (default: 6379)

**Redis:**
- `REDIS_PASSWORD`: Authentication password (optional)
- `REDIS_DB`: Database number (default: 0)

### Kubernetes Resources

**Frontend:**
- Deployment: 1 replica, 64Mi memory, 50m CPU
- Service: ClusterIP, port 80

**Backend API:**
- Deployment: 1 replica, 256Mi memory, 200m CPU
- Service: ClusterIP, port 3000
- Probes: Liveness and readiness on /health

**Consumer Service:**
- Deployment: 1 replica, 256Mi memory, 200m CPU
- Service: ClusterIP, port 3001
- Probes: Liveness and readiness on /health

**Redis:**
- Deployment: 1 replica, 256Mi memory, 200m CPU
- Service: ClusterIP, port 6379
- Storage: EmptyDir (ephemeral for development)
- Config: Custom redis.conf with persistence settings

**Kafka:**
- StatefulSet: 1 broker, managed by Strimzi
- Service: ClusterIP, port 9092
- Storage: Ephemeral (for development)

## 🔍 Monitoring & Debugging

### Health Checks
```bash
# Frontend
curl http://localhost:8080/

# Backend API
curl http://localhost:3000/health

# Consumer Service
curl http://localhost:3001/health

# Redis
kubectl exec -it redis-pod -n kafka -- redis-cli ping
```

### Data Inspection
```bash
# Redis Keys
kubectl exec -it redis-pod -n kafka -- redis-cli KEYS "user:*"

# User Points
kubectl exec -it redis-pod -n kafka -- redis-cli GET "user:mario.rossi:points"

# User History
kubectl exec -it redis-pod -n kafka -- redis-cli LRANGE "user:mario.rossi:history" 0 -1

# Kafka Topics
kubectl exec -it kafka-cluster-broker-0 -n kafka -- \
  bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# Consumer Group Status
kubectl exec -it kafka-cluster-broker-0 -n kafka -- \
  bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group points-processor --describe
```

### Logs
```bash
# All services
kubectl logs -n kafka -l app=frontend -f
kubectl logs -n kafka -l app=backend-api -f
kubectl logs -n kafka -l app=consumer-service -f
kubectl logs -n kafka -l app=redis -f

# Kafka
kubectl logs -n kafka kafka-cluster-broker-0 -f
```

### Metrics
```bash
# Pod status
kubectl get pods -n kafka

# Resource usage
kubectl top pods -n kafka

# Service endpoints
kubectl get svc -n kafka

# Persistent volumes
kubectl get pv,pvc -n kafka
```

## 🎓 Learning Resources

This architecture demonstrates:

### Software Engineering Patterns
- **Event Sourcing**: Immutable event log as source of truth
- **CQRS**: Separate read and write models
- **Microservices**: Loosely coupled, independently deployable services
- **API Gateway Pattern**: Single entry point for client requests
- **Database per Service**: Each service owns its data

### Distributed Systems Concepts
- **Event-Driven Architecture**: Asynchronous communication
- **Eventual Consistency**: Acceptable for this domain
- **Partitioning**: Kafka topic partitions for scalability
- **Replication**: Data redundancy for fault tolerance
- **Load Balancing**: Distribute requests across instances

### DevOps & Infrastructure
- **Containerization**: Docker for packaging
- **Orchestration**: Kubernetes for deployment
- **Service Discovery**: Kubernetes DNS
- **Configuration Management**: ConfigMaps and environment variables
- **Health Monitoring**: Probes and health endpoints

### Data Management
- **NoSQL**: Redis for fast key-value storage
- **Message Queuing**: Kafka for reliable message delivery
- **Data Modeling**: Optimized for access patterns
- **Backup & Recovery**: Redis persistence strategies
- **Data Migration**: Event replay capabilities

This architecture provides a solid foundation for understanding modern, cloud-native application development with event-driven patterns and microservices.