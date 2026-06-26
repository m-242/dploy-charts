# kind-vm

Exécute un **cluster kind dans une vraie VM KubeVirt** (Fedora CoreOS). Pour les
challenges « Kubernetes-in-Kubernetes » (privesc, RCE cluster, etc.) qui ont
besoin d'un cluster k8s jetable et **isolé par instance** (frontière VM/KVM).

Vraie VM = vrai kernel + vrais disques → **aucun bricolage** kmsg / inotify /
cAdvisor / overlay comme avec DinD-sur-Kata.

## Architecture (cf. `compose-vm`)

- **OS** : containerDisk Fedora CoreOS (stream kubevirt), configuré au 1er boot
  par **Ignition** (compilé en cluster par [butane-operator](https://github.com/naval-group/butane-operator),
  consommé via `cloudInitConfigDrive`).
- **Bundle** (`source.reference`) : un containerDisk ro contenant le challenge —
  `kind-config.yaml`, `manifests/`, `images/*.tar`, `bin/{kind,kubectl}`. Le
  **kubelet** le pulle (creds via `imagePullSecret`, au niveau pod) ; **aucun
  credential registre n'entre dans la VM**. Voir `example/build-bundle.sh`.
- Au boot : mount du bundle → `kind create` → `kind load` des images → `kubectl
  apply` des manifests. 100 % airgap.

## Prérequis cluster

KubeVirt (+ CDI pour golden/clone), **butane-operator**, et pour golden/clone une
`VolumeSnapshotClass` (Longhorn OK). containerDisk FCOS `fedora-coreos-kubevirt`.

## Valeurs clés

| clé | rôle |
|---|---|
| `source.reference` | **(requis)** bundle containerDisk du challenge |
| `image` | OS containerDisk (FCOS, défaut upstream) |
| `imagePullSecret` | secret dockerconfigjson kubelet (OS + bundle privés) |
| `port` | port publié par l'app (hostPort du kind-config), forwardé/exposé |
| `cpu` / `memory` | taille VM (kind 2 nœuds : ~2Gi) |
| `httpRoute` / `ingress` | exposition (host = `ingressHost` dploy) |

## Modèle d'instance

Chaque instance est **autonome** : elle boote depuis le bundle (immuable, buildé
par la CI) et crée le cluster kind au boot (~1 min, airgap). Le bundle **EST**
l'image golden — il n'y a volontairement **pas** de mécanique snapshot/clone de
VM vivante (fragile : reprise d'un kind « gelé », orchestration multi-étapes).
Si la latence à froid devenait un problème à grande échelle, on l'adresserait
hors du chart, en KubeVirt-natif (`VirtualMachineSnapshot`/`VirtualMachineClone`).

## Bundle

Le bundle est spécifique au challenge. Prépare un dossier `kind-config.yaml`
(+ `manifests/`, `images.txt`) puis :

```sh
SRC=./my-chall FULL=zot…/my-chall-kindbundle:latest ./example/build-bundle.sh
```

> `port` doit correspondre au `hostPort` de l'`extraPortMapping` du `kind-config.yaml`
> du bundle (le NodePort du service exposé est remonté là).
