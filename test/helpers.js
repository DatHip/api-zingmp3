// Minimal Express req/res doubles — cachedFetch only touches setHeader/status/json.
function mockRes() {
   const res = { headers: {}, statusCode: 200, body: undefined }
   res.setHeader = (k, v) => {
      res.headers[k] = v
      return res
   }
   res.status = (c) => {
      res.statusCode = c
      return res
   }
   res.json = (b) => {
      res.body = b
      return res
   }
   return res
}

function mockReq(originalUrl, query = {}) {
   return { originalUrl, query }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

module.exports = { mockRes, mockReq, tick }
