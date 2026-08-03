const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Временное хранилище кодов и профилей в памяти
const verificationCodes = new Map();
const usersProfiles = new Map();

// --- НАСТРОЙКА ПОЧТЫ GMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: 'Egorapostol9@gmail.com', 
        pass: 'pofskegtstijcppw'        
    }
});

// 1. Отправка кода
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    verificationCodes.set(email, code);
    setTimeout(() => verificationCodes.delete(email), 5 * 60 * 1000);

    try {
        await transporter.sendMail({
            from: '"Altron AI" <Egorapostol9@gmail.com>',
            to: email,
            subject: 'Код подтверждения | Altron AI SUPER 1.5',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #171717; color: white; padding: 30px; border-radius: 15px;">
                    <h2 style="text-align: center; color: #fff;">Altron AI SUPER 1.5</h2>
                    <p style="text-align: center; color: #a3a3a3;">Ваш код подтверждения:</p>
                    <div style="background: #262626; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4F46E5;">${code}</span>
                    </div>
                    <p style="text-align: center; color: #737373; font-size: 12px;">Код действителен 5 минут.</p>
                </div>
            `
        });
        console.log(`Код ${code} отправлен на ${email}`);
        res.json({ success: true, message: 'Код отправлен' });
    } catch (error) {
        console.error('Ошибка отправки почты:', error);
        res.status(500).json({ error: 'Не удалось отправить письмо через Gmail.' });
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
    if (!email || !nickname) {
        return res.status(400).json({ error: 'Заполните никнейм' });
    }

    const userAvatar = avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${nickname}`;
    usersProfiles.set(email, { nickname, avatar: userAvatar });
    
    console.log(`Профиль сохранен: ${nickname} (${email})`);
    res.json({ success: true, profile: usersProfiles.get(email) });
});

// Порт для Render.com
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
