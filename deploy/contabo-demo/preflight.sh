#!/usr/bin/env bash
# Read-only preflight. Does not stop, remove or change containers, networks or volumes.
set -euo pipefail
command -v docker >/dev/null || { echo "Docker missing"; exit 1; }
docker info >/dev/null
docker compose version >/dev/null
command -v curl >/dev/null || { echo "curl missing"; exit 1; }
echo "Contabo demo deployment preflight: no changes made"
echo "Disk:"; df -h /
echo "Memory:"; free -h
echo "Occupied legacy ports 18084 (RAG testbed) and 18088 (nginx) are PRESERVED."
echo "Port listeners potentially conflicting with isolated demo ports:"
ss -ltnH | awk '{print $4}' | grep -E ':(18085|18086|18089)
echo "Existing identity (MUST REMAIN UNTOUCHED):"
docker ps --filter name='^/africorestack-identity$' --format '{{.Names}} {{.Status}}'
echo "Existing identity database (MUST REMAIN UNTOUCHED):"
docker ps --filter name='^/africorestack-identity-postgres$' --format '{{.Names}} {{.Status}}'
echo "Other demo containers if present:"
docker ps -a --filter name='^/ads-demo-' --format '{{.Names}} {{.Status}}'
echo "Verify selected ports are unused, GHCR access works and TLS/DNS are planned before applying compose."
 || true
echo "Existing identity (MUST REMAIN UNTOUCHED):"
docker ps --filter name='^/africorestack-identity$' --format '{{.Names}} {{.Status}}'
echo "Existing identity database (MUST REMAIN UNTOUCHED):"
docker ps --filter name='^/africorestack-identity-postgres$' --format '{{.Names}} {{.Status}}'
echo "Other demo containers if present:"
docker ps -a --filter name='^/ads-demo-' --format '{{.Names}} {{.Status}}'
echo "Verify selected ports are unused, GHCR access works and TLS/DNS are planned before applying compose."
