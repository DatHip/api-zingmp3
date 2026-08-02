const axios = require("axios")
const crypto = require("crypto")

const BASE = process.env.ZING_BASE || "https://zingmp3.vn"
const SUGGEST_BASE = process.env.ZING_SUGGEST_BASE || "https://ac.zingmp3.vn"
const API_KEY = process.env.ZING_API_KEY || "88265e23d4284f25963e6eedac8fbfa3"
const SECRET_KEY = process.env.ZING_SECRET_KEY || "2aa2d1c561e809b267f3638c4a307aab"
const VERSION = process.env.ZING_VERSION || "1.9.20"
const UA =
   process.env.ZING_UA ||
   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
const TIMEOUT_MS = Number(process.env.ZING_TIMEOUT_MS || 8000)
const COOKIE_TTL_MS = Number(process.env.ZING_COOKIE_TTL_MS || 10 * 60 * 1000)

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex")
const hmac512 = (s) => crypto.createHmac("sha512", SECRET_KEY).update(s).digest("hex")
const ctime = () => String(Math.floor(Date.now() / 1000))

function sigNoId(path, ct) {
   return hmac512(path + sha256(`ctime=${ct}version=${VERSION}`))
}
function sigId(path, id, ct) {
   return hmac512(path + sha256(`ctime=${ct}id=${id}version=${VERSION}`))
}
function sigHomeRadio(path, count, ct) {
   return hmac512(path + sha256(`count=${count}ctime=${ct}page=1version=${VERSION}`))
}
function sigListGenre(path, id, page, ct) {
   return hmac512(path + sha256(`count=10ctime=${ct}id=${id}page=${page}version=${VERSION}`))
}
function sigListMv(path, count, id, type, page, ct) {
   return hmac512(path + sha256(`count=${count}ctime=${ct}id=${id}page=${page}type=${type}version=${VERSION}`))
}
function sigCategoryMv(path, id, type, ct) {
   return hmac512(path + sha256(`ctime=${ct}id=${id}type=${type}version=${VERSION}`))
}
function sigSearch(path, count, page, type, ct) {
   return hmac512(path + sha256(`count=${count}ctime=${ct}page=${page}type=${type}version=${VERSION}`))
}

let cookieCache = { value: null, expiresAt: 0 }

async function getCookie() {
   const now = Date.now()
   if (cookieCache.value && cookieCache.expiresAt > now) return cookieCache.value
   const res = await axios.get(BASE, {
      headers: { "User-Agent": UA },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
   })
   const jar = res.headers["set-cookie"] || []
   const cookie = jar
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ")
   if (!cookie) throw new Error("Zing cookie handshake failed")
   cookieCache = { value: cookie, expiresAt: now + COOKIE_TTL_MS }
   return cookie
}

async function request(path, params, { suggest = false } = {}) {
   const baseURL = suggest ? SUGGEST_BASE : BASE
   const cookie = await getCookie()
   const res = await axios.get(baseURL + path, {
      params: { ...params, ctime: params.ctime || ctime(), version: VERSION, apiKey: API_KEY },
      headers: { Cookie: cookie, "User-Agent": UA },
      timeout: TIMEOUT_MS,
   })
   if (res.data && typeof res.data === "object" && res.data.err && res.data.err !== 0) {
      const err = new Error(res.data.msg || `Zing upstream err=${res.data.err}`)
      err.status = 502
      err.upstream = res.data
      throw err
   }
   return res.data
}

