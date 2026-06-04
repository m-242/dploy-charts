# compose

A Helm chart that runs an **unmodified `docker-compose.yml` as a single
sandboxed pod**. A real Docker daemon (DinD) runs inside the pod and executes
`docker compose up` against your file — no rewrite into native Kubernetes
objects, no node-level runtime to install.

- **Fidelity** — it's real Docker, not a translation. Whatever runs under
  `docker compose up` locally runs here (bind mounts, `depends_on`, custom
  networks, `cap_add`, sidecars).
- **Isolation** — by default the privileged DinD is confined by **user
  namespaces** (`hostUsers: false`), which needs nothing on the nodes. Point
  `runtimeClassName` at **Kata** for a hardware-virtualised micro-VM instead.
- **No credentials in the sandbox** — registry and git credentials are handled
  *outside* the DinD/Kata container (by the kubelet, or in an init container).
  If the workload is compromised, there are no creds to steal.
- **One entry, rest private** — a service that publishes a port is reachable via
  the chart's Service; everything else stays inside the pod's Docker network.

> Not a per-service translator. If you want each service as its own
> Deployment/Service/HPA, use [Kompose](https://kompose.io). This chart keeps the
> stack opaque to Kubernetes: one pod, internal Docker network, no per-service
> scaling. See the ADRs in [`docs/`](docs/).

---

## How the stack is delivered

The chart never reads your compose from a ConfigMap. Pick one `source.type`:

| `source.type` | What happens | Credentials |
|---------------|--------------|-------------|
| **`oci`** *(default)* | A **bundle image** is mounted **read-only** as an `ImageVolume`. The chart copies the stack into the writable workdir and `docker load`s the images it bundles — the in-pod daemon never pulls from a registry. | Bundle pulled by the **kubelet** via `source.oci.pullSecrets`; never enter the sandbox. |
| **`git`** | An **init container** clones the repo into the workdir, then the DinD container runs it. | Mounted **only** on the init container via `source.git.credentialsSecret`; never reach the sandbox. |

### A — OCI bundle (recommended)

The bundle is a normal **container image** (not an oras artifact). Its filesystem
holds:

```
/docker-compose.yml      # (or compose.yml / .yaml — the boot script probes all four)
/Caddyfile               # any files/dirs the compose bind-mounts (kept at the same relative path)
/images/                 # docker save | gzip of every image the compose uses
    caddy-2-alpine.tar.gz
    gitea-gitea-1.22.tar.gz
```

At start the chart: copies everything **except `images/`** into `/workspace`,
`docker load`s each `images/*.tar.gz`, then runs `docker compose up --pull never`.
Because every image is pre-loaded, the sandboxed daemon performs **no registry
pulls** and needs **no registry credentials**.

Build and push it (see [`example/build.sh`](example/build.sh) for a ready script):

```sh
# 1. Save the images your compose references
mkdir -p images
docker pull caddy:2-alpine && docker save caddy:2-alpine | gzip > images/caddy-2-alpine.tar.gz
docker pull gitea/gitea:1.22 && docker save gitea/gitea:1.22 | gzip > images/gitea-gitea-1.22.tar.gz

# 2. Bundle the compose + files + images into a scratch image
cat > Containerfile <<'EOF'
FROM scratch
COPY docker-compose.yml /docker-compose.yml
COPY Caddyfile /Caddyfile
COPY images /images
EOF
docker build -f Containerfile -t ghcr.io/your-org/my-stack:v1 .
docker push ghcr.io/your-org/my-stack:v1
```

**Private bundle:** the kubelet pulls it — pass `source.oci.pullSecrets` (a
`dockerconfigjson` secret name); those creds are *not* mounted in the pod.
**Pin by digest in production** (`…@sha256:…`).

A complete, runnable example (Gitea behind Caddy on a private network) lives in
[`example/`](example/) and is published at `docker.io/ctfimages/gitea-compose:v1`.

### B — git repository

```sh
helm install my-stack ./compose \
  --set source.type=git \
  --set source.git.repo=https://github.com/your-org/my-stack.git \
  --set source.git.ref=v1            # branch, tag, or commit SHA
# private repo:
#   kubectl create secret generic git-creds --from-literal=username=x-access-token --from-literal=password=$TOKEN
#   --set source.git.credentialsSecret=git-creds      # https
#   (or a secret with key ssh-privatekey for ssh remotes)
```

The repo's images are pulled by the in-pod daemon at run time (use the OCI bundle
if you need a fully offline / pull-free stack).

