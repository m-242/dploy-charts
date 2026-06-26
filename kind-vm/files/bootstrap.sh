#!/bin/bash
# kind-vm bootstrap — exécuté une fois au premier boot (oneshot systemd).
# Tout le contenu du challenge vient du BUNDLE disk (monté ro sur /var/opt/kindvm
# par la unit var-opt-kindvm.mount, via le serial virtio "kindbundle") :
#   bin/{kind,kubectl}   images/*.tar   kind-config.yaml   manifests/ (ou manifests.yaml)
# Aucun credential registre dans la VM : les images sont chargées depuis les archives.
set -euo pipefail

# shellcheck disable=SC1091
. /etc/kindvm/kindvm.env

export KIND_EXPERIMENTAL_PROVIDER=podman
export KUBECONFIG=/root/.kube/config
B=/var/opt/kindvm
BIN=/usr/local/bin
mkdir -p /var/lib/kindvm "$(dirname "$KUBECONFIG")"
log() { echo "[kind-vm] $*"; }

# Binaires : depuis le bundle si présents, sinon téléchargement (fallback).
if [ -d "$B/bin" ]; then export PATH="$B/bin:$PATH"; fi
if ! command -v kind >/dev/null 2>&1; then
  log "downloading kind ${KIND_VERSION}"
  curl -fsSLo "$BIN/kind" "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-amd64"; chmod +x "$BIN/kind"
fi
if ! command -v kubectl >/dev/null 2>&1; then
  log "downloading kubectl ${KUBECTL_VERSION}"
  curl -fsSLo "$BIN/kubectl" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"; chmod +x "$BIN/kubectl"
fi

# Pré-charge les archives d'images dans podman (airgap).
if [ -d "$B/images" ]; then
  for f in "$B"/images/*.tar; do [ -f "$f" ] && { log "podman load $f"; podman load -i "$f"; }; done
fi

# Cluster kind (config depuis le bundle, sinon /etc/kindvm/kind-config.yaml).
KCFG="$B/kind-config.yaml"; [ -f "$KCFG" ] || KCFG=/etc/kindvm/kind-config.yaml
if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"; then
  log "kind create cluster '$CLUSTER_NAME'"
  kind create cluster --name "$CLUSTER_NAME" --config "$KCFG" --image "$NODE_IMAGE" --wait 180s
fi

# Charge les images dans tous les nœuds kind (générique).
if [ -d "$B/images" ]; then
  for f in "$B"/images/*.tar; do [ -f "$f" ] && { log "kind load $f"; kind load image-archive "$f" --name "$CLUSTER_NAME" || true; }; done
fi

# Applique les manifests du bundle (dir manifests/ ou fichier manifests.yaml).
if [ -d "$B/manifests" ]; then
  log "kubectl apply -f $B/manifests"; kubectl apply -f "$B/manifests"
elif [ -f "$B/manifests.yaml" ]; then
  log "kubectl apply -f $B/manifests.yaml"; kubectl apply -f "$B/manifests.yaml"
fi

log "done"
