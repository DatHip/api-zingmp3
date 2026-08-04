const test = require("node:test")
const assert = require("node:assert/strict")
const { cachedFetch, cacheKey, ttlFor, stats, reset } = require("../cache")
const { mockRes, mockReq, tick } = require("./helpers")

test.beforeEach(() => reset())

test("cacheKey drops params outside the route whitelist", () => {
   const a = mockReq("/api/searchtype?keyword=abc&type=song&utm_source=x", {
      keyword: "abc",
      type: "song",
      utm_source: "x",
   })
   const b = mockReq("/api/searchtype?type=song&keyword=abc", { type: "song", keyword: "abc" })
   assert.equal(cacheKey(a), cacheKey(b))
   assert.equal(cacheKey(a), "/api/searchtype?keyword=abc&type=song")
})

test("cacheKey ignores query on routes that declare none", () => {
   const req = mockReq("/api/home?anything=1", { anything: "1" })
   assert.equal(cacheKey(req), "/api/home")
})

test("ttlFor matches path params via prefix", () => {
   assert.equal(ttlFor("/api/song/ZWZB969E"), 300)
   assert.equal(ttlFor("/api/nope"), 0)
})

test("first call MISSes, second HITs without calling upstream", async () => {
   let calls = 0
   const fetcher = async () => {
      calls++
      return { data: calls }
   }

   const first = mockRes()
   await cachedFetch(mockReq("/api/home"), first, fetcher)
   assert.equal(first.headers["X-Cache"], "MISS")
   assert.deepEqual(first.body, { data: 1 })

   const second = mockRes()
   await cachedFetch(mockReq("/api/home"), second, fetcher)
   assert.equal(second.headers["X-Cache"], "HIT")
   assert.deepEqual(second.body, { data: 1 })
   assert.equal(calls, 1)
})

test("cached routes advertise edge caching, uncached ones bypass", async () => {
   const cached = mockRes()
   await cachedFetch(mockReq("/api/home"), cached, async () => ({}))
   assert.match(cached.headers["Cache-Control"], /^public, s-maxage=120, stale-while-revalidate=360$/)

   const uncached = mockRes()
   await cachedFetch(mockReq("/api/unlisted"), uncached, async () => ({}))
   assert.equal(uncached.headers["X-Cache"], "BYPASS")
   assert.equal(uncached.headers["Cache-Control"], undefined)
})

test("breaker opens after the failure threshold and short-circuits", async () => {
   const boom = async () => {
      throw new Error("upstream down")
   }

   for (let i = 0; i < 3; i++) {
      const res = mockRes()
      await assert.rejects(() => cachedFetch(mockReq("/api/unlisted"), res, boom))
   }

   const res = mockRes()
   await cachedFetch(mockReq("/api/unlisted"), res, boom)
   assert.equal(res.statusCode, 503)
   assert.equal(res.headers["X-Cache"], "CIRCUIT-OPEN")
   assert.equal(stats().openBreakers.length, 1)
})

test("a rejection Zing delivered on purpose never opens the breaker", async () => {
   const notFound = async () => {
      const err = new Error("Không tìm thấy bài hát này.")
      err.status = 404
      throw err
   }

   // Well past BREAKER_THRESHOLD: a track that is permanently unavailable must
   // not take the whole cache key down with it.
   for (let i = 0; i < 6; i++) {
      const res = mockRes()
      await assert.rejects(() => cachedFetch(mockReq("/api/song/ZWZB969F"), res, notFound))
   }

   assert.deepEqual(stats().openBreakers, [])
})

test("a stale entry is served immediately and revalidated in the background", async (t) => {
   let calls = 0
   const fetcher = async () => {
      calls++
      return { data: calls }
   }

   await cachedFetch(mockReq("/api/home"), mockRes(), fetcher)

   t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 130_000 })

   const stale = mockRes()
   await cachedFetch(mockReq("/api/home"), stale, fetcher)
   assert.equal(stale.headers["X-Cache"], "STALE")
   assert.deepEqual(stale.body, { data: 1 }, "responds with the old body, does not wait on upstream")

   await tick()
   assert.equal(calls, 2, "revalidation fired")
   assert.equal(stats().inFlight, 0, "in-flight marker released")

   const fresh = mockRes()
   await cachedFetch(mockReq("/api/home"), fresh, fetcher)
   assert.equal(fresh.headers["X-Cache"], "HIT")
   assert.deepEqual(fresh.body, { data: 2 })
})

test("entries are evicted once past the stale window", async (t) => {
   await cachedFetch(mockReq("/api/home"), mockRes(), async () => ({ data: 1 }))
   assert.equal(stats().keys, 1)

   // ttl 120 * CACHE_STALE_MULT 3 = 360s of retention.
   t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 400_000 })
   assert.equal(stats().keys, 0, "node-cache TTL expired the entry instead of leaking it")
})
