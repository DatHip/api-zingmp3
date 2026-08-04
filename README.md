# api-zingmp3

Read-only caching proxy in front of the Zing MP3 web API. It signs requests the way
zingmp3.vn's own client does, caches responses at two levels, and degrades to stale
data instead of failing when the upstream is unhappy.

Backend for [zing-mp3-d4t](https://github.com/dathuynh1108/zing-mp3-d4t).

## Run it

```bash
npm install
cp .env.example .env    # optional — every value has a working default
npm run dev             # nodemon on :5000
npm start               # plain node
npm test                # node:test, no network access required
npm run lint
```

## Layout

| File                            | Responsibility                                                   |
| ------------------------------- | ---------------------------------------------------------------- |
| `server.js`                     | Express wiring: CORS, helmet, rate limit, routes, error handling. |
| `controllers/ZingController.js` | Validates the request, then hands a fetch thunk to the cache.     |
| `cache.js`                      | TTL table, cache key normalization, SWR, circuit breaker.         |
| `zingClient.js`                 | Request signing, cookie handshake, upstream calls.                |
| `validators.js`                 | Input rules shared by the controllers.                            |

Requests flow `route → validate → cache → zingClient → upstream`. Validation runs
*before* the cache so a malformed request never allocates a cache key.

## Caching

Two layers, and it matters which one is doing the work:

1. **CDN (`Cache-Control: s-maxage`, `stale-while-revalidate`)** — the primary cache
   in production. Written by `setCdnCache()` for every route with a TTL.
2. **In-process (`node-cache`)** — the primary cache when self-hosted, best-effort on
   serverless. Every Vercel instance has its own copy, so hit rate across N instances
   is low by construction.

The same asymmetry applies to the **circuit breaker** and the **rate limiter**: both
keep state in process memory, so on Vercel the effective rate limit is
`120/min × instance count`. Treat them as abuse dampening, not as a quota or a
cluster-wide breaker. Moving either to a shared store (Upstash Redis) is the upgrade
path if this ever needs real numbers.

Serve-stale-and-revalidate is **disabled** under `process.env.VERCEL`: the instance is
frozen the moment the response is written, so a background refetch would be killed
mid-flight and would leak its in-flight marker forever. The edge's
`stale-while-revalidate` covers that case instead.

Per-route TTLs live in the `ROUTES` table in `cache.js`, along with the whitelist of
query params allowed into the cache key — anything else (`?utm_source=…`) is dropped
so it cannot bust the cache or grow the key space. The store is bounded by
`CACHE_MAX_KEYS` and every entry carries a `ttl × CACHE_STALE_MULT` expiry.

`X-Cache` on every response tells you which path ran: `HIT`, `MISS`, `STALE`,
`STALE-ERROR`, `STALE-CIRCUIT`, `CIRCUIT-OPEN`, `BYPASS`. It is exposed via CORS, so
frontend devtools can read it.

## Timeouts

A cold request makes two sequential upstream calls — cookie handshake, then the API
call. `ZING_TIMEOUT_MS` is **per call**, so `2 × ZING_TIMEOUT_MS` must stay under
`maxDuration` in `vercel.json` (currently 3.5s × 2 against a 15s ceiling). Blow that
budget and the platform kills the function before the error handler can run: no
error response, no breaker signal.

## Deployment

Vercel, `sin1` (Singapore — closest region to the upstream). `vercel.json` uses the
legacy `builds` + `routes` schema on purpose: the modern `functions` + `rewrites`
schema wants the entry point under `api/`, and that move cannot be verified without a
live deploy. It works as-is; migrate it deliberately, not as a drive-by.

## Configuration

See `.env.example`. Everything has a default; the Zing credentials only need setting
if Zing rotates its web-client keys.

`CORS_ORIGINS` entries accept `*` as a single-hostname-label wildcard, which is how
you allow a frontend's preview deployments — their hostname carries a fresh build
hash every time:

```
CORS_ORIGINS=https://zing-mp3-d4t.vercel.app,https://zing-mp3-d4t-*.vercel.app
```

Callers should point at the **production** domain (`https://api-zingmp3.vercel.app/api`),
not at a preview URL: preview deployments sit behind Vercel's Deployment Protection
and answer unauthenticated requests with a 401 HTML page. Note the `/api` suffix and
the absence of a trailing slash — a base URL ending in `/` yields `//home`, which
Vercel answers with a 308 redirect rather than the route.

## Endpoints

All under `/api`. Plus `GET /health` (uptime + cache stats) and `GET /` (liveness).

`home` · `playlist/:id` · `suggestedplaylists/:id` · `song/:id` · `songinfo/:id` ·
`songlyrics/:id` · `homechart` · `newreleasechart` · `weekchart/:id` · `radio` ·
`newfeeds?id&page` · `artist/:name` · `hubhome` · `hubdetails/:id` · `top100` ·
`listmv?id&page&count&sort` · `categorymv/:id` · `mv/:id` · `events` ·
`eventinfo/:id` · `searchall?keyword` · `searchtype?keyword&type&page&count` ·
`recommendkeyword` · `suggestionkeyword?keyword`

Errors are `{ err: 1, msg, reqId }`. Upstream and unclassified failures collapse to a
generic `502` — axios puts the signed upstream URL in its error messages and that must
not reach a client. `reqId` correlates the response with the server log line.

## License

ISC
