# ADR-0001: Encapsulated compose execution

- Status: Accepted
- Date: 2026-06-01

## Context

Authors ship `docker-compose.yml`; operators run Kubernetes. The established
bridge, Kompose, *translates* compose into per-service Deployments/Services.
That translation is lossy (the "weird" parts — `cap_add`, custom networks,
`depends_on`, bind mounts — frequently don't survive) and provides no sandbox.
Strong-isolation options (Kata, KubeVirt) each require a heavy cluster-side
install. Nothing runs a compose file *as written*, *isolated*, *without a
special node-level runtime*.

## Decision

Run the compose file **encapsulated**: one pod per stack, with a real Docker
daemon (DinD) inside the pod executing `docker compose up` against the author's
unmodified file. The stack's network stays internal to the pod; only services
that publish a port are exposed via a single Kubernetes Service.

### Invariants (do not "improve" these away)

1. **Encapsulated only.** One pod per stack, real Docker inside, internal stack
   network. Never add per-service translation into native Deployments/Services —
   that is Kompose's job and an explicit non-goal.
2. **No lifecycle management.** No TTL, GC, per-user instancing, or warm pools.
   Cleanup is via owner references / `helm uninstall`.
3. **No hard runtime dependency.** Default is the cluster runtime + `hostUsers:
   false` (user namespaces). Setting `runtimeClassName` (e.g. Kata) is opt-in.
   Never make any RuntimeClass mandatory.
4. **OCI artifact delivery.** The compose + files arrive via `oras pull` into a
   **writable** `emptyDir` (or PVC). No ConfigMap-delivered compose, no
   read-only ImageVolume as the primary path.
5. **`privileged: true` stays.** DinD needs it; it is only safe because the pod
   is confined by the user namespace or a sandbox runtime. Keep `hostUsers`
   honored and the confinement story intact.

## Consequences

- **Fidelity is total** — it is real Docker, not a translation.
- **The stack is opaque to Kubernetes** — no per-service scaling, HPA, or native
  observability. This is the conscious trade for fidelity + zero dependency.
- **Cold start** is ~10–30 s (`dockerd` + `compose up`); the startup probe holds
  readiness until the entry port answers.
- **Isolation upgrades for free** — set `runtimeClassName` to a Kata class once
  it exists; the default keeps working on a vanilla cluster.

## Alternatives rejected

- **Kompose-style translation** — lossy, no sandbox.
- **compose-on-kubernetes (Docker `Stack` API)** — per-service translation,
  unmaintained.
- **A compose CRD/operator** — out of scope; this is the chart method by design.

If a decision here genuinely changes, append a superseding ADR — do not edit
this one silently.
