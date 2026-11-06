#!/usr/bin/env bash
# Deploy the committed HEAD to the VPS. Run from the repo root on your machine:  bash deploy/vps/deploy.sh [user@host]
# Touches only Aerar: /opt/aerar (code, never .env) and the aerar service. Other services on the host are left alone.
set -euo pipefail
HOST="${1:-root@104.251.218.80}"
SHA="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then echo "Uncommitted changes; only committed code is deployed (HEAD $SHA)."; fi

echo "Deploying $SHA to $HOST"
git archive HEAD | ssh "$HOST" '
  set -euo pipefail
  cd /opt/aerar
  # Remove source dirs so files deleted in git do not linger; .env, node_modules and .next stay.
  rm -rf src scripts drizzle deploy docs public
  tar -x -C /opt/aerar
  chown -R aerar:aerar /opt/aerar
'
ssh "$HOST" "
  set -euo pipefail
  cd /opt/aerar
  sudo -u aerar nice npm ci --no-audit --no-fund --loglevel=error
  sudo -u aerar nice npm run build 2>&1 | tail -4
  systemctl restart aerar
  for i in \$(seq 1 30); do
    code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8800/ || true)
    [ \"\$code\" = 200 ] && break
    sleep 1
  done
  echo \"aerar: \$(systemctl is-active aerar), local check \$code\"
"
echo "Public check: $(curl -s -o /dev/null -w '%{http_code}' https://aerar.duckdns.org/)"
