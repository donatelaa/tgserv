const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
    // Разрешаем любые входящие подключения без принудительного редиректа на HTTPS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Настройки для отправки в официальный Telegram
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: req.url,
        method: req.method,
        headers: { 
            ...req.headers, 
            host: 'api.telegram.org'
        }
    };

    const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    req.pipe(proxyReq);

    proxyReq.on('error', (err) => {
        console.error('Proxy Error:', err.message);
        res.writeHead(500);
        res.end('Proxy Error: ' + err.message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});
