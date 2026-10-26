#!/usr/bin/env bash
# Read-only Contabo preflight. Does not stop, remove, recreate or modify any container.
set -euo pipefail
command -v docker >/dev/null || { echo "Docker missing"; exit 1; }
command -v curl >/dev/null || { echo "curl missing"; exit 1; }
command -v ss >/dev/null || { echo "ss missing"; exit 1; }
docker info >/dev/null
docker compose version
echo "=== ADS DEMO DEPLOYMENT PREFLIGHT (READ ONLY) ==="
echo "Legacy reservations identified 2026-10-22:"
echo "  :18084 = RAG testbed (preserve)"
echo "  :18088 = existing nginx returning 502 (preserve)"
echo "  :18085 = public CoreStack retail container (preserve)"
echo "Proposed new ports: :18090 demo identity, :18086 Commerce, :18089 portal"
echo "=== DISK ==="
df -h /
echo "=== MEMORY ==="
free -h
echo "=== CURRENT LISTENERS (review any listed port before deploying) ==="
ss -ltnp | grep -E ':(18084|18085|18086|18088|18089|18090)([[:space:]]|$)' || true
echo "=== EXISTING IDENTITY (DO NOT MODIFY) ==="
docker ps --filter name='^/africorestack-identity$' --format '{{.Names}} {{.Status}}'
docker ps --filter name='^/africorestack-identity-postgres$' --format '{{.Names}} {{.Status}}'
echo "=== EXISTING RAG TESTBED (DO NOT MODIFY) ==="
docker ps --filter name='^/corestack-rag-runtime-testbed$' --format '{{.Names}} {{.Status}} {{.Ports}}'
echo "=== EXISTING DEMO CONTAINERS ==="
docker ps -a --filter name='^/ads-demo-' --format '{{.Names}} {{.Status}} {{.Ports}}'
echo "Check that 18090, 18086, 18089 are actually free before installing anything."
