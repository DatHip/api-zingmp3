const NodeCache = require("node-cache")

const STALE_MULTIPLIER = Number(process.env.CACHE_STALE_MULT || 3)
const MAX_KEYS = Number(process.env.CACHE_MAX_KEYS || 5000)
const BREAKER_WINDOW_MS = Number(process.env.BREAKER_WINDOW_MS || 30_000)
const BREAKER_THRESHOLD = Number(process.env.BREAKER_THRESHOLD || 3)
const BREAKER_OPEN_MS = Number(process.env.BREAKER_OPEN_MS || 5 * 60_000)

// On Vercel every instance is short-lived and there are N of them, so the
// in-memory layer below (store / inFlight / breaker) is best-effort only —
// the real protection is the CDN Cache-Control written by setCdnCache().
// Self-hosted, the same code is the primary cache. Anything that depends on
// surviving past the response (background revalidation) is disabled on
// serverless because the instance is frozen the moment we finish writing.
const IS_SERVERLESS = Boolean(process.env.VERCEL)

// ttl: seconds to serve fresh. query: the only query params that belong in the
// cache key — everything else is dropped so `?utm_source=x` can't bust the
// cache or grow the key space.
const ROUTES = {
   "/api/home": { ttl: 120 },
   "/api/homechart": { ttl: 600 },
   "/api/newreleasechart": { ttl: 600 },
   "/api/top100": { ttl: 900 },
   "/api/hubhome": { ttl: 1800 },
   "/api/radio": { ttl: 900 },
   "/api/recommendkeyword": { ttl: 3600 },
   "/api/songlyrics": { ttl: 86400 },
   "/api/songinfo": { ttl: 3600 },
   // Signed stream URLs stay valid for hours; 5 min is safe and takes the
   // hottest path in the app (every play) off the upstream.
   "/api/song": { ttl: 300 },
   "/api/artist": { ttl: 1800 },
   "/api/playlist": { ttl: 900 },
   "/api/hubdetails": { ttl: 1800 },
   "/api/categorymv": { ttl: 1800 },
   "/api/mv": { ttl: 1800 },
   "/api/weekchart": { ttl: 900, query: ["week", "year"] },
   "/api/suggestedplaylists": { ttl: 900 },
   "/api/newfeeds": { ttl: 300, query: ["id", "page"] },
   "/api/searchall": { ttl: 300, query: ["keyword"] },
   "/api/searchtype": { ttl: 300, query: ["keyword", "type", "page", "count"] },
   "/api/suggestionkeyword": { ttl: 60, query: ["keyword"] },
   "/api/listmv": { ttl: 900, query: ["id", "page", "count", "sort"] },
}

// Entries expire on their own (ttl passed to store.set) and the store is
// bounded, so a flood of distinct search keywords can't grow it without limit.
const store = new NodeCache({ stdTTL: 0, checkperiod: 120, useClones: false, maxKeys: MAX_KEYS })
const inFlight = new Set()
const breaker = new Map()

function routeFor(path) {
   for (const key of Object.keys(ROUTES)) {
      if (path === key || path.startsWith(key + "/")) return ROUTES[key]
   }
   return null
}

function ttlFor(url) {
   const route = routeFor(url.split("?")[0])
   return route ? route.ttl : 0
}

// Normalized so `?a=1&b=2`, `?b=2&a=1` and `?a=1&b=2&junk=x` share one entry.
function cacheKey(req) {
   const path = req.originalUrl.split("?")[0]
   const route = routeFor(path)
   const allowed = route?.query
   if (!allowed?.length) return path
   const parts = []
   for (const name of [...allowed].sort()) {
      const value = req.query[name]
      if (value !== undefined && value !== "") parts.push(`${name}=${value}`)
   }
   return parts.length ? `${path}?${parts.join("&")}` : path
}

function breakerOpen(key) {
   const b = breaker.get(key)
   return Boolean(b && b.openUntil > Date.now())
}

// The breaker exists to stop hammering an upstream that is down. A verdict
// Zing delivered on purpose — not found, or licensed out of our region — is
// not an outage, and counting it would take one permanently unplayable track
// and open the circuit for every caller of that key.
function isOutage(err) {
   const status = err?.status
   return !(status >= 400 && status < 500)
}

function recordFail(key) {
   const now = Date.now()
   const b = breaker.get(key) || { fails: [], openUntil: 0 }
   b.fails = b.fails.filter((t) => now - t < BREAKER_WINDOW_MS)
   b.fails.push(now)
   if (b.fails.length >= BREAKER_THRESHOLD) b.openUntil = now + BREAKER_OPEN_MS
   breaker.set(key, b)
}

