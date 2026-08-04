const { zing, SORTS, SEARCH_TYPES } = require("../zingClient")
const { cachedFetch } = require("../cache")
const v = require("../validators")

// `build` validates the request and returns the thunk that talks to Zing.
// Validation deliberately runs before cachedFetch so a malformed request is
// rejected without allocating a cache key or touching the upstream.
const wrap = (build) => async (req, res, next) => {
   try {
      const fetcher = build(req)
      await cachedFetch(req, res, fetcher)
   } catch (err) {
      next(err)
   }
}

const page = (req) => v.int(req.query.page, { min: 1, max: 100, fallback: 1, field: "page" })

module.exports = {
   getHome: wrap(() => () => zing.getHome()),

   getPlayList: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getPlaylist(id)
   }),

   GetSuggestedPlaylists: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getSuggestedPlaylists(id)
   }),

   getSong: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getSong(id)
   }),

   getSongInfo: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getSongInfo(id)
   }),

   getSongLyrics: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getSongLyric(id)
   }),

   getHomeChart: wrap(() => () => zing.getHomeChart()),

   getNewReleaseChart: wrap(() => () => zing.getNewReleaseChart()),

   getWeekChart: wrap((req) => {
      const id = v.id(req.params.id)
      const week = v.int(req.query.week, { min: 0, max: 53, fallback: 0, field: "week" })
      const year = v.int(req.query.year, { min: 0, max: 2999, fallback: 0, field: "year" })
      return () => zing.getWeekChart(id, week, year)
   }),

   getRadio: wrap(() => () => zing.getRadio()),

   getNewFeeds: wrap((req) => {
      const id = v.id(req.query.id)
      const p = page(req)
      return () => zing.getListByGenre(id, p)
   }),

   getArtist: wrap((req) => {
      const name = v.alias(req.params.name)
      return () => zing.getArtist(name)
   }),

   getHub: wrap(() => () => zing.getHubHome()),

   getHubDetail: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getHubDetail(id)
   }),

   getTop100: wrap(() => () => zing.getTop100()),

   getListMv: wrap((req) => {
      const id = v.id(req.query.id)
      const p = page(req)
      const count = v.int(req.query.count, { min: 1, max: 50, fallback: 15, field: "count" })
      const sort = v.oneOf(req.query.sort, SORTS, { fallback: "listen", field: "sort" })
      return () => zing.getListMv(id, p, count, sort)
   }),

   getCategoryMv: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getCategoryMv(id)
   }),

   getMv: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getMv(id)
   }),

   getEvents: wrap(() => () => zing.getEvents()),

   getEventInfo: wrap((req) => {
      const id = v.id(req.params.id)
      return () => zing.getEventInfo(id)
   }),

   getSearchAll: wrap((req) => {
      const keyword = v.keyword(req.query.keyword)
      return () => zing.searchAll(keyword)
   }),

   getSearchbyType: wrap((req) => {
      const keyword = v.keyword(req.query.keyword)
      const type = v.oneOf(req.query.type, SEARCH_TYPES, { fallback: undefined, field: "type" })
      if (!type) throw new v.BadRequest(`type must be one of ${SEARCH_TYPES.join("|")}`)
      const p = page(req)
      const count = v.int(req.query.count, { min: 1, max: 50, fallback: 18, field: "count" })
      return () => zing.searchByType(keyword, type, p, count)
   }),

   getRecommendKeyword: wrap(() => () => zing.getRecommendKeyword()),

   getSuggestionKeyword: wrap((req) => {
      const keyword = v.keyword(req.query.keyword)
      return () => zing.getSuggestionKeyword(keyword)
   }),
}
