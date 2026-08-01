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

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
   .split(",")
   .map((s) => s.trim())
   .filter(Boolean)

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

app.use(
   cors({
      origin: (origin, cb) => {
         if (!origin) return cb(null, true)
         if (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
         if (LOCALHOST_RE.test(origin)) return cb(null, true)
         return cb(new Error("CORS: origin not allowed"))
      },
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

app.use("/", (req, res) => res.json({ name: "zingmp3-api", ok: true }))

app.use((err, req, res, next) => {
   console.error("[error]", req.method, req.originalUrl, err?.message || err)
   res.status(err?.status || 500).json({ err: 1, msg: err?.message || "Internal Server Error" })
})

// @vercel/node invokes the exported handler; it never calls listen().
module.exports = app

if (!process.env.VERCEL) {
   const PORT = process.env.PORT || 5000
   app.listen(PORT, () => {
      console.log(`Server start on port ${PORT}`)
   })
}
