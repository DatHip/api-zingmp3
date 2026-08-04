const test = require("node:test")
const assert = require("node:assert/strict")
const v = require("../validators")

test("id accepts Zing-shaped ids and rejects junk", () => {
   assert.equal(v.id("ZWZB969E"), "ZWZB969E")
   for (const bad of ["", undefined, "a".repeat(33), "../../etc/passwd", "a b", "<script>"]) {
      assert.throws(() => v.id(bad), { status: 400 })
   }
})

test("alias accepts artist slugs", () => {
   assert.equal(v.alias("son-tung-mtp"), "son-tung-mtp")
   assert.throws(() => v.alias("son tung"), { status: 400 })
})

test("keyword trims and bounds", () => {
   assert.equal(v.keyword("  hello  "), "hello")
   assert.throws(() => v.keyword("   "), { status: 400 })
   assert.throws(() => v.keyword(undefined), { status: 400 })
   assert.throws(() => v.keyword("x".repeat(101)), { status: 400 })
})

test("int falls back when absent but rejects a bad value", () => {
   const opts = { min: 1, max: 100, fallback: 1, field: "page" }
   assert.equal(v.int(undefined, opts), 1)
   assert.equal(v.int("", opts), 1)
   assert.equal(v.int("7", opts), 7)
   assert.throws(() => v.int("0", opts), { status: 400 })
   assert.throws(() => v.int("abc", opts), { status: 400 })
   assert.throws(() => v.int("1.5", opts), { status: 400 })
})

test("oneOf falls back when absent but rejects a bad value", () => {
   const opts = { fallback: "listen", field: "sort" }
   assert.equal(v.oneOf(undefined, ["listen", "hot"], opts), "listen")
   assert.equal(v.oneOf("hot", ["listen", "hot"], opts), "hot")
   assert.throws(() => v.oneOf("nope", ["listen", "hot"], opts), { status: 400 })
})
