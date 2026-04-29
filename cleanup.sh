#!/bin/bash

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🧹 Cinema Points System - Cleanup Script"
echo "========================================"
echo ""

# Function to ask for confirmation
confirm() {
    read -p "$(echo -e ${YELLOW}$1${NC}) [y/N]: " response
    case "$response" in
        [yY][eE][sS]|[yY]) 
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Check if namespace exists
if ! kubectl get namespace kafka &> /dev/null; then
    echo -e "${YELLOW}⚠️  Namespace 'kafka' not found. Nothing to clean up.${NC}"
    exit 0
fi

echo "This script will remove:"
echo "  - Application deployments (frontend, backend-api, consumer-service, redis)"
echo "  - Application services"
echo "  - ConfigMaps (frontend-html, frontend-nginx-conf, redis-config)"
echo "  - Kafka topic (points-events)"
echo ""
echo -e "${BLUE}Note: Kafka cluster and Strimzi operator will be preserved${NC}"
echo ""

if ! confirm "Do you want to proceed with cleanup?"; then
    echo "Cleanup cancelled."
    exit 0
fi

echo ""
echo "🗑️  Starting cleanup..."
echo ""

# Delete deployments
echo "  Deleting deployments..."
kubectl delete deployment frontend backend-api consumer-service redis -n kafka 2>/dev/null || echo "    Some deployments not found (OK)"
echo -e "${GREEN}  ✅ Deployments deleted${NC}"

# Delete services
echo "  Deleting services..."
kubectl delete service frontend backend-api consumer-service redis -n kafka 2>/dev/null || echo "    Some services not found (OK)"
echo -e "${GREEN}  ✅ Services deleted${NC}"

# Delete ConfigMaps
echo "  Deleting ConfigMaps..."
kubectl delete configmap frontend-html frontend-nginx-conf redis-config -n kafka 2>/dev/null || echo "    Some ConfigMaps not found (OK)"
echo -e "${GREEN}  ✅ ConfigMaps deleted${NC}"

# Delete Kafka topic
echo "  Deleting Kafka topic..."
kubectl delete kafkatopic points-events -n kafka 2>/dev/null || echo "    Topic not found (OK)"
echo -e "${GREEN}  ✅ Kafka topic deleted${NC}"

echo ""
echo -e "${GREEN}✅ Cleanup complete!${NC}"
echo ""
echo "📊 Remaining resources in kafka namespace:"
kubectl get all -n kafka
echo ""
echo "To redeploy the application, run:"
echo "  ./deploy.sh"
echo ""

# Optional: Full cleanup including Kafka
echo ""
if confirm "Do you also want to remove Kafka cluster? (This will take time to recreate)"; then
    echo ""
    echo "  Deleting Kafka cluster..."
    kubectl delete kafka kafka-cluster -n kafka 2>/dev/null || echo "    Kafka cluster not found (OK)"
    echo -e "${GREEN}  ✅ Kafka cluster deleted${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Kafka cluster deleted. Next deployment will take 2-3 minutes to recreate it.${NC}"
fi

echo ""
echo "Done! 🎉"
