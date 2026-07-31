const express = require("express")
const cors = require("cors")
const compression = require("compression")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const NodeCache = require("node-cache")
const ZingController = require("./controllers/ZingController")

const app = express()
const router = express.Router()

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
app.use(compression())

app.use(
   "/api/",
   rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
   })
)

const cache = new NodeCache({ stdTTL: 300, checkperiod: 120, useClones: false })
const TTL = {
   "/api/home": 300,
   "/api/homechart": 600,
   "/api/newreleasechart": 600,
   "/api/top100": 900,
   "/api/hubhome": 1800,
   "/api/radio": 900,
   "/api/recommendkeyword": 3600,
   "/api/songlyrics": 3600,
   "/api/artist": 1800,
   "/api/playlist": 900,
   "/api/hubdetails": 1800,
   "/api/categorymv": 1800,
   "/api/mv": 1800,
   "/api/weekchart": 900,
   "/api/suggestedplaylists": 900,
}

function ttlFor(url) {
   const path = url.split("?")[0]
   for (const key of Object.keys(TTL)) {
      if (path === key || path.startsWith(key + "/")) return TTL[key]
   }
   return 0
}

function cacheMiddleware(req, res, next) {
   if (req.method !== "GET") return next()
   const ttl = ttlFor(req.originalUrl)
   if (!ttl) return next()

   const key = req.originalUrl
   const hit = cache.get(key)
   if (hit) {
      res.setHeader("X-Cache", "HIT")
      return res.json(hit)
   }

   const originalJson = res.json.bind(res)
   res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && body && body.err === 0) {
         cache.set(key, body, ttl)
      }
      res.setHeader("X-Cache", "MISS")
      return originalJson(body)
   }
   next()
}

app.use("/api/", cacheMiddleware)

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

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime(), cacheKeys: cache.keys().length }))

app.use("/api/", router)

app.use("/", (req, res) => res.json({ name: "zingmp3-api", ok: true }))

app.use((err, req, res, next) => {
   console.error("[error]", req.method, req.originalUrl, err?.message || err)
   res.status(err?.status || 500).json({ err: 1, msg: err?.message || "Internal Server Error" })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
   console.log(`Server start on port ${PORT}`)
})
