# web-app

A Helm chart that runs a **single-container web app as one pod**. It produces a
Deployment + Service, with optional Ingress / Gateway API HTTPRoute, a
NetworkPolicy, and a ServiceAccount.

Use it for a self-contained web service that listens on one port and needs no
internal multi-container network. If a challenge ships a `docker-compose.yml`
with its own network (several services talking to each other privately), use the
`compose` chart instead.

## Highlights

- **Flag injection** via `env` (or `envFrom` a Secret).
- **Locked egress by default** — a compromised app cannot phone home or pivot;
  DNS stays open. Flip `networkPolicy.allowEgress=true` to open it.
- **VM isolation** — set `runtimeClassName` (e.g. `kata-clh`) to run the pod in a
  micro-VM; leave it empty to use the cluster default runtime with user
  namespaces (`hostUsers`).
- **Probes** default to a TCP check on the container port, so they work for any
  listener without a `/healthz` route. Switch to `type: http` per probe if you
  have one.

## Install

```sh
helm install bokanovsky ./web-app \
  --set image.repository=zot.asso-hzv.fr/wargame/2026/bokanovsky \
  --set image.tag=latest \
  --set containerPort=5000 \
  --set service.port=80 \
  --set env.FLAG='leHACK{...}' \
  --set runtimeClassName=kata-clh
```

`containerPort` is the port the app listens on inside the container;
`service.port` is what the Service exposes.

## Expose it

| Method | How |
|--------|-----|
| Port-forward | `kubectl port-forward svc/<release>-web-app 8080:<service.port>` |
| Service type | `--set service.type=NodePort` (or `LoadBalancer`) |
| Ingress | `--set ingress.enabled=true --set ingress.className=…` (host comes from the dploy-injected `ingressHost`, or set `ingress.hosts`) |
| Gateway API | `--set httpRoute.enabled=true --set httpRoute.parentRefs[0].name=…` |

When dploy injects `ingressHost`, both the Ingress and the HTTPRoute use it
automatically as the single host.

## Values

| Key | Default | Description |
|-----|---------|-------------|
| `image.repository` / `image.tag` | `""` / `latest` | Container image (repository required) |
| `command` / `args` | `[]` | Override the image entrypoint / args |
| `env` | `{}` | Environment variables (e.g. `FLAG`) |
| `envFrom` | `[]` | Pull env from Secrets / ConfigMaps |
| `containerPort` | `8080` | Port the app listens on in the container |
| `runtimeClassName` | `""` | RuntimeClass (e.g. `kata-clh`); empty = default runtime |
| `hostUsers` | `true` | `false` = user-namespace isolation; `true` under Kata |
| `securityContext` | drop ALL caps, no privilege escalation | Container security context |
| `resources` | 100m / 128Mi → 1 / 512Mi | Requests / limits |
| `probes.{startup,liveness,readiness}` | TCP on the port | Health probes (`type: tcp\|http`) |
| `persistence.*` | disabled | Optional durable volume |
| `extraVolumes` / `extraVolumeMounts` | `[]` | Extra volumes / mounts |
| `networkPolicy.enabled` | `true` | Apply a NetworkPolicy |
| `networkPolicy.allowEgress` | `false` | `false` = DNS-only egress; `true` = open |
| `networkPolicy.ingressNamespace` | `ingress-nginx` | Namespace allowed to reach the pod |
| `service.type` / `service.port` | `ClusterIP` / `80` | Service |
| `ingress.*` | disabled | Standard single-host Ingress |
| `httpRoute.*` | disabled | Gateway API HTTPRoute |

## Validate

```sh
helm lint ./web-app
helm template ./web-app --set image.repository=ghcr.io/x/y
```
