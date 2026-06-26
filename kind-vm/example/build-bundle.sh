#!/bin/sh
# build-bundle.sh — construit le BUNDLE containerDisk consommé par le chart kind-vm
# (valeur source.reference). Pur podman, sans toucher l'OS, sans KVM ni root
# (mkfs.ext4 -d peuple la FS depuis un dossier).
#
# Layout attendu dans $SRC (un dossier que tu prépares) :
#   kind-config.yaml          topologie kind (extraPortMapping hostPort = .Values.port)
#   manifests/ ou manifests.yaml   manifests appliqués dans le cluster
#   images.txt                (optionnel) une image par ligne → pull + save dans images/
# Le script ajoute bin/{kind,kubectl} et images/*.tar, puis package en containerDisk.
#
# Usage: SRC=./my-chall FULL=zot…/my-chall-kindbundle:latest ./build-bundle.sh
set -eu

SRC=${SRC:?set SRC to the bundle source dir}
FULL=${FULL:?set FULL to the output image ref}
ARCH=${ARCH:-amd64}
KIND_VERSION=${KIND_VERSION:-v0.27.0}
KUBECTL_VERSION=${KUBECTL_VERSION:-v1.32.2}

ensure() { command -v "$1" >/dev/null 2>&1 || { apk add --no-cache "$2" 2>/dev/null || dnf -y install "$2"; }; }
ensure curl curl
ensure mkfs.ext4 e2fsprogs

WORK=$(mktemp -d)
P="$WORK/payload"
mkdir -p "$P/bin" "$P/images"
cp -a "$SRC"/. "$P"/                      # kind-config.yaml + manifests + images.txt

curl -fsSLo "$P/bin/kind"    "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${ARCH}"
curl -fsSLo "$P/bin/kubectl" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl"
chmod +x "$P/bin/kind" "$P/bin/kubectl"

# Images listées dans images.txt → pull (amd64) + save.
if [ -f "$P/images.txt" ]; then
  while IFS= read -r img; do
    [ -n "$img" ] || continue
    name=$(echo "$img" | tr '/:' '__')
    podman pull --platform "linux/${ARCH}" "$img"
    podman save "$img" -o "$P/images/${name}.tar"
  done < "$P/images.txt"
  rm -f "$P/images.txt"
fi

SIZE_MB=$(du -sm "$P" | awk '{print $1 + 256}')
truncate -s "${SIZE_MB}M" "$WORK/bundle.img"
mkfs.ext4 -q -F -L kindbundle -d "$P" "$WORK/bundle.img"

printf 'FROM scratch\nADD bundle.img /disk/kindbundle.img\n' > "$WORK/Containerfile"
podman build -f "$WORK/Containerfile" -t "$FULL" "$WORK"
echo "built $FULL"
