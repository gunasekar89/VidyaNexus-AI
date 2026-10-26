#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu machine (KodeKloud playground, AWS EC2, any VPS).
# Installs Docker if needed, asks once for your AI settings (Azure OpenAI or Claude), then builds and starts VidyaNexus.
#
#   bash deploy/setup.sh
#
# Non-interactive: AZURE_OPENAI_ENDPOINT=... AZURE_OPENAI_API_KEY=... AZURE_OPENAI_DEPLOYMENT=... bash deploy/setup.sh
#              or: ANTHROPIC_API_KEY=sk-ant-... APP_PORT=80 bash deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

# 1. Docker + Compose
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | $SUDO sh
fi
if ! $SUDO docker compose version >/dev/null 2>&1; then
  say "Installing the Docker Compose plugin"
  $SUDO apt-get update -y && $SUDO apt-get install -y docker-compose-plugin
fi
$SUDO systemctl enable --now docker >/dev/null 2>&1 || true

# 2. Small machines (1 GB RAM) need swap to build the app.
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 1800 ] && ! swapon --show | grep -q .; then
  say "Adding 2 GB of swap (this machine has ${mem_mb} MB RAM)"
  $SUDO fallocate -l 2G /swapfile && $SUDO chmod 600 /swapfile && $SUDO mkswap /swapfile >/dev/null && $SUDO swapon /swapfile
fi

# 3. Settings
if [ ! -f .env ]; then
  cp .env.example .env
  # Writes KEY=value into .env, escaping characters sed would treat specially.
  set_env() {
    [ -z "$2" ] && return 0
    local v=${2//\\/\\\\}; v=${v//&/\\&}; v=${v//|/\\|}
    sed -i "s|^$1=.*|$1=$v|" .env
  }
  az_endpoint="${AZURE_OPENAI_ENDPOINT:-}" az_key="${AZURE_OPENAI_API_KEY:-}" az_deployment="${AZURE_OPENAI_DEPLOYMENT:-}"
  key="${ANTHROPIC_API_KEY:-}"
  if [ -z "$az_key$key" ] && [ -t 0 ]; then
    echo "Which AI should the tutor use?"
    echo "  1) Azure OpenAI (KodeKloud Azure playground)"
    echo "  2) Claude API key"
    echo "  3) None for now (offline sample answers)"
    read -rp "Choose 1, 2 or 3: " choice
    case "$choice" in
      1)
        read -rp "Azure endpoint or Target URI (https://...): " az_endpoint
        read -rsp "Azure key: " az_key; echo
        if [[ "$az_endpoint" != *"/deployments/"* ]]; then read -rp "Deployment name (e.g. gpt-4o-mini): " az_deployment; fi
        ;;
      2) read -rsp "Paste your Anthropic API key (starts with sk-ant-): " key; echo ;;
    esac
  fi
  set_env AZURE_OPENAI_ENDPOINT "$az_endpoint"
  set_env AZURE_OPENAI_API_KEY "$az_key"
  set_env AZURE_OPENAI_DEPLOYMENT "$az_deployment"
  set_env ANTHROPIC_API_KEY "$key"
  [ -n "${APP_PORT:-}" ] && sed -i "s|^APP_PORT=.*|APP_PORT=${APP_PORT}|" .env
  chmod 600 .env
fi
port=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
port=${port:-80}

# 4. Build and start
say "Building and starting VidyaNexus (first build takes a few minutes)"
$SUDO docker compose up -d --build

say "Waiting for the app to come up"
for _ in $(seq 1 30); do
  if curl -fs "http://localhost:${port}/api/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fs "http://localhost:${port}/api/health" && echo

public_ip=$(curl -fs --max-time 3 https://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
say "Done! VidyaNexus is running."
echo "  On this machine:  http://localhost:${port}"
echo "  From outside:     http://${public_ip}:${port}   (the port must be open in the firewall / security group)"
echo "  Demo logins:      ananya.s@vidyanexus.school / ananya123   and   lakshmi.r@vidyanexus.school / teacher123"
echo "  Logs:             $SUDO docker compose logs -f"
