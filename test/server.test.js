const test = require("node:test")
const assert = require("node:assert/strict")
const request = require("supertest")
const app = require("../server")
const { statusForUpstream, messageForUpstream } = require("../zingClient")

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

test("upstream verdicts map to 4xx, never 5xx", () => {
   // -1023 is a real not-found: ids that return it from Singapore return it
   // from a Vietnamese IP too, so it must not be dressed up as a geo-block.
   const missing = { err: -1023, msg: "Không tìm thấy bài hát này." }
   assert.equal(statusForUpstream(missing), 404)
   assert.equal(messageForUpstream(missing, 404), "Không tìm thấy bài hát này.")

   // The region case is the one Zing labels explicitly — that wording, not the
   // code, is what turns a response into 451 plus a message that names the
   // actual cause. 4xx also keeps the frontend from retrying and keeps the
   // circuit breaker (which ignores 4xx) closed.
   const geo = { err: -201, msg: "Nội dung không khả dụng tại quốc gia của bạn" }
   assert.equal(statusForUpstream(geo), 451)
   assert.match(messageForUpstream(geo, 451), /giới hạn theo quốc gia/)

   // Unknown codes are still a verdict, not a gateway failure.
   const unknown = { err: -9999, msg: "Lỗi lạ" }
   assert.equal(statusForUpstream(unknown), 404)
   assert.equal(messageForUpstream(unknown, 404), "Lỗi lạ")
})
