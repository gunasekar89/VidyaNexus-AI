#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu machine (KodeKloud playground, AWS EC2, any VPS).
# Installs Docker if needed, asks for your Claude API key once, then builds and starts VidyaNexus.
#
#   bash deploy/setup.sh
#
# Non-interactive: ANTHROPIC_API_KEY=sk-ant-... APP_PORT=80 bash deploy/setup.sh
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
  key="${ANTHROPIC_API_KEY:-}"
  if [ -z "$key" ] && [ -t 0 ]; then
    read -rsp "Paste your Anthropic API key (starts with sk-ant-), or press Enter to run without AI: " key
    echo
  fi
  if [ -n "$key" ]; then
    sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${key}|" .env
  fi
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
