# Deployment, Service, Ingress, HPA, PDB

Placeholders (`<app>`, `<registry>`, `<tag>`, `<ns>`) stand for the repo's real names. Confirm apiVersions with `kubectl api-resources`.

## Production Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <app>
  namespace: <ns>
  labels:
    app.kubernetes.io/name: <app>
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: <app>
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: <app>
    spec:
      serviceAccountName: <app>
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        fsGroup: 10001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: <app>
          image: <registry>/<app>:<tag>
          ports:
            - containerPort: 8080
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { memory: 256Mi }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 5
            failureThreshold: 30
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 2
          envFrom:
            - configMapRef: { name: <app>-config }
          volumeMounts:
            - { name: tmp, mountPath: /tmp }
      volumes:
        - name: tmp
          emptyDir: {}
```

- `maxUnavailable: 0` with `maxSurge: 1` keeps full capacity during a rollout, and needs one spare pod's worth of requests in the cluster.
- `readOnlyRootFilesystem: true` needs an `emptyDir` for each path the app writes.
- The selector is immutable after creation. Don't change `matchLabels` in an edit.
- Use a pod's labels from the recommended `app.kubernetes.io/*` set so Services, NetworkPolicies, and dashboards select consistently.
- Handle SIGTERM in the app. The kubelet sends it, then waits `terminationGracePeriodSeconds` before SIGKILL. A short `preStop` sleep gives load balancers time to stop sending traffic.

## Resources by workload

| Workload | CPU request | Memory request | Notes |
| --- | --- | --- | --- |
| Web API | 100-250m | 128-256Mi | Memory limit about 1.5-2x the request |
| Worker or consumer | 250-500m | 256-512Mi | Memory limit equal to the request for predictable QoS |
| JVM | 500m-1 | 512Mi-2Gi | Leave headroom above the heap for metaspace and threads |
| Sidecar | 10-50m | 32-64Mi | Keep minimal |

These are starting points. Replace them with measured usage (`kubectl top pods`, then a metrics dashboard over a representative period).

- A limit with no request makes the request equal to the limit, which over-reserves capacity.
- Memory over the limit gets the container OOM-killed. CPU over the limit gets throttled.
- Equal requests and limits on every container give the pod the `Guaranteed` QoS class. A pod with no requests or limits is `BestEffort` and is evicted first.
- A namespace `ResourceQuota` and `LimitRange` set budgets and defaults so a single workload can't take the cluster.

## Service and Ingress

```yaml
apiVersion: v1
kind: Service
metadata:
  name: <app>
  namespace: <ns>
spec:
  selector:
    app.kubernetes.io/name: <app>
  ports:
    - port: 80
      targetPort: 8080
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <app>
  namespace: <ns>
spec:
  ingressClassName: <class>
  tls:
    - hosts: [<host>]
      secretName: <app>-tls
  rules:
    - host: <host>
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: <app>
                port: { number: 80 }
```

- A Service with no endpoints means the selector matches no ready pod. Check `kubectl get endpointslices -l kubernetes.io/service-name=<app>`.
- Controller-specific behavior (TLS redirects, certificate issuers) lives in annotations that differ per ingress controller. Read the installed controller's docs.

## HorizontalPodAutoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: <app>
  namespace: <ns>
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: <app> }
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
```

- Utilization is `usage / request`, so every container needs a CPU request, and the cluster needs metrics-server.
- When an HPA owns replica count, leave `spec.replicas` out of the Deployment manifest. A GitOps tool otherwise resets the count on every sync.

## PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: <app>
  namespace: <ns>
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: <app>
```

- Set only one of `minAvailable` and `maxUnavailable`.
- A PDB limits voluntary disruptions (drains, evictions). It doesn't protect against node failure.
- `minAvailable` equal to the replica count blocks every drain. Leave at least one pod of slack.
