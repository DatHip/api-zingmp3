const test = require("node:test")
const assert = require("node:assert/strict")
const { statusForUpstream, messageForUpstream } = require("../zingClient")

test("a known Zing code maps to its own status", () => {
   // -1023 is refused from a Vietnamese IP too, so it is a missing track and
   // not the region case, however much the two look alike from abroad.
   assert.equal(statusForUpstream({ err: -1023, msg: "Không tìm thấy bài hát này." }), 404)
})

test("a geo-licensed rejection is 451, not a gateway error", () => {
   assert.equal(statusForUpstream({ err: -201, msg: "Nội dung này không tải được cho quốc gia của bạn!" }), 451)
})

test("the geo message is rewritten so it does not blame the listener", () => {
   const data = { err: -201, msg: "Nội dung này không tải được cho quốc gia của bạn!" }
   const msg = messageForUpstream(data, statusForUpstream(data))
   assert.notEqual(msg, data.msg)
   assert.match(msg, /máy chủ/)
})

test("every other upstream message is forwarded verbatim", () => {
   const data = { err: -1023, msg: "Không tìm thấy bài hát này." }
   assert.equal(messageForUpstream(data, statusForUpstream(data)), data.msg)
})

test("an unrecognised rejection still stays in the 4xx range", () => {
   // The point is the range, not the exact code: anything 4xx stops the
   // frontend retrying and keeps the breaker closed.
   const status = statusForUpstream({ err: -9999, msg: "Lỗi lạ chưa gặp bao giờ" })
   assert.ok(status >= 400 && status < 500, `expected a 4xx, got ${status}`)
})
