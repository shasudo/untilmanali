# UntilManali — Crew OS (Module 1: expenses + go-to list)

Private board for 6: Shathwik, Koushik, Deepika, Srinivas, Rushi (CR), Sonika.

## Run
```
cd untilmanali
pnpm install
pnpm build
PORT=8787 node server.js
```
Open http://localhost:8787. No login — pick your face and go.

## Deploy on oracle-stock (129.225.78.203)
Box already runs Caddy on 80/443 with `*.nip.io` TLS. UntilManali needs:
1. Node 22+ on the box (one-time).
2. Copy this folder over, `pnpm install && pnpm build`.
3. Run on loopback: `PORT=8787 node server.js` (systemd keeps it up).
4. Add a Caddy handle (subdomain or `handle /manali/*`) reversing to `127.0.0.1:8787`.
Data lives in `./data/crew.db` — back that file up, nothing else matters.

## Update
Local: `pnpm build`, then restart the server (static is cached in RAM).
Production: `./scripts/deploy.sh` — copies, builds, restarts, health-checks.
Confirm both sides match: `/api/v1/health` reports `version`, same as `package.json`.

## Pings (Web Push)
Generate keys once per server:
```
node -e "import('web-push').then(w => console.log(JSON.stringify(w.generateVAPIDKeys())))"
```
Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (and optional `VAPID_SUBJECT`, a `mailto:`) in the server environment. Without keys the app runs fine, pings just stay off — the **pings** jump says so.

## Scale
- Web lives in `src/`, API in `server.js` under `Module:` markers.
- Module 2 = new table + `/api/v1/<name>` + new tile in `App.tsx`. No rewrite.
