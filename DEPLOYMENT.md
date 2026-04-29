# Deployment Guide

## Quick Start

### Deploy Everything
```bash
./deploy.sh
```

### Cleanup and Redeploy
```bash
./cleanup.sh
./deploy.sh
```

## Scripts

### deploy.sh
Automated deployment script that:
1. ✅ Checks prerequisites (kubectl, docker)
2. ✅ Detects cluster type (kind/k3s/colima)
3. ✅ Verifies/deploys Kafka cluster
4. ✅ Creates Kafka topic (points-events)
5. ✅ Builds Docker images (backend-api, consumer-service)
6. ✅ Creates frontend ConfigMaps (HTML files + nginx.conf)
7. ✅ Loads images to cluster
8. ✅ Deploys all services (Redis, Backend API, Consumer Service, Frontend)
9. ✅ Waits for pods to be ready
10. ✅ Displays access information

**Key Features:**
- Uses ConfigMaps for frontend files (no Docker build issues)
- Automatic cluster type detection
- Comprehensive error handling
- Color-coded output

### cleanup.sh
Interactive cleanup script that:
1. Removes application deployments
2. Removes application services
3. Removes ConfigMaps
4. Removes Kafka topic
5. Optionally removes Kafka cluster

**Usage:**
```bash
./cleanup.sh
```

The script will ask for confirmation before proceeding.

## Frontend Architecture

The frontend now uses **ConfigMaps** instead of custom Docker images:

```yaml
ConfigMaps:
  - frontend-html: Contains all HTML files
  - frontend-nginx-conf: Contains nginx configuration

Deployment:
  - Base image: nginx:alpine (official)
  - Mounts ConfigMaps as volumes
  - No custom Docker build required
```

**Benefits:**
- ✅ No Docker build issues
- ✅ Easy updates (just update ConfigMap)
- ✅ Faster deployments
- ✅ More reliable

## Troubleshooting

### Frontend not showing content
```bash
# Check ConfigMaps exist
kubectl get configmap -n kafka | grep frontend

# Verify pod is using ConfigMaps
kubectl describe pod -n kafka -l app=frontend

# Check mounted files
kubectl exec -n kafka deployment/frontend -- ls -la /usr/share/nginx/html/
```

### Images not loading to cluster
```bash
# For kind clusters
kind load docker-image <image>:latest --name <cluster-name>

# For k3s clusters
docker save <image>:latest | sudo k3s ctr images import -

# Verify images in cluster
kubectl exec -n kafka <pod-name> -- crictl images
```

### Pods not starting
```bash
# Check pod status
kubectl get pods -n kafka

# Check pod logs
kubectl logs -n kafka -l app=<service-name>

# Describe pod for events
kubectl describe pod -n kafka -l app=<service-name>
```

## Manual Deployment Steps

If you prefer manual deployment:

### 1. Create ConfigMaps
```bash
kubectl create configmap frontend-html -n kafka \
  --from-file=frontend/index.html \
  --from-file=frontend/dashboard.html \
  --from-file=frontend/simulate.html \
  --from-file=frontend/users.html

kubectl create configmap frontend-nginx-conf -n kafka \
  --from-file=frontend/nginx.conf
```

### 2. Build Images
```bash
cd backend-api && docker build -t backend-api:latest .
cd ../consumer-service && docker build -t consumer-service:latest .
```

### 3. Load Images to Cluster
```bash
# For kind
kind load docker-image backend-api:latest consumer-service:latest --name <cluster-name>

# For k3s
docker save backend-api:latest | sudo k3s ctr images import -
docker save consumer-service:latest | sudo k3s ctr images import -
```

### 4. Deploy Services
```bash
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/backend-api.yaml
kubectl apply -f consumer-service/k8s-deployment.yaml
kubectl apply -f k8s/frontend.yaml
```

### 5. Wait for Pods
```bash
kubectl wait --for=condition=ready pod -l app=redis -n kafka --timeout=120s
kubectl wait --for=condition=ready pod -l app=backend-api -n kafka --timeout=120s
kubectl wait --for=condition=ready pod -l app=consumer-service -n kafka --timeout=120s
kubectl wait --for=condition=ready pod -l app=frontend -n kafka --timeout=120s
```

## Updating Frontend Content

To update HTML files without redeploying:

```bash
# Update ConfigMap
kubectl create configmap frontend-html -n kafka \
  --from-file=frontend/index.html \
  --from-file=frontend/dashboard.html \
  --from-file=frontend/simulate.html \
  --from-file=frontend/users.html \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart frontend pods to pick up changes
kubectl rollout restart deployment frontend -n kafka
```

## Access Information

After deployment:

```bash
# Port-forward frontend
kubectl port-forward -n kafka svc/frontend 8080:80

# Access URLs
http://localhost:8080/              # Home
http://localhost:8080/dashboard.html # Dashboard
http://localhost:8080/simulate.html  # Simulator
```

## Cluster-Specific Notes

### kind
- Images must be loaded with `kind load docker-image`
- Cluster name detected automatically
- Fast image loading

### k3s
- Images loaded via `k3s ctr images import`
- Requires sudo for ctr command
- Direct access to node

### colima
- Images available directly
- No special loading required
- Works like Docker Desktop
