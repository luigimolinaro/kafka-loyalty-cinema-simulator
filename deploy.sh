#!/bin/bash

set -e

echo "🚀 Cinema Points System - Deployment Script"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl not found${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ docker not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Detect cluster type
echo "🔍 Detecting Kubernetes cluster type..."
CLUSTER_TYPE="unknown"

if command -v kind &> /dev/null && kind get clusters 2>/dev/null | grep -q .; then
    CLUSTER_TYPE="kind"
    CLUSTER_NAME=$(kind get clusters | head -1)
    echo -e "${BLUE}  Detected: kind cluster '${CLUSTER_NAME}'${NC}"
elif command -v k3s &> /dev/null; then
    CLUSTER_TYPE="k3s"
    echo -e "${BLUE}  Detected: k3s cluster${NC}"
elif command -v colima &> /dev/null && colima status &> /dev/null; then
    CLUSTER_TYPE="colima"
    echo -e "${BLUE}  Detected: colima${NC}"
else
    echo -e "${YELLOW}  Could not detect cluster type. Assuming generic Kubernetes.${NC}"
fi
echo ""

# Check Kafka cluster
echo "🔍 Checking Kafka cluster..."
if kubectl get kafka kafka-cluster -n kafka &> /dev/null; then
    echo -e "${GREEN}✅ Kafka cluster found${NC}"
else
    echo -e "${YELLOW}⚠️  Kafka cluster not found. Deploying...${NC}"
    kubectl apply -f kafka/kafka-cluster.yaml
    echo "⏳ Waiting for Kafka cluster to be ready (this may take 2-3 minutes)..."
    kubectl wait --for=condition=ready kafka/kafka-cluster -n kafka --timeout=300s || {
        echo -e "${RED}❌ Kafka cluster failed to become ready${NC}"
        echo "Check logs with: kubectl logs -n kafka kafka-cluster-broker-0"
        exit 1
    }
    echo -e "${GREEN}✅ Kafka cluster ready${NC}"
fi
echo ""

# Create Kafka topic
echo "📨 Creating Kafka topic..."
kubectl apply -f k8s/kafka-topic.yaml
sleep 5
echo -e "${GREEN}✅ Topic created${NC}"
echo ""

# Build Docker images
echo "🔨 Building Docker images..."
echo ""

echo "  📦 Building backend-api..."
cd backend-api
docker build -t backend-api:latest . > /dev/null 2>&1 || {
    echo -e "${RED}❌ Failed to build backend-api${NC}"
    exit 1
}
cd ..
echo -e "${GREEN}  ✅ backend-api built${NC}"

echo "  📦 Building consumer-service..."
cd consumer-service
docker build -t points-consumer-service:latest . > /dev/null 2>&1 || {
    echo -e "${RED}❌ Failed to build consumer-service${NC}"
    exit 1
}
cd ..
echo -e "${GREEN}  ✅ consumer-service built${NC}"

echo "  📦 Creating frontend ConfigMaps..."
kubectl create configmap frontend-html -n kafka \
    --from-file=frontend/index.html \
    --from-file=frontend/dashboard.html \
    --from-file=frontend/simulate.html \
    --from-file=frontend/users.html \
    --dry-run=client -o yaml | kubectl apply -f - > /dev/null 2>&1 || {
    echo -e "${RED}❌ Failed to create frontend-html ConfigMap${NC}"
    exit 1
}

kubectl create configmap frontend-nginx-conf -n kafka \
    --from-file=frontend/nginx.conf \
    --dry-run=client -o yaml | kubectl apply -f - > /dev/null 2>&1 || {
    echo -e "${RED}❌ Failed to create frontend-nginx-conf ConfigMap${NC}"
    exit 1
}
echo -e "${GREEN}  ✅ Frontend ConfigMaps created${NC}"

echo ""
echo -e "${GREEN}✅ All images built and ConfigMaps created${NC}"
echo ""

# Load images to cluster
echo "📦 Loading images to cluster..."

case $CLUSTER_TYPE in
    "kind")
        echo "  Loading to kind cluster..."
        kind load docker-image backend-api:latest --name $CLUSTER_NAME || {
            echo -e "${RED}❌ Failed to load backend-api to kind${NC}"
            exit 1
        }
        kind load docker-image points-consumer-service:latest --name $CLUSTER_NAME || {
            echo -e "${RED}❌ Failed to load consumer-service to kind${NC}"
            exit 1
        }
        ;;
    "k3s")
        echo "  Loading to k3s..."
        docker save backend-api:latest | sudo k3s ctr images import - || {
            echo -e "${RED}❌ Failed to load backend-api to k3s${NC}"
            exit 1
        }
        docker save points-consumer-service:latest | sudo k3s ctr images import - || {
            echo -e "${RED}❌ Failed to load consumer-service to k3s${NC}"
            exit 1
        }
        ;;
    "colima")
        echo "  Images available in colima"
        ;;
    *)
        echo -e "${YELLOW}  ⚠️  Unknown cluster type. Images may need manual loading.${NC}"
        ;;
