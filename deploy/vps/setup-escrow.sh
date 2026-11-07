#!/usr/bin/env bash
# One-time: deploy the Escrow factory on Base Sepolia, create the demo shop's escrow, and add their addresses to the
# VPS's .env. Run from the repo root on your machine, after deploy.sh:  bash deploy/vps/setup-escrow.sh [user@host]
# Uses the operator key already in /opt/aerar/.env (it never leaves the server) and a little of its Base Sepolia ETH.
set -euo pipefail
HOST="${1:-root@104.251.218.80}"
ssh "$HOST" '
  set -euo pipefail
  cd /opt/aerar
  out=$(sudo -u aerar node scripts/deploy-vault-factory.mjs)
  echo "$out"
  added=0
  for line in $(echo "$out" | grep -E "^(ESCROW_FACTORY_ADDRESS|DEMO_ESCROW_ADDRESS|VAULT_FACTORY_ADDRESS|SEAL_ADDRESS)=0x[0-9a-fA-F]{40}$" || true); do
    key=${line%%=*}
    if grep -q "^$key=" .env; then sed -i "s|^$key=.*|$line|" .env; else echo "$line" >> .env; fi
    echo "set $key"; added=1
  done
  if [ "$added" = 1 ]; then
    systemctl restart aerar
    sleep 3
    echo "aerar: $(systemctl is-active aerar)"
  fi
'
echo "Escrow shop check (expect 402): $(curl -s -o /dev/null -w '%{http_code}' https://aerar.duckdns.org/api/demo/escrow-brief)"
