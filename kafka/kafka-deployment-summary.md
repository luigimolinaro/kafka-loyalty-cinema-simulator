# Kafka Cluster Deployment Summary

## ✅ Deployment Status: SUCCESS

Your Kafka cluster has been successfully deployed in the `kafka` namespace using Strimzi Operator with KRaft mode (no Zookeeper).

## Cluster Configuration

### Architecture
- **Mode**: KRaft (Kafka Raft) - Modern consensus protocol
- **Kafka Version**: 4.2.0
- **Metadata Version**: 4.2-IV0
- **Namespace**: kafka

### Node Pools
1. **Broker Pool** (3 replicas)
   - Role: Data processing and client connections
   - Storage: 10Gi per broker (JBOD)
   - Resources: 2Gi RAM (request), 4Gi RAM (limit)
   - Node IDs: 0, 1, 2

2. **Controller Pool** (3 replicas)
   - Role: Cluster metadata management
   - Storage: 5Gi per controller (JBOD)
   - Resources: 1Gi RAM (request), 2Gi RAM (limit)
   - Node IDs: 3, 4, 5

### Listeners
- **Plain**: Port 9092 (internal, no TLS)
- **TLS**: Port 9093 (internal, with TLS)

### Kafka Configuration
- Replication Factor: 3
- Min In-Sync Replicas: 2
- Transaction State Log Replication: 3
- Log Retention: 168 hours (7 days)
- Log Segment Size: 1GB

## Deployed Resources

```bash
# Kafka Cluster
kafka.kafka.strimzi.io/kafka-cluster   READY=True

# Node Pools
kafkanodepool.kafka.strimzi.io/broker       3 replicas (broker)
kafkanodepool.kafka.strimzi.io/controller   3 replicas (controller)

# Pods
kafka-cluster-broker-0                      1/1 Running
kafka-cluster-broker-1                      1/1 Running
kafka-cluster-broker-2                      1/1 Running
kafka-cluster-controller-3                  1/1 Running
kafka-cluster-controller-4                  1/1 Running
kafka-cluster-controller-5                  1/1 Running
kafka-cluster-entity-operator               2/2 Running
strimzi-cluster-operator                    1/1 Running
```

## How to Use Your Kafka Cluster

### 1. Create a Test Topic

```bash
kubectl run kafka-producer -ti --image=quay.io/strimzi/kafka:0.45.0-kafka-4.2.0 --rm=true --restart=Never -n kafka -- bin/kafka-topics.sh --bootstrap-server kafka-cluster-kafka-bootstrap:9092 --create --topic test-topic --partitions 3 --replication-factor 3
```

### 2. List Topics

```bash
kubectl run kafka-producer -ti --image=quay.io/strimzi/kafka:0.45.0-kafka-4.2.0 --rm=true --restart=Never -n kafka -- bin/kafka-topics.sh --bootstrap-server kafka-cluster-kafka-bootstrap:9092 --list
```

### 3. Produce Messages

```bash
kubectl run kafka-producer -ti --image=quay.io/strimzi/kafka:0.45.0-kafka-4.2.0 --rm=true --restart=Never -n kafka -- bin/kafka-console-producer.sh --bootstrap-server kafka-cluster-kafka-bootstrap:9092 --topic test-topic
```

### 4. Consume Messages

```bash
kubectl run kafka-consumer -ti --image=quay.io/strimzi/kafka:0.45.0-kafka-4.2.0 --rm=true --restart=Never -n kafka -- bin/kafka-console-consumer.sh --bootstrap-server kafka-cluster-kafka-bootstrap:9092 --topic test-topic --from-beginning
```

### 5. Connect from Applications

**Bootstrap Server**: `kafka-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092`

Example connection string for applications in the same cluster:
```
kafka-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092
```

For TLS connections:
```
kafka-cluster-kafka-bootstrap.kafka.svc.cluster.local:9093
```

## Monitoring

### Check Cluster Status
```bash
kubectl get kafka -n kafka
kubectl get kafkanodepool -n kafka
kubectl get pods -n kafka
```

### View Logs
```bash
# Broker logs
kubectl logs -n kafka kafka-cluster-broker-0

# Controller logs
kubectl logs -n kafka kafka-cluster-controller-3

# Operator logs
kubectl logs -n kafka -l name=strimzi-cluster-operator
```

### Describe Kafka Resource
```bash
kubectl describe kafka kafka-cluster -n kafka
```

## Managing Topics and Users

### Create a KafkaTopic Resource
```yaml
apiVersion: kafka.strimzi.io/v1
kind: KafkaTopic
metadata:
  name: my-topic
  namespace: kafka
  labels:
    strimzi.io/cluster: kafka-cluster
spec:
  partitions: 3
  replicas: 3
  config:
    retention.ms: 604800000  # 7 days
    segment.bytes: 1073741824
```

### Create a KafkaUser Resource
```yaml
apiVersion: kafka.strimzi.io/v1
kind: KafkaUser
metadata:
  name: my-user
  namespace: kafka
  labels:
    strimzi.io/cluster: kafka-cluster
spec:
  authentication:
    type: tls
  authorization:
    type: simple
    acls:
      - resource:
          type: topic
          name: my-topic
        operations:
          - Read
          - Write
```

## Configuration Files

- **Cluster Definition**: `/Users/lmolinaro/kafka-cluster.yaml`
- **This Summary**: `/Users/lmolinaro/kafka-deployment-summary.md`

## Scaling

### Scale Brokers
```bash
kubectl patch kafkanodepool broker -n kafka --type merge -p '{"spec":{"replicas":5}}'
```

### Scale Controllers
```bash
kubectl patch kafkanodepool controller -n kafka --type merge -p '{"spec":{"replicas":5}}'
```

## Cleanup

To remove the Kafka cluster:
```bash
kubectl delete -f /Users/lmolinaro/kafka-cluster.yaml
helm uninstall strimzi-kafka-operator -n kafka
kubectl delete namespace kafka
```

## Additional Resources

- [Strimzi Documentation](https://strimzi.io/docs/operators/latest/)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [KRaft Mode Guide](https://kafka.apache.org/documentation/#kraft)
