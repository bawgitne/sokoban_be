# Sokoban Backend

Cloudflare Worker API for Sokorace.

## Required secret

Set `MONGODB_URI` in Cloudflare Workers:

```bash
npx wrangler secret put MONGODB_URI
```

Local development reads `.dev.vars`, which is ignored by Git.

## Commands

```bash
npm install
npm run dev
npm run deploy
```

Health checks:

- `/health`
- `/db/ping`
