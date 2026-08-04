const test = require("node:test")
const assert = require("node:assert/strict")
const { statusForUpstream } = require("../zingClient")

test("a known Zing code maps to its own status", () => {
   assert.equal(statusForUpstream({ err: -1023, msg: "Không tìm thấy bài hát này." }), 404)
})

test("a geo-licensed rejection is 451, not a gateway error", () => {
   assert.equal(statusForUpstream({ err: -201, msg: "Nội dung này không tải được cho quốc gia của bạn!" }), 451)
})

test("an unrecognised rejection still stays in the 4xx range", () => {
   // The point is the range, not the exact code: anything 4xx stops the
   // frontend retrying and keeps the breaker closed.
   const status = statusForUpstream({ err: -9999, msg: "Lỗi lạ chưa gặp bao giờ" })
   assert.ok(status >= 400 && status < 500, `expected a 4xx, got ${status}`)
})