## Install

```sh
helm install my-stack ./compose \
  --set source.oci.reference=ghcr.io/your-org/my-stack:v1 \
  --set service.port=8080
```

`service.port` must equal the port a compose service **publishes** (the left
side of `"8080:80"`). The chart's Service forwards to it.

### Stronger isolation with Kata

```sh
helm install my-stack ./compose \
  --set source.oci.reference=ghcr.io/your-org/my-stack:v1 \
  --set runtimeClassName=kata-qemu \   # the RuntimeClass must exist on the cluster
  --set hostUsers=true                 # the micro-VM is the isolation boundary
```

Leaving `runtimeClassName` empty uses the cluster's default runtime with user
namespaces (`hostUsers: false`) — the privileged DinD still maps to an
unprivileged host UID, with no node-side dependency.

## Expose it

| Method | How |
|--------|-----|
| Port-forward | `kubectl port-forward svc/<release>-compose 8080:<service.port>` |
| Service type | `--set service.type=NodePort` (or `LoadBalancer`) |
| Ingress | `--set ingress.enabled=true --set ingress.className=… --set ingress.host=…` |
| Gateway API | `--set httpRoute.enabled=true --set httpRoute.parentRefs[0].name=…` |

## Values

| Key | Default | Description |
|-----|---------|-------------|
| `source.type` | `oci` | `oci` (ImageVolume bundle) or `git` (init-container clone) |
| `source.oci.reference` | `""` | Bundle image (required for `oci`) |
| `source.oci.pullSecrets` | `[]` | Image pull secrets used by the kubelet for the bundle |
| `source.git.repo` | `""` | Repo URL (required for `git`) |
| `source.git.ref` | `main` | Branch, tag, or commit SHA |
| `source.git.subPath` | `""` | Sub-directory within the repo to use as the stack |
| `source.git.credentialsSecret` | `""` | Secret (`username`/`password` or `ssh-privatekey`), init-container only |
| `runtimeClassName` | `""` | RuntimeClass for the pod (e.g. `kata-qemu`); empty = default runtime |
| `hostUsers` | `false` | `false` = user-namespace isolation; `true` under Kata |
| `service.type` | `ClusterIP` | `ClusterIP` / `NodePort` / `LoadBalancer` |
| `service.port` | `8080` | Port the entry compose service publishes |
| `image` | `docker:28-dind` | DinD image |
| `resources` | 1–2 Gi / 0.5–1 cpu | One pod runs the whole stack — size accordingly |
| `persistence.*` | disabled | Back the workdir with a filesystem PVC |
| `ingress.*` | disabled | Standard single-host Ingress |
| `httpRoute.*` | disabled | Gateway API HTTPRoute |

## Validate

```sh
helm lint ./compose
helm template ./compose --set source.oci.reference=ghcr.io/x/y:v1
```

## Gotchas

- **Cold start.** `dockerd` + `docker load` + `compose up` can take a few minutes
  on first boot for a large bundle; the startup probe holds readiness until the
  entry port answers.
- **`privileged: true` is required by DinD.** It is safe only because the pod is
  confined by user namespaces or a Kata micro-VM. Never run with
  `hostUsers: true` on a shared/untrusted cluster without a sandbox runtime.
- **`/var/lib/docker` is an `emptyDir`** — overlay-on-overlay otherwise.
- **Persistence is filesystem-only** — user namespaces disallow raw block
  volumes.
