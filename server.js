const express = require("express")
const ZingController = require("./controllers/ZingController")
const cors = require("cors")

const app = express()
const router = express.Router()

app.use(cors())

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

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }))

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