esac

echo -e "${GREEN}✅ Images loaded${NC}"
echo ""

# Deploy services
echo "🚢 Deploying services..."
echo ""

echo "  Deploying Redis..."
kubectl apply -f k8s/redis.yaml || {
    echo -e "${RED}❌ Failed to deploy Redis${NC}"
    exit 1
}

echo "  Deploying backend-api..."
kubectl apply -f k8s/backend-api.yaml || {
    echo -e "${RED}❌ Failed to deploy backend-api${NC}"
    exit 1
}

echo "  Deploying consumer-service..."
kubectl apply -f k8s/consumer-service.yaml || {
    echo -e "${RED}❌ Failed to deploy consumer-service${NC}"
    exit 1
}

echo "  Deploying frontend..."
kubectl apply -f k8s/frontend.yaml || {
    echo -e "${RED}❌ Failed to deploy frontend${NC}"
    exit 1
}

echo ""
echo "⏳ Waiting for pods to be ready..."

# Wait for Redis
kubectl wait --for=condition=ready pod -l app=redis -n kafka --timeout=120s || {
    echo -e "${RED}❌ redis pod failed to become ready${NC}"
    echo "Check logs with: kubectl logs -n kafka -l app=redis"
    exit 1
}
echo -e "${GREEN}  ✅ redis ready${NC}"

# Wait for backend-api
kubectl wait --for=condition=ready pod -l app=backend-api -n kafka --timeout=120s || {
    echo -e "${RED}❌ backend-api pod failed to become ready${NC}"
    echo "Check logs with: kubectl logs -n kafka -l app=backend-api"
    exit 1
}
echo -e "${GREEN}  ✅ backend-api ready${NC}"

# Wait for consumer-service
kubectl wait --for=condition=ready pod -l app=consumer-service -n kafka --timeout=120s || {
    echo -e "${RED}❌ consumer-service pod failed to become ready${NC}"
    echo "Check logs with: kubectl logs -n kafka -l app=consumer-service"
    exit 1
}
echo -e "${GREEN}  ✅ consumer-service ready${NC}"

# Wait for frontend
kubectl wait --for=condition=ready pod -l app=frontend -n kafka --timeout=120s || {
    echo -e "${RED}❌ frontend pod failed to become ready${NC}"
    echo "Check logs with: kubectl logs -n kafka -l app=frontend"
    exit 1
}
echo -e "${GREEN}  ✅ frontend ready${NC}"

echo ""
echo -e "${GREEN}✅ All services deployed${NC}"
echo ""

# Show status
echo "📊 Deployment Status:"
echo "===================="
kubectl get pods -n kafka | grep -E "redis|backend-api|consumer-service|frontend|kafka-cluster"
echo ""

# Show access info
echo "🌐 Access Information:"
echo "====================="
echo ""
echo -e "${BLUE}To access the application, run these commands in separate terminals:${NC}"
echo ""
echo "  # Terminal 1: Frontend"
echo "  kubectl port-forward -n kafka svc/frontend 8080:80"
echo ""
echo "  # Terminal 2: Consumer Service API"
echo "  kubectl port-forward -n kafka svc/consumer-service 3001:3001"
echo ""
echo -e "${BLUE}Then open in your browser:${NC}"
echo "  🏠 Home Page:    http://localhost:8080"
echo "  📊 Dashboard:    http://localhost:8080/dashboard.html"
echo "  🎭 Simulator:    http://localhost:8080/simulate.html"
echo ""
echo -e "${BLUE}API Endpoints:${NC}"
echo "  Health:          http://localhost:3001/health"
echo "  Users:           http://localhost:3001/api/users"
echo "  Stats:           http://localhost:3001/api/stats"
echo ""
echo -e "${BLUE}View Logs:${NC}"
echo "  Backend API:     kubectl logs -n kafka -l app=backend-api -f"
echo "  Consumer:        kubectl logs -n kafka -l app=consumer-service -f"
echo "  Frontend:        kubectl logs -n kafka -l app=frontend -f"
echo "  Redis:           kubectl logs -n kafka -l app=redis -f"
echo "  Kafka:           kubectl logs -n kafka kafka-cluster-broker-0 -f"
echo ""

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "📚 See README.md for usage instructions and testing scenarios"
echo "📐 See ARCHITECTURE.md for detailed architecture documentation"