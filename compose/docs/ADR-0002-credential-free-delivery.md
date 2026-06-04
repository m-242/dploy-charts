# ADR-0002: Credential-free stack delivery

- Status: Accepted
- Date: 2026-06-01
- Supersedes: the delivery mechanism of [ADR-0001](ADR-0001-encapsulated-compose.md)
  (invariant 4, "OCI artifact via `oras pull` into a writable emptyDir; no
  read-only ImageVolume").

## Context

The pod is a privileged Docker-in-Docker sandbox — exactly the kind of workload
that may be compromised. ADR-0001 delivered the stack by running `oras pull`
*inside* the pod, which means any registry pull secret is mounted in the
sandbox. Likewise, the in-pod daemon pulling the stack's own images would need
registry credentials in the sandbox. If the workload escapes the application
layer, those credentials are there to steal.

The goal: **no registry or git credentials ever reach the sandbox container.**

## Decision

Deliver the stack via a pluggable `source.type`, with credentials handled
*outside* the DinD/Kata container in every case.

### `oci` (default) — bundle image as a read-only ImageVolume

- The stack is a normal **container image** (not an oras artifact) whose
  filesystem holds the compose file, its referenced files, and an `images/`
  directory of `docker save | gzip` tarballs.
- The pod mounts it **read-only** as a Kubernetes `ImageVolume`. The **kubelet**
  pulls it using the pod's `imagePullSecrets` — those creds never enter any
  container.
- At boot the chart copies everything except `images/` into the writable
  workdir, `docker load`s every `images/*.tar.gz`, and runs
  `docker compose up --pull never`. The in-pod daemon therefore performs **no
  registry pulls** and needs **no registry credentials**.

This reverses ADR-0001's rejection of ImageVolume: the read-only constraint is
handled by copying into the writable workdir, and the security win (no creds in
the sandbox, fully offline images) outweighs the copy-at-boot cost.

### `git` — clone in an init container

- An **init container** clones the repo into the workdir. Its credentials
  (`source.git.credentialsSecret`, https or ssh) are mounted **only** on that
  init container. The DinD container starts afterward with the files already in
  place and no access to the secret.

## Consequences

- **Credentials are never in the sandbox.** A compromised workload finds no
  registry or git secret to exfiltrate.
- **OCI stacks are fully offline.** Images ship in the bundle; `--pull never`
  guarantees the daemon does not reach a registry.
- **Bundle images are larger** (they embed image tarballs) and **architecture-
  specific** (build for the cluster's arch). Cold start includes `docker load`.
- **`oras` is no longer used** by the chart; `oras push` is replaced by a normal
  `docker build` of the bundle image (see `example/build.sh`).

ADR-0001's other invariants (one pod per stack, no lifecycle management, no
mandatory RuntimeClass, privileged-but-confined) are unchanged.
