// @ts-nocheck
/**
 * Dev server only. Forwards the card creator to the local imagine server.
 * Production builds do not include this file. Set REACT_APP_IMAGINE_URL for a phone build.
 */
const http = require('http')

const TARGET_PORT = Number(process.env.IMAGINE_PORT || 8787)

function setup(app) {
    app.use(function (req, res, next) {
        const pathOnly = String(req.originalUrl || req.url || '').split('?')[0]
        if (pathOnly !== '/api/imagine' && pathOnly !== '/api/imagine-world') {
            next()
            return
        }
        const headers = Object.assign({}, req.headers, { host: '127.0.0.1:' + TARGET_PORT })
        const proxyReq = http.request({
            hostname: '127.0.0.1',
            port: TARGET_PORT,
            path: pathOnly,
            method: req.method,
            headers: headers,
        }, function (proxyRes) {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
            proxyRes.pipe(res)
        })
        proxyReq.on('error', function () {
            if (res.headersSent) return
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({
                error: 'The card creator server is not running. In the backend folder, run: node imagine-server.js',
            }))
        })
        req.pipe(proxyReq)
    })
}

module.exports = setup
