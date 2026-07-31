const { zing } = require("../zingClient")

const wrap = (fn) => async (req, res, next) => {
   try {
      const data = await fn(req)
      res.json(data)
   } catch (err) {
      next(err)
   }
}

module.exports = {
   getHome: wrap(() => zing.getHome()),
   getPlayList: wrap((req) => zing.getPlaylist(req.params.id)),
   GetSuggestedPlaylists: wrap((req) => zing.getSuggestedPlaylists(req.params.id)),
   getSong: wrap((req) => zing.getSong(req.params.id)),
   getSongInfo: wrap((req) => zing.getSongInfo(req.params.id)),
   getSongLyrics: wrap((req) => zing.getSongLyric(req.params.id)),
   getHomeChart: wrap(() => zing.getHomeChart()),
   getNewReleaseChart: wrap(() => zing.getNewReleaseChart()),
   getWeekChart: wrap((req) =>
      zing.getWeekChart(req.params.id, Number(req.query.week) || 0, Number(req.query.year) || 0)
   ),
   getRadio: wrap(() => zing.getRadio()),
   getNewFeeds: wrap((req) => zing.getListByGenre(req.query.id, Number(req.query.page) || 1)),
   getArtist: wrap((req) => zing.getArtist(req.params.name)),
   getHub: wrap(() => zing.getHubHome()),
   getHubDetail: wrap((req) => zing.getHubDetail(req.params.id)),
   getTop100: wrap(() => zing.getTop100()),
   getListMv: wrap((req) =>
      zing.getListMv(
         req.query.id,
         Number(req.query.page) || 1,
         Number(req.query.count) || 15,
         req.query.sort || "listen"
      )
   ),
   getCategoryMv: wrap((req) => zing.getCategoryMv(req.params.id)),
   getMv: wrap((req) => zing.getMv(req.params.id)),
   getEvents: wrap(() => zing.getEvents()),
   getEventInfo: wrap((req) => zing.getEventInfo(req.params.id)),
   getSearchAll: wrap((req) => zing.searchAll(req.query.keyword)),
   getSearchbyType: wrap((req) =>
      zing.searchByType(req.query.keyword, req.query.type, Number(req.query.page) || 1, Number(req.query.count) || 18)
   ),
   getRecommendKeyword: wrap(() => zing.getRecommendKeyword()),
   getSuggestionKeyword: wrap((req) => zing.getSuggestionKeyword(req.query.keyword)),
}
