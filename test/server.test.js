const test = require("node:test")
const assert = require("node:assert/strict")
const request = require("supertest")
const app = require("../server")

test("root answers, unknown routes 404", async () => {
   const root = await request(app).get("/")
   assert.equal(root.status, 200)
   assert.deepEqual(root.body, { name: "zingmp3-api", ok: true })

   // Regression: a catch-all app.use("/") used to answer this with 200.
   const missing = await request(app).get("/api/not-a-route")
   assert.equal(missing.status, 404)
   assert.equal(missing.body.err, 1)
})

test("health reports cache state", async () => {
   const res = await request(app).get("/health")
   assert.equal(res.status, 200)
   assert.equal(res.body.status, "ok")
   assert.ok(Number.isInteger(res.body.cache.keys))
})

test("every response carries a request id", async () => {
   const res = await request(app).get("/")
   assert.match(res.headers["x-request-id"], /^[0-9a-f-]{36}$/)
})

test("malformed input is rejected before any upstream call", async () => {
   const cases = [
      ["/api/song/way-too-long-an-identifier-to-be-real-zing-id", /id must match/],
      ["/api/artist/not%20a%20slug", /name must match/],
      ["/api/searchall", /keyword is required/],
      ["/api/searchtype?keyword=abc&type=bogus", /type must be one of/],
      ["/api/listmv?id=ZWZB969E&page=0", /page must be an integer/],
   ]

   for (const [url, expected] of cases) {
      const res = await request(app).get(url)
      assert.equal(res.status, 400, `${url} should be 400, got ${res.status}`)
      assert.match(res.body.msg, expected)
      assert.ok(res.body.reqId, "400s are traceable too")
   }
})

test("a disallowed origin is 403, not 500", async () => {
   const res = await request(app).get("/").set("Origin", "https://evil.example")
   assert.equal(res.status, 403)
   assert.match(res.body.msg, /origin not allowed/)
})

test("localhost is allowed in dev without configuration", async () => {
   const res = await request(app).get("/").set("Origin", "http://localhost:3000")
   assert.equal(res.status, 200)
})
