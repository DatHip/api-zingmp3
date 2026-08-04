// cache.js reads process.env.VERCEL once at load, so serverless behaviour needs
// its own process. `node --test` gives each file one, hence the separate suite.
process.env.VERCEL = "1"

const test = require("node:test")
const assert = require("node:assert/strict")
const { cachedFetch, reset } = require("../cache")
const { mockRes, mockReq } = require("./helpers")

test.beforeEach(() => reset())

test("serverless does not background-revalidate; it refetches inline", async (t) => {
   let calls = 0
   const fetcher = async () => {
      calls++
      return { data: calls }
   }

   await cachedFetch(mockReq("/api/home"), mockRes(), fetcher)
   t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 130_000 })

   const res = mockRes()
   await cachedFetch(mockReq("/api/home"), res, fetcher)
   assert.equal(res.headers["X-Cache"], "MISS", "no STALE path — the instance would be frozen")
   assert.deepEqual(res.body, { data: 2 })
   assert.equal(calls, 2)
})

test("a failed refetch falls back to the stale body", async (t) => {
   let fail = false
   const fetcher = async () => {
      if (fail) throw new Error("upstream down")
      return { data: "cached" }
   }

   await cachedFetch(mockReq("/api/home"), mockRes(), fetcher)
   t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 130_000 })
   fail = true

   const res = mockRes()
   await cachedFetch(mockReq("/api/home"), res, fetcher)
   assert.equal(res.headers["X-Cache"], "STALE-ERROR")
   assert.deepEqual(res.body, { data: "cached" })
})
