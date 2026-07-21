const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api/anthropic',
    createProxyMiddleware({
      target: 'https://api.anthropic.com',
      changeOrigin: true,
      pathRewrite: { '^/api/anthropic': '' },
      on: {
        proxyReq: (proxyReq, req) => {
          // Forward the API key and version headers from the client
          if (req.headers['x-api-key']) {
            proxyReq.setHeader('x-api-key', req.headers['x-api-key']);
          }
          if (req.headers['anthropic-version']) {
            proxyReq.setHeader('anthropic-version', req.headers['anthropic-version']);
          }
        },
      },
    })
  );
};