function recordSuccess(key) {
   breaker.delete(key)
}

function isWithinStaleWindow(entry, ttl) {
   const age = (Date.now() - entry.storedAt) / 1000
   return age < ttl * STALE_MULTIPLIER
}

// maxKeys makes store.set throw once the cache is full. A failed write just
// means the next request is a miss, which is strictly better than crashing the
// request that happened to be the one to hit the ceiling.
function put(key, body, ttl) {
   try {
      store.set(key, { body, storedAt: Date.now() }, Math.ceil(ttl * STALE_MULTIPLIER))
   } catch {
      /* cache full — serve uncached */
   }
}

function setCdnCache(res, ttl) {
   // Vercel Edge / CDN caching. s-maxage caches at edge for `ttl` seconds;
   // stale-while-revalidate lets edge serve stale for another `ttl*STALE_MULT`
   // while asynchronously revalidating.
   res.setHeader("Cache-Control", `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * STALE_MULTIPLIER}`)
}

function circuitOpenResponse(res) {
   res.setHeader("X-Cache", "CIRCUIT-OPEN")
   return res.status(503).json({ err: 1, msg: "upstream circuit open" })
}

async function cachedFetch(req, res, fetcher) {
   const key = cacheKey(req)
   const ttl = ttlFor(key)

   if (!ttl) {
      if (breakerOpen(key)) return circuitOpenResponse(res)
      try {
         const body = await fetcher()
         recordSuccess(key)
         res.setHeader("X-Cache", "BYPASS")
         return res.json(body)
      } catch (err) {
         if (isOutage(err)) recordFail(key)
         throw err
      }
   }

   setCdnCache(res, ttl)

   // NOTE: useClones is false, so `entry.body` is handed out by reference.
   // Never mutate a response body downstream of this point or the cache is
   // poisoned for every subsequent hit.
   const entry = store.get(key)

   if (entry) {
      const age = (Date.now() - entry.storedAt) / 1000
      if (age < ttl) {
         res.setHeader("X-Cache", "HIT")
         return res.json(entry.body)
      }
      // Serve-stale-and-revalidate only works where the process outlives the
      // response. On serverless we fall through to a blocking fetch and let the
      // edge's stale-while-revalidate absorb the latency instead; otherwise the
      // revalidation is killed mid-flight and `inFlight` leaks the key forever.
      if (!IS_SERVERLESS && isWithinStaleWindow(entry, ttl)) {
         res.setHeader("X-Cache", "STALE")
         res.json(entry.body)
         if (!inFlight.has(key) && !breakerOpen(key)) {
            inFlight.add(key)
            fetcher()
               .then((body) => {
                  put(key, body, ttl)
                  recordSuccess(key)
               })
               .catch((err) => {
                  if (isOutage(err)) recordFail(key)
               })
               .finally(() => inFlight.delete(key))
         }
         return
      }
   }

   if (breakerOpen(key)) {
      if (entry) {
         res.setHeader("X-Cache", "STALE-CIRCUIT")
         return res.json(entry.body)
      }
      return circuitOpenResponse(res)
   }

   try {
      const body = await fetcher()
      put(key, body, ttl)
      recordSuccess(key)
      res.setHeader("X-Cache", "MISS")
      return res.json(body)
   } catch (err) {
      if (isOutage(err)) recordFail(key)
      if (entry) {
         res.setHeader("X-Cache", "STALE-ERROR")
         return res.json(entry.body)
      }
      throw err
   }
}

function stats() {
   const now = Date.now()
   let fresh = 0
   let stale = 0
   for (const key of store.keys()) {
      const entry = store.get(key)
      if (!entry) continue
      const age = (now - entry.storedAt) / 1000
      if (age < ttlFor(key)) fresh++
      else stale++
   }
   const openBreakers = [...breaker.entries()].filter(([, b]) => b.openUntil > now).map(([k]) => k)
   return { keys: store.keys().length, maxKeys: MAX_KEYS, fresh, stale, openBreakers, inFlight: inFlight.size }
}

// Test seam: the module keeps process-wide state, so suites need a clean slate.
function reset() {
   store.flushAll()
   inFlight.clear()
   breaker.clear()
}

module.exports = { cachedFetch, stats, ttlFor, cacheKey, reset }
