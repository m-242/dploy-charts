# Webshell Helm Chart

A Helm chart for deploying web-accessible shell environments with network isolation and security controls.

## Overview

This chart deploys a containerized shell environment accessible via a web interface (tty2web). It provides:

- Isolated shell containers with persistent storage
- Web-based terminal access via tty2web
- Network isolation using NetworkPolicy
- RBAC controls for pod execution
- Configurable security contexts
- Two deployment modes: sidecar or separate deployment

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- StorageClass configured for persistent volumes (if persistence enabled)

## Architecture

The chart implements a dual-component architecture:

### Component 1: Container (StatefulSet)
- Main shell environment running as a StatefulSet
- Persistent storage via volumeClaimTemplate
- Network isolation with deny-all NetworkPolicy
- Restricted capabilities and security context

### Component 2: tty2web (Deployment or Sidecar)
- Web-based terminal interface
- Two deployment modes:
  - **Deployment mode** (default): Runs as separate Deployment, uses kubectl exec to access container
  - **Sidecar mode**: Runs as sidecar container in the same pod as the shell

## Installation

### Basic Installation

```sh
helm install my-webshell ./webshell
```

### Custom Installation

```sh
helm install my-webshell ./webshell \
  --set container.repository=my-registry.com/my-shell \
  --set container.tag=v1.0.0 \
  --set tty2web.deploymentMode=sidecar
```

### With Ingress

```sh
helm install my-webshell ./webshell \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=webshell.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

## Configuration

The following table lists the configurable parameters and their default values.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas (limited to 1) | `1` |
| **Container Configuration** |
| `container.repository` | Container image repository | `registry.aydev.cloud/challenges/training.shell.test1` |
| `container.tag` | Container image tag | `latest` |
| `container.pullPolicy` | Image pull policy | `IfNotPresent` |
| `container.resources` | Resource requests/limits | See values.yaml |
| `container.securityContext` | Container security context | See values.yaml |
| `container.livenessProbe` | Liveness probe configuration | HTTP check on / |
| `container.readinessProbe` | Readiness probe configuration | HTTP check on / |
| **tty2web Configuration** |
| `tty2web.enabled` | Enable tty2web web interface | `true` |
| `tty2web.deploymentMode` | Deployment mode: `deployment` or `sidecar` | `deployment` |
| `tty2web.repository` | tty2web image repository | `registry.aydev.cloud/challenges/commons/tty2web` |
| `tty2web.tag` | tty2web image tag | `latest` |
| `tty2web.resources` | Resource requests/limits | See values.yaml |
| `tty2web.securityContext` | Security context for tty2web | See values.yaml |
| `tty2web.services.port` | tty2web service port | `8080` |
| **Network Policy** |
| `networkPolicy.enabled` | Enable NetworkPolicy | `true` |
| `networkPolicy.policyType` | Policy type: `deny-all` or `custom` | `deny-all` |
| **RBAC** |
| `rbac.create` | Create RBAC resources | `true` |
| **Persistence** |
| `persistence.enabled` | Enable persistent storage | `true` |
| `persistence.storageClass` | StorageClass for PVC | `""` |
| `persistence.size` | PVC size | `1Gi` |
| `persistence.mountPath` | Mount path for persistent data | `/home/test` |
| **Service Account** |
| `serviceAccount.create` | Create service account | `true` |
| `serviceAccount.automount` | Auto-mount service account token | `false` |
| `serviceAccount.name` | Service account name | `""` |
| **Security** |
| `podSecurityContext` | Pod security context | See values.yaml |
| `securityContext` | Container security context | See values.yaml |
| **Service** |
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `80` |
| **Ingress** |
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class name | `""` |
| `ingress.hosts` | Ingress hosts configuration | See values.yaml |
| **Other** |
| `imagePullSecrets` | Image pull secrets | `[]` |
| `nodeSelector` | Node selector | `{}` |
| `tolerations` | Pod tolerations | `[]` |
| `affinity` | Pod affinity rules | `{}` |

## Deployment Modes

### Deployment Mode (Default)

In deployment mode, tty2web runs as a separate Deployment and uses `kubectl exec` to access the shell container.

**Pros:**
- Security isolation between web interface and shell
- Independent restart capability
- Separate resource management

**Cons:**
- Requires RBAC permissions (pods/exec)
- More complex architecture
- Limited to 1 replica

**Configuration:**
```yaml
tty2web:
  deploymentMode: "deployment"
