// server.js reads CORS_ORIGINS once at load, so this needs its own process.
process.env.CORS_ORIGINS = "https://zing-mp3-d4t.vercel.app,https://zing-mp3-d4t-*.vercel.app"

const test = require("node:test")
const assert = require("node:assert/strict")
const request = require("supertest")
const app = require("../server")

const origins = {
   exact: "https://zing-mp3-d4t.vercel.app",
   preview: "https://zing-mp3-d4t-git-perf-revive-dathips-projects.vercel.app",
   localhost: "http://localhost:3000",
   other: "https://zing-mp3-d4t.evil.app",
   siblingProject: "https://some-other-app.vercel.app",
}

test("exact, wildcard and localhost origins pass", async () => {
   for (const key of ["exact", "preview", "localhost"]) {
      const res = await request(app).get("/").set("Origin", origins[key])
      assert.equal(res.status, 200, `${key} (${origins[key]}) should be allowed`)
      assert.equal(res.headers["access-control-allow-origin"], origins[key])
   }
})

test("the wildcard does not leak past its hostname label", async () => {
   for (const key of ["other", "siblingProject"]) {
      const res = await request(app).get("/").set("Origin", origins[key])
      assert.equal(res.status, 403, `${key} (${origins[key]}) should be rejected`)
   }
})
