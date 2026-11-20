#!/bin/bash
# UntilManali one-command update. Usage: ./scripts/deploy.sh [ssh-host]
set -e
HOST="${1:-oracle-stock}"
rsync -az --delete --exclude node_modules --exclude dist --exclude data --exclude .env --exclude .git \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=10" ./ "$HOST:untilmanali/"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" \
  'cd untilmanali && npm install --no-audit --no-fund && npm run build && sudo systemctl restart untilmanali && sleep 3 && curl -sf http://127.0.0.1:8787/api/v1/health'
