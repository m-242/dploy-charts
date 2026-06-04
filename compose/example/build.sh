#!/bin/sh
# Build and push the example bundle image for the `compose` chart.
# Usage: ./build.sh [image-ref] [platform]
set -eu

IMAGE="${1:-docker.io/ctfimages/gitea-compose:v1}"
PLATFORM="${2:-linux/amd64}"   # must match the cluster nodes' architecture
cd "$(dirname "$0")"

# Service images referenced by docker-compose.yml — bundled so the in-pod daemon
# loads them locally instead of pulling from a registry. Saved for $PLATFORM.
IMAGES="caddy:2-alpine gitea/gitea:1.22"

mkdir -p images
for img in $IMAGES; do
  docker pull --platform "$PLATFORM" "$img"
  out="images/$(printf '%s' "$img" | tr '/:' '--').tar.gz"
  echo "saving $img ($PLATFORM) -> $out"
  docker save "$img" | gzip > "$out"
done

echo "building + pushing bundle $IMAGE ($PLATFORM)"
docker buildx build --platform "$PLATFORM" -f Containerfile -t "$IMAGE" --push .
echo "done: $IMAGE"