rbac:
  create: true  # Required for kubectl exec
```

### Sidecar Mode

In sidecar mode, tty2web runs as a sidecar container in the same pod as the shell.

**Pros:**
- Simpler architecture
- No RBAC required
- Shared network namespace (localhost communication)
- Automatic lifecycle management

**Cons:**
- Both containers restart together
- Shared resource limits
- Less security isolation

**Configuration:**
```yaml
tty2web:
  deploymentMode: "sidecar"
rbac:
  create: false  # Not needed in sidecar mode
```

## Security Considerations

### Network Isolation

When `networkPolicy.enabled=true`, a deny-all NetworkPolicy is applied to the container pods, blocking all ingress and egress traffic. This creates a sandboxed environment.

### Capabilities

The container requires specific Linux capabilities for operation:
- `SETGID`, `SETUID`: User/group management
- `SYS_PTRACE`: Process tracing (for debugging)
- `AUDIT_WRITE`: Audit log writing
- `NET_BIND_SERVICE`: Bind to privileged ports
- `CHOWN`: File ownership changes
- `NET_RAW`, `NET_ADMIN`: Network operations

Review these capabilities and remove any that aren't needed for your use case.

### Service Account

By default, `serviceAccount.automount=false` to prevent automatic mounting of service account tokens, following security best practices.

## Upgrading

### From 0.1.0 to 1.0.0

Version 1.0.0 includes breaking changes. See CHANGELOG.md for details.

**Migration steps:**
1. Backup your current values.yaml
2. Update values.yaml structure:
   - Move probes from root to `container.*`
   - Move tty2web resources from `ingress.tty2web` to `tty2web.resources`
   - Add new configuration sections (`networkPolicy`, `rbac`, etc.)
3. Test the upgrade in a non-production environment first
4. Run: `helm upgrade my-webshell ./webshell`

## Troubleshooting

### tty2web cannot connect to container

**Symptoms:** Web interface shows connection error

**Solutions:**
1. Check deployment mode is set correctly
2. In deployment mode, verify RBAC resources are created: `kubectl get role,rolebinding`
3. Check service account has permissions: `kubectl describe role <release-name>-exec`
4. Verify StatefulSet pod is running: `kubectl get statefulset`

### Network policy blocking access

**Symptoms:** Cannot access services from container

**Solutions:**
1. Disable network policy: `--set networkPolicy.enabled=false`
2. Or customize network policy to allow specific traffic
3. Verify policy is applied: `kubectl get networkpolicy`

### Persistent data not saved

**Symptoms:** Data lost after pod restart

**Solutions:**
1. Verify persistence is enabled: `--set persistence.enabled=true`
2. Check StorageClass is available: `kubectl get storageclass`
3. Verify PVC is bound: `kubectl get pvc`

### Schema validation errors

**Symptoms:** Helm install fails with validation error

**Solutions:**
1. Check values.yaml against values.schema.json
2. Ensure `deploymentMode` is either `deployment` or `sidecar`
3. Verify resource formats (cpu: `"64m"`, memory: `"64Mi"`)

## Testing

Run Helm tests after installation:

```sh
helm test my-webshell
```

This tests service connectivity to the tty2web interface.

## Uninstallation

```sh
helm uninstall my-webshell
```

Note: Persistent volumes may be retained based on the retention policy.

## License

This chart is maintained by aydev.

## Contributing

Contributions are welcome! Please submit issues and pull requests to the repository.
