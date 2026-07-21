#!/usr/bin/env bash
# One-time setup: install GitHub Actions self-hosted runner on the deploy VM.
# Usage:
#   1. GitHub repo → Settings → Actions → Runners → New self-hosted runner → Linux
#   2. Copy the registration token
#   3. RUNNER_TOKEN=<token> ./scripts/setup-github-runner.sh
set -euo pipefail

RUNNER_USER="${RUNNER_USER:-$USER}"
RUNNER_DIR="${RUNNER_DIR:-$HOME/actions-runner}"
REPO="${GITHUB_REPOSITORY:-}"
RUNNER_TOKEN="${RUNNER_TOKEN:-}"

if [ -z "$RUNNER_TOKEN" ]; then
  echo "Set RUNNER_TOKEN from GitHub → Settings → Actions → Runners → New self-hosted runner"
  exit 1
fi

if [ -z "$REPO" ]; then
  echo "Set GITHUB_REPOSITORY (e.g. myorg/Access_Control_V2)"
  exit 1
fi

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [ ! -f ./config.sh ]; then
  RUNNER_VERSION="${RUNNER_VERSION:-2.321.0}"
  curl -fsSL -o actions-runner-linux-x64.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  tar xzf actions-runner-linux-x64.tar.gz
fi

./config.sh \
  --url "https://github.com/${REPO}" \
  --token "$RUNNER_TOKEN" \
  --name "${RUNNER_NAME:-acv2-$(hostname -s)}" \
  --labels "${RUNNER_LABELS:-self-hosted,linux,acv2}" \
  --unattended

echo ""
echo "Runner installed in $RUNNER_DIR"
echo "Start as service (recommended):"
echo "  cd $RUNNER_DIR && sudo ./svc.sh install $RUNNER_USER && sudo ./svc.sh start"
echo ""
echo "Also create env file for deploy (once):"
echo "  mkdir -p /home/admintechfarm/Access_Control_V2"
echo "  cp /path/to/Access_Control_V2/.env.production.example /home/admintechfarm/Access_Control_V2/.env"
echo "  nano /home/admintechfarm/Access_Control_V2/.env"
