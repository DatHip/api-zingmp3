// The point of this file is the unset env var, and server.js reads CORS_ORIGINS
// once at load — so it needs its own process, separate from cors.test.js.
delete process.env.CORS_ORIGINS

const test = require("node:test")
const assert = require("node:assert/strict")
const request = require("supertest")
const app = require("../server")

test("the frontend's origins are allowed with CORS_ORIGINS unset", async () => {
   for (const origin of [
      "https://zing-mp3-d4t.vercel.app",
      "https://zing-mp3-d4t-git-perf-revive-dathips-projects.vercel.app",
   ]) {
      const res = await request(app).get("/").set("Origin", origin)
      assert.equal(res.status, 200, `${origin} should be allowed by default`)
      assert.equal(res.headers["access-control-allow-origin"], origin)
   }
})

test("the default does not open the proxy to everyone", async () => {
   const res = await request(app).get("/").set("Origin", "https://some-other-app.vercel.app")
   assert.equal(res.status, 403)
})
