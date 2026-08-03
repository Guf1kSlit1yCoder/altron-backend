const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const verificationCodes = new Map();
const usersProfiles = new Map();

// Ваша рабочая ссылка из Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwTes2CLj0IbbIuMvIx_sJjiMRd6RlpEwDPnSj3B2dcguy3h9JH9kV1Y6g8JZtHzT17jA/exec";

// 1. Отправка реального кода через Google API
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    verificationCodes.set(email, code);
    setTimeout(() => verificationCodes.delete(email), 5 * 60 * 1000);

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ email: email, code: code })
        });
        
        console.log(`Реальный код ${code} успешно отправлен на ${email}`);
        res.json({ success: true, message: 'Код отправлен' });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: 'Не удалось связаться с сервером отправки' });
    }
});

// 2. Проверка кода
app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;
    const savedCode = verificationCodes.get(email);

    if (!savedCode || savedCode !== code) {
        return res.status(400).json({ error: 'Неверный или просроченный код' });
    }

    verificationCodes.delete(email);
    res.json({ success: true, message: 'Код подтвержден' });
});

// 3. Сохранение профиля
app.post('/api/save-profile', (req, res) => {
    const { email, nickname, avatar } = req.body;
    if (!email || !nickname) return res.status(400).json({ error: 'Заполните никнейм' });

    const userAvatar = avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${nickname}`;
    usersProfiles.set(email, { nickname, avatar: userAvatar });
    
    res.json({ success: true, profile: usersProfiles.get(email) });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT} (Интеграция с Google Script активна)`);
});