const zing = {
   async getHome() {
      const path = "/api/v2/page/get/home"
      const ct = ctime()
      const count = 30
      return request(path, { page: 1, count, segmentId: "-1", ctime: ct, sig: sigHomeRadio(path, count, ct) })
   },
   async getSong(id) {
      const path = "/api/v2/song/get/streaming"
      const ct = ctime()
      return request(path, { id, ctime: ct, sig: sigId(path, id, ct) })
   },
   async getSongInfo(id) {
      const path = "/api/v2/song/get/info"
      const ct = ctime()
      return request(path, { id, ctime: ct, sig: sigId(path, id, ct) })
   },
   async getSongLyric(id) {
      const path = "/api/v2/lyric/get/lyric"
      const ct = ctime()
      return request(path, { id, ctime: ct, sig: sigId(path, id, ct) })
   },
   async getHomeChart() {
      const path = "/api/v2/page/get/chart-home"
      const ct = ctime()
      return request(path, { ctime: ct, sig: sigNoId(path, ct) })
   },
   async getNewReleaseChart() {
      const path = "/api/v2/page/get/newrelease-chart"
      const ct = ctime()
      return request(path, { ctime: ct, sig: sigNoId(path, ct) })
   },
   async getWeekChart(id, week = 0, year = 0) {
      const path = "/api/v2/page/get/week-chart"
      const ct = ctime()
      return request(path, { id, week, year, ctime: ct, sig: sigId(path, id, ct) })
   },
   async getRadio() {
      const path = "/api/v2/page/get/radio"
      const ct = ctime()
      const count = 10
      return request(path, { page: 1, count, ctime: ct, sig: sigHomeRadio(path, count, ct) })
   },
   async getListByGenre(id, page = 1) {
      const path = "/api/v2/feed/get/list-by-genre"
      const ct = ctime()
      return request(path, { id, page, count: 10, ctime: ct, sig: sigListGenre(path, id, page, ct) })
   },
   async getArtist(alias) {
      const path = "/api/v2/page/get/artist"
      const ct = ctime()
      return request(path, { alias, ctime: ct, sig: sigNoId(path, ct) })
   },
   async getHubHome() {
      const path = "/api/v2/page/get/hub-home"
      const ct = ctime()
      return request(path, { ctime: ct, sig: sigNoId(path, ct) })
   },
   async getHubDetail(id) {
      const path = "/api/v2/page/get/hub-detail"
      const ct = ctime()
      return request(path, { id, ctime: ct, sig: sigId(path, id, ct) })
   },
   async getTop100() {
      const path = "/api/v2/page/get/top-100"
      const ct = ctime()
      return request(path, { ctime: ct, sig: sigNoId(path, ct) })
   },
   async getListMv(id, page = 1, count = 15, sort = "listen") {
      const path = "/api/v2/video/get/list"
      const type = "genre"
      const validSorts = ["listen", "hot", "new"]
      if (!validSorts.includes(sort)) throw new Error("sort must be listen|hot|new")
      const ct = ctime()
      return request(path, { id, type, page, count, sort, ctime: ct, sig: sigListMv(path, count, id, type, page, ct) })
   },
   async getCategoryMv(id) {
      const path = "/api/v2/genre/get/info"
      const type = "video"
      const ct = ctime()
      return request(path, { id, type, ctime: ct, sig: sigCategoryMv(path, id, type, ct) })
   },
   async getMv(id) {
      const path = "/api/v2/page/get/video"
      const ct = ctime()
      return request(path, { id, ctime: ct, sig: sigId(path, id, ct) })
   },
   async getPlaylist(id) {
      const path = "/api/v2/page/get/playlist"
      const ct = ctime()
      return request(path, { id, ctime: ct, sig: sigId(path, id, ct) })
   },
   async getSuggestedPlaylists(id) {
      const path = "/api/v2/playlist/get/section-bottom"
      const ct = ctime()
      return request(path, { id, ctime: ct, sig: sigId(path, id, ct) })
   },
   async getEvents() {
      const path = "/api/v2/event/get/list-incoming"
      const ct = ctime()
      return request(path, { ctime: ct, sig: sigNoId(path, ct) })
   },
   async getEventInfo(id) {
      const path = "/api/v2/event/get/info"
      const ct = ctime()
      return request(path, { id, ctime: ct, sig: sigId(path, id, ct) })
   },
   async searchAll(keyword) {
      const path = "/api/v2/search/multi"
      const ct = ctime()
      return request(path, { q: keyword, ctime: ct, sig: sigNoId(path, ct) })
   },
   async searchByType(keyword, type, page = 1, count = 18) {
      const path = "/api/v2/search"
      const validTypes = ["song", "playlist", "artist", "video"]
      if (!validTypes.includes(type)) throw new Error("type must be song|playlist|artist|video")
      const ct = ctime()
      return request(path, {
         q: keyword,
         type,
         page,
         count,
         ctime: ct,
         sig: sigSearch(path, count, page, type, ct),
      })
   },
   async getRecommendKeyword() {
      const path = "/api/v2/app/get/recommend-keyword"
      const ct = ctime()
      return request(path, { ctime: ct, sig: sigNoId(path, ct) })
   },
   async getSuggestionKeyword(keyword) {
      const path = "/v1/web/suggestion-keywords"
      const ct = ctime()
      return request(
         path,
         { num: 10, query: keyword, language: "vi", ctime: ct, sig: sigNoId(path, ct) },
         { suggest: true }
      )
   },
}

module.exports = { zing }
