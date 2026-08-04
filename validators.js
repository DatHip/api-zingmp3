// Input validation runs *before* the cache layer so malformed requests never
// allocate a cache key and never reach the upstream. See cache.js for why the
// key space has to stay bounded.

class BadRequest extends Error {
   constructor(msg) {
      super(msg)
      this.status = 400
   }
}

// Zing content ids are short uppercase alphanumerics (e.g. ZWZB969E). The regex
// is deliberately a little wider than observed reality so a format change on
// their side degrades into an upstream 404 rather than a blanket 400 here.
const ID_RE = /^[A-Za-z0-9_-]{1,32}$/
// Artist aliases are url slugs: son-tung-mtp, my-tam, ...
const ALIAS_RE = /^[A-Za-z0-9._-]{1,100}$/
const KEYWORD_MAX = 100

function id(value, field = "id") {
   if (typeof value !== "string" || !ID_RE.test(value)) {
      throw new BadRequest(`${field} must match ${ID_RE}`)
   }
   return value
}

function alias(value, field = "name") {
   if (typeof value !== "string" || !ALIAS_RE.test(value)) {
      throw new BadRequest(`${field} must match ${ALIAS_RE}`)
   }
   return value
}

function keyword(value, field = "keyword") {
   if (typeof value !== "string") throw new BadRequest(`${field} is required`)
   const trimmed = value.trim()
   if (!trimmed) throw new BadRequest(`${field} is required`)
   if (trimmed.length > KEYWORD_MAX) throw new BadRequest(`${field} must be <= ${KEYWORD_MAX} chars`)
   return trimmed
}

// Absent/blank falls back to the default; present-but-invalid is a 400 so a
// typo surfaces instead of silently paging from 1.
function int(value, { min, max, fallback, field }) {
   if (value === undefined || value === "") return fallback
   const n = Number(value)
   if (!Number.isInteger(n) || n < min || n > max) {
      throw new BadRequest(`${field} must be an integer in [${min}, ${max}]`)
   }
   return n
}

function oneOf(value, allowed, { fallback, field }) {
   if (value === undefined || value === "") return fallback
   if (!allowed.includes(value)) throw new BadRequest(`${field} must be one of ${allowed.join("|")}`)
   return value
}

module.exports = { BadRequest, id, alias, keyword, int, oneOf }
