# 🚀 Quick Start Guide

## Deploy Everything in 3 Steps

### 1. Run the deployment script

```bash
cd /Users/lmolinaro/owldev/kafka-workshop
./deploy.sh
```

This will:
- ✅ Check Kafka cluster (already running)
- ✅ Create Kafka topic
- ✅ Build Docker images
- ✅ Deploy all services
- ✅ Wait for pods to be ready

### 2. Access the Frontend

Start port-forwarding (keep this terminal open):
```bash
kubectl port-forward -n kafka svc/frontend 8080:80
```

Open your browser:
```
http://localhost:8080
```

> **Note**: Press Ctrl+C in the terminal to stop port-forwarding when done.

### 3. Test the Flow

1. **Add points from Point A** (online mode)
   - Select "Point A"
   - Enter User ID: `user123`
   - Enter Points: `100`
   - Select Action: `purchase`
   - Click "Add Points"

2. **Simulate offline mode with Point B**
   - Select "Point B (Offline Mode)"
   - Add points - they will be buffered
   - After 10 seconds, events are sent with delay

3. **Watch the consumer logs**
   ```bash
   kubectl logs -n kafka -l app=consumer-service -f
   ```

## Expected Output

Consumer logs should show:
```
✅ Processed event abc-123
   User: user123
   Action: purchase
   Points added: 100
   Collection Point: point-a
   Previous balance: 0
   New balance: 100
```

For Point B (delayed events):
```
⚠️  Late event detected: xyz-456
   Delay: 12.34 seconds
   Collection Point: point-b
```

## Troubleshooting

If something doesn't work:

```bash
# Check all pods
kubectl get pods -n kafka

# Check specific service logs
kubectl logs -n kafka -l app=backend-api -f
kubectl logs -n kafka -l app=consumer-service -f

# Restart a service
kubectl rollout restart deployment/backend-api-point-a -n kafka
```

## Clean Up

```bash
kubectl delete -f k8s/
```

---

**That's it! You now have a working event-driven system! 🎉**
