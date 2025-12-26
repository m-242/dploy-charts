# Training Chart

Interactive training environment with step-by-step instructions and a web terminal. Inspired by KillerKoda/Katacoda.

## Features

- **Split-pane UI**: Instructions on the left (1/3), terminal on the right (2/3)
- **Step verification**: Built-in "Check" button runs verification scripts
- **ConfigMap-based scenarios**: Define tutorials in values.yaml - no image rebuild needed
- **Resizable panels**: Drag the divider to adjust panel widths
- **Keyboard navigation**: Use arrow keys to navigate steps

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser                                      │
│  ┌─────────────────────┬───────────────────────────────────────────┐│
│  │   Instructions      │           Terminal                        ││
│  │   (1/3 width)       │           (2/3 width)                     ││
│  │                     │                                           ││
│  │  Step 1 of 5        │   $ git init                              ││
│  │  ──────────────     │   Initialized empty Git repository        ││
│  │  Initialize repo... │                                           ││
│  │                     │                                           ││
│  │  [Check] [Next →]   │                                           ││
│  └─────────────────────┴───────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **Training UI** | Generic Go server - serves web interface, reads scenarios from ConfigMap |
| **Shell Pod** | Sandbox environment (StatefulSet) where users run commands |
| **tty2web** | Web terminal connecting to the shell via kubectl exec |

## Quick Start

```bash
helm install my-training ./training \
  --set ingressHost=training.example.com
```

## Defining Scenarios

Scenarios are defined directly in `values.yaml`. Each step has:
- `name`: Step identifier (e.g., "01-introduction")
- `title`: Display title
- `content`: Markdown instructions
- `check`: Optional bash script for verification

### Example

```yaml
scenario:
  name: "Git Basics"
  description: "Learn essential Git commands"
  difficulty: beginner
  estimatedTime: 20m
  steps:
    - name: "01-introduction"
      title: "Introduction"
      content: |
        # Welcome to Git Basics

        Run `git --version` to verify Git is installed.

    - name: "02-init-repo"
      title: "Initialize Repository"
      content: |
        # Initialize a Repository

        ```bash
        mkdir my-project && cd my-project
        git init
        ```
      check: |
        #!/bin/bash
        if [ -d "/workspace/my-project/.git" ]; then
            echo "Repository initialized!"
            exit 0
        else
            echo "Run 'git init' in my-project directory"
            exit 1
        fi
```

### Check Scripts

- Exit code `0` = Success (green message)
- Exit code non-zero = Failure (red message)
- stdout = Message shown to user
- Scripts run in the shell pod at `/workspace`

## Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingressHost` | Ingress hostname (injected by dploy) | `""` |
| `scenario.name` | Scenario title | `"Git Basics"` |
| `scenario.steps` | Array of step definitions | See values.yaml |
| `shell.image.repository` | Shell container image | `debian` |
| `shell.image.tag` | Shell container tag | `bookworm` |
| `ui.image.repository` | Training UI image | `aydev/training-ui` |
| `tty2web.enabled` | Enable web terminal | `true` |
| `persistence.enabled` | Enable workspace persistence | `true` |
| `persistence.size` | Workspace PVC size | `1Gi` |

## Shell Environment

Customize the shell container for your scenario's needs:

```yaml
shell:
  image:
    repository: myrepo/training-python  # Custom image with Python
    tag: latest
```

Example Containerfile for Python scenarios:

```dockerfile
FROM debian:bookworm
RUN apt-get update && apt-get install -y python3 python3-pip git
WORKDIR /workspace
CMD ["sleep", "infinity"]
```

## Building the UI Image

The UI image is generic and reusable:

```bash
podman build -f Containerfile.ui -t myrepo/training-ui:latest .
podman push myrepo/training-ui:latest
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` | Previous step |
| `→` | Next step |
| `Ctrl+Enter` | Run check |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scenario` | GET | Get scenario metadata |
| `/api/steps` | GET | List all steps |
| `/api/steps/:n` | GET | Get step content |
| `/api/steps/:n/check` | POST | Run verification |
| `/api/health` | GET | Health check |

## Integration with Dploy

Add to your `environments.yaml`:

```yaml
- name: git-training
  description: "Learn Git basics"
  oci: "oci://ghcr.io/myorg/charts/training"
  version: "1.0.0"
  enabled: true
  icon: "graduation-cap"
  ttlHours: 2
  maxPerUser: 1
```

The dploy API automatically injects `username`, `uuid`, and `ingressHost` values.
