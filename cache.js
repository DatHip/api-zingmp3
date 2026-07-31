const NodeCache = require("node-cache")

const STALE_MULTIPLIER = Number(process.env.CACHE_STALE_MULT || 3)
const BREAKER_WINDOW_MS = Number(process.env.BREAKER_WINDOW_MS || 30_000)
const BREAKER_THRESHOLD = Number(process.env.BREAKER_THRESHOLD || 3)
const BREAKER_OPEN_MS = Number(process.env.BREAKER_OPEN_MS || 5 * 60_000)

const TTL = {
   "/api/home": 120,
   "/api/homechart": 600,
   "/api/newreleasechart": 600,
   "/api/top100": 900,
   "/api/hubhome": 1800,
   "/api/radio": 900,
   "/api/recommendkeyword": 3600,
   "/api/songlyrics": 86400,
   "/api/songinfo": 3600,
   "/api/artist": 1800,
   "/api/playlist": 900,
   "/api/hubdetails": 1800,
   "/api/categorymv": 1800,
   "/api/mv": 1800,
   "/api/weekchart": 900,
   "/api/suggestedplaylists": 900,
   "/api/searchall": 300,
   "/api/searchtype": 300,
   "/api/suggestionkeyword": 60,
   "/api/listmv": 900,
}

const store = new NodeCache({ stdTTL: 0, checkperiod: 600, useClones: false })
const inFlight = new Set()
const breaker = new Map()

function ttlFor(url) {
   const path = url.split("?")[0]
   for (const key of Object.keys(TTL)) {
      if (path === key || path.startsWith(key + "/")) return TTL[key]
   }
   return 0
}

function breakerOpen(key) {
   const b = breaker.get(key)
   return b && b.openUntil > Date.now()
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

function pruneExpired(entry, ttl) {
   const age = (Date.now() - entry.storedAt) / 1000
   return age < ttl * STALE_MULTIPLIER
}

async function cachedFetch(req, res, fetcher) {
   const key = req.originalUrl
   const ttl = ttlFor(key)

   if (!ttl) {
      if (breakerOpen(key)) {
         res.setHeader("X-Cache", "CIRCUIT-OPEN")
         return res.status(503).json({ err: 1, msg: "upstream circuit open" })
      }
      try {
         const body = await fetcher()
         recordSuccess(key)
         res.setHeader("X-Cache", "BYPASS")
         return res.json(body)
      } catch (err) {
         recordFail(key)
         throw err
      }
   }

   const entry = store.get(key)
   const now = Date.now()

   if (entry) {
      const age = (now - entry.storedAt) / 1000
      if (age < ttl) {
         res.setHeader("X-Cache", "HIT")
         return res.json(entry.body)
      }
      if (pruneExpired(entry, ttl)) {
         res.setHeader("X-Cache", "STALE")
         res.json(entry.body)
         if (!inFlight.has(key) && !breakerOpen(key)) {
            inFlight.add(key)
            fetcher()
               .then((body) => {
                  store.set(key, { body, storedAt: Date.now() })
                  recordSuccess(key)
               })
               .catch(() => recordFail(key))
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
      res.status(503).setHeader("X-Cache", "CIRCUIT-OPEN")
      return res.json({ err: 1, msg: "upstream circuit open" })
   }

   try {
      const body = await fetcher()
      store.set(key, { body, storedAt: Date.now() })
      recordSuccess(key)
      res.setHeader("X-Cache", "MISS")
      return res.json(body)
   } catch (err) {
      recordFail(key)
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
      const ttl = ttlFor(key)
      const age = (now - entry.storedAt) / 1000
      if (age < ttl) fresh++
      else stale++
   }
   const openBreakers = [...breaker.entries()].filter(([, b]) => b.openUntil > now).map(([k]) => k)
   return { keys: store.keys().length, fresh, stale, openBreakers, inFlight: inFlight.size }
}

module.exports = { cachedFetch, stats, ttlFor }
