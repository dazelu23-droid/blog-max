# Margin Notes

A blog platform (Hono + Cloudflare Workers + D1) with accounts, posts, comments,
and a newsletter signup.

**Live:** https://margin-notes-blog.dazelu20.workers.dev

## Features

- Email/password auth with sessions (HTTP-only cookies)
- Post creation, listing, and per-slug pages
- Threaded comments
- Newsletter subscription
- Multi-language UI strings (`server/public/i18n.js`)

## Stack

- [Hono](https://hono.dev) running on [Cloudflare Workers](https://workers.cloudflare.com/)
- [D1](https://developers.cloudflare.com/d1/) (SQLite) for storage
- Static frontend served from `server/public`

## Project layout

```
server/
  src/index.js    # routes (auth, posts, comments, subscribe)
  src/auth.js     # password hashing + session helpers
  public/         # static HTML/CSS/JS frontend
  schema.sql      # D1 schema (run once against a fresh database)
  wrangler.jsonc  # Worker + D1 binding config
```

## Local development

```bash
cd server
npm install
npm run dev
```

## Deploy

See [SKILL.md](SKILL.md) for the full Cloudflare Workers + D1 deploy guide.

```bash
cd server
npx wrangler deploy
```

## Known limitations

- File/image uploads (`/api/uploads`, `/uploads/:key`) require an R2 bucket
  binding that isn't currently enabled on the deploy target's Cloudflare
  account — those endpoints will error until R2 is enabled and the
  `r2_buckets` binding is restored in `wrangler.jsonc`.
