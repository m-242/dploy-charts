# Example stack — Gitea behind Caddy (private network)

A self-contained compose stack for the `compose` chart:

- **caddy** — the only service that publishes a port (`8080`). It reverse-proxies
  to Gitea.
- **gitea** — sits on an `internal: true` Docker network with **no published
  port**, so it is unreachable from outside the pod except through Caddy.

This mirrors the chart's model: expose one entry, keep the rest private to the
stack.

## Files

```
example/
├── docker-compose.yml   # caddy (entry) + gitea (private)
├── Caddyfile            # :8080 -> reverse_proxy gitea:3000
├── Containerfile        # scratch bundle: compose + Caddyfile + images/
└── build.sh             # docker save the images + build & push the bundle
```

## Build the OCI bundle

The chart's `oci` source mounts a **bundle image** (read-only) and `docker
load`s the images it carries — so the in-pod daemon never pulls from a registry.
`build.sh` saves `caddy:2-alpine` + `gitea/gitea:1.22` into `images/`, then
builds and pushes the bundle:

```sh
cd example/
./build.sh docker.io/ctfimages/gitea-compose:v1 linux/amd64
```

> `linux/amd64` must match your cluster's node architecture — the bundled image
> tarballs are platform-specific.

A prebuilt copy is published at **`docker.io/ctfimages/gitea-compose:v1`**.

## Run it with the chart

```sh
helm install gitea ../ \
  --set source.oci.reference=docker.io/ctfimages/gitea-compose:v1 \
  --set service.port=8080
```

Then reach the entry service:

```sh
kubectl port-forward svc/gitea-compose 8080:8080
# open http://127.0.0.1:8080  -> Gitea, served through Caddy
```

Gitea itself has no Service and no published port — it lives entirely inside the
pod's private Docker network.
