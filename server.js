const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
    // Перенаправляем все запросы на официальный сервер Telegram Bot API
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: 'api.telegram.org' }
    };

    const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    req.pipe(proxyReq);

    proxyReq.on('error', (err) => {
        res.writeHead(500);
        res.end('Proxy Error: ' + err.message);
    });
});

// Слушаем порт, который выдаст Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});
