const crypto = require("crypto")
const express = require("express")
const cors = require("cors")
const compression = require("compression")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const ZingController = require("./controllers/ZingController")
const cacheModule = require("./cache")

const app = express()
const router = express.Router()

// Vercel (and any reverse proxy) forwards the client IP in X-Forwarded-For.
// Without this, express-rate-limit sees the proxy IP for every request and
// buckets all traffic together.
app.set("trust proxy", 1)
app.disable("x-powered-by")

// This proxy exists to serve one frontend, so its origins are the default
// rather than something CORS_ORIGINS must supply. An unset env var on a fresh
// deploy would otherwise reject every browser request while curl (which sends
// no Origin) keeps working — a failure that looks like a frontend bug.
const DEFAULT_ORIGINS = "https://zing-mp3-d4t.vercel.app,https://zing-mp3-d4t-*.vercel.app"

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || DEFAULT_ORIGINS)
   .split(",")
   .map((s) => s.trim())
   .filter(Boolean)

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

// Entries in CORS_ORIGINS may contain `*`, so a project's preview deployments
// — whose hostname carries a fresh build hash every time — can be allowed with
// one pattern: https://zing-mp3-d4t-*.vercel.app
const ORIGIN_MATCHERS = ALLOWED_ORIGINS.map((pattern) => {
   if (!pattern.includes("*")) return (origin) => origin === pattern
   const re = new RegExp("^" + pattern.split("*").map(escapeRe).join("[^.]*") + "$")
   return (origin) => re.test(origin)
})

function escapeRe(s) {
   return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isAllowedOrigin(origin) {
   if (ALLOWED_ORIGINS.includes("*")) return true
   if (LOCALHOST_RE.test(origin)) return true
   return ORIGIN_MATCHERS.some((match) => match(origin))
}

app.use((req, res, next) => {
   req.id = req.headers["x-request-id"] || crypto.randomUUID()
   res.setHeader("X-Request-Id", req.id)
   next()
})

app.use(
   cors({
      origin: (origin, cb) => {
         if (!origin) return cb(null, true)
         if (isAllowedOrigin(origin)) return cb(null, true)
         // Without an explicit status the handler below falls through to 500,
         // which makes a rejected origin indistinguishable from a real fault.
         const err = new Error("CORS: origin not allowed")
         err.status = 403
         return cb(err)
      },
      // Without this the browser hides X-Cache/X-Request-Id from JS, which
      // makes cache behaviour impossible to debug from frontend devtools.
      exposedHeaders: ["X-Cache", "X-Request-Id"],
   })
)
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }))
// Vercel's edge already gzip/brotli-compresses responses. Running compression()
// inside the function just burns CPU per invocation, so only use it self-hosted.
if (!process.env.VERCEL) app.use(compression())

app.use(
   "/api/",
   rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      // The default store is per-process. On Vercel that means the effective
      // limit is 120 * (number of live instances) — treat this as abuse
      // dampening, not a quota. A shared store is needed for a real one.
   })
)

router.get("/home", ZingController.getHome)
router.get("/playlist/:id", ZingController.getPlayList)
router.get("/suggestedplaylists/:id", ZingController.GetSuggestedPlaylists)
router.get("/song/:id", ZingController.getSong)
router.get("/songinfo/:id", ZingController.getSongInfo)
router.get("/songlyrics/:id", ZingController.getSongLyrics)
router.get("/homechart", ZingController.getHomeChart)
router.get("/newreleasechart", ZingController.getNewReleaseChart)
router.get("/weekchart/:id", ZingController.getWeekChart)
router.get("/radio", ZingController.getRadio)
router.get("/newfeeds", ZingController.getNewFeeds)
router.get("/artist/:name", ZingController.getArtist)
router.get("/hubhome", ZingController.getHub)
router.get("/hubdetails/:id", ZingController.getHubDetail)
router.get("/top100", ZingController.getTop100)
router.get("/listmv", ZingController.getListMv)
router.get("/categorymv/:id", ZingController.getCategoryMv)
router.get("/mv/:id", ZingController.getMv)
router.get("/events", ZingController.getEvents)
router.get("/eventinfo/:id", ZingController.getEventInfo)
router.get("/searchall", ZingController.getSearchAll)
router.get("/searchtype", ZingController.getSearchbyType)
router.get("/recommendkeyword", ZingController.getRecommendKeyword)
router.get("/suggestionkeyword", ZingController.getSuggestionKeyword)

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime(), cache: cacheModule.stats() }))

app.use("/api/", router)

app.get("/", (req, res) => res.json({ name: "zingmp3-api", ok: true }))

// Must stay narrow: a catch-all app.use("/") here would answer unknown /api
// routes with 200 and hide route typos from clients.
app.use((req, res) => res.status(404).json({ err: 1, msg: "Not found" }))

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
app.use((err, req, res, next) => {
   const raw = err?.status || err?.response?.status || 500
   // 5xx and unclassified failures collapse into a generic 502: axios attaches
   // request config (full upstream URL, apiKey, sig) to its error messages and
   // none of that should reach a client.
   const status = raw >= 500 ? 502 : raw
   // err.expose marks a message as safe to forward: either our own 4xx text or
   // Zing's user-facing error string. Everything else is replaced, because
   // axios error messages can carry the signed upstream URL.
   const safe = err?.expose || status < 500
   const msg = safe ? err?.message || "Bad Request" : "Upstream error"
   console.error(
      JSON.stringify({
         level: "error",
         reqId: req.id,
         method: req.method,
         url: req.originalUrl,
         status,
         err: err?.message || String(err),
      })
   )
   res.status(status).json({ err: 1, msg, reqId: req.id })
})

// @vercel/node requires this file and invokes the exported handler, so
// require.main is this module only when started directly (self-hosted or test).
module.exports = app

if (require.main === module) {
   const PORT = process.env.PORT || 5000
   app.listen(PORT, () => {
      console.log(`Server start on port ${PORT}`)
   })
}
