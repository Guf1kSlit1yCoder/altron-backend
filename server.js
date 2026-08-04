const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
// Увеличиваем лимит JSON для передачи аватарок (Base64) и фонов
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Email владельца системы
const OWNER_EMAIL = "egorapostol9@gmail.com";

// Временное хранилище кодов подтверждения
const verificationCodes = new Map();

// Ссылка из Google Apps Script для отправки почты
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyef-au6hEXD_axsB3JDtbx9ugmSdAATKjGb3LbXTaCWoesxfyTl2x9Sz_xS0AxsZ6c/exec";

// API-ключ AnyModel
const ANYMODEL_API_KEY = "sk-dc9d4b7df36ba555-0ftx1p-0544b8e2";

// Подключение к MongoDB
// Если на Render не прописан MONGO_URI, будет использоваться ваша резервная ссылка
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://egorapostol9_db_user:Gs9pGJRCnOLa9cGQ@cluster0.bocpzhw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('🟢 Успешно подключено к MongoDB Atlas'))
    .catch(err => console.error('🔴 Ошибка подключения к MongoDB:', err));

// Схема пользователя в стиле Telegram
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    nickname: { type: String, required: true },
    username: { type: String, sparse: true, lowercase: true, trim: true }, // @username (без @)
    bio: { type: String, default: '' }, // О себе
    avatar: { type: String }, // Base64 картинки
    profileBackground: { type: String, default: null }, // Фон
    statusEmoji: { type: String, default: null }, // Lottie или эмодзи
    isUncensored: { type: Boolean, default: false },
    chats: { type: Array, default: [] },
    registeredAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Схема для Lottie-анимаций (для статусов)
const lottieSchema = new mongoose.Schema({
    name: { type: String, required: true },
    animationData: { type: String, required: true }, // JSON-код Lottie
    uploadedAt: { type: Date, default: Date.now }
});

const LottieEmoji = mongoose.model('LottieEmoji', lottieSchema);

// 1. Отправка кода на почту
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, code);
    setTimeout(() => verificationCodes.delete(email), 5 * 60 * 1000);

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ email: email, code: code }),
            redirect: 'follow'
        });
        
        if (!response.ok) throw new Error('Google вернул ошибку');
        res.json({ success: true, message: 'Код отправлен' });
    } catch (error) {
        res.status(500).json({ error: 'Не удалось отправить код' });
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

// 3. Сохранение и редактирование профиля
app.post('/api/save-profile', async (req, res) => {
    try {
        const { email, nickname, username, avatar, profileBackground, bio, statusEmoji } = req.body;
        if (!email) return res.status(400).json({ error: 'Email обязателен' });

        const cleanEmail = email.toLowerCase().trim();
        let user = await User.findOne({ email: cleanEmail });
        
        // Очищаем юзернейм от символа @ и пробелов
        let cleanUsername = username ? username.replace('@', '').toLowerCase().trim() : null;

        if (!user) {
            user = new User({
                email: cleanEmail,
                nickname: nickname || 'Пользователь',
                username: cleanUsername,
                avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanEmail}&backgroundColor=121212`,
                profileBackground: profileBackground || null,
                bio: bio || '',
                statusEmoji: statusEmoji || null,
                isUncensored: (cleanEmail === OWNER_EMAIL.toLowerCase())
            });
        } else {
            if (nickname !== undefined) user.nickname = nickname;
            if (cleanUsername !== undefined) user.username = cleanUsername;
            if (avatar !== undefined) user.avatar = avatar;
            if (profileBackground !== undefined) user.profileBackground = profileBackground;
            if (bio !== undefined) user.bio = bio;
            if (statusEmoji !== undefined) user.statusEmoji = statusEmoji;
        }

        await user.save();
        res.json({ success: true, profile: user });
    } catch (err) {
        console.error('Ошибка сохранения профиля:', err);
        // Проверка на уникальность username
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Этот юзернейм (@username) уже занят' });
        }
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 4. Получение профиля при загрузке страницы
app.post('/api/get-profile', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email обязателен' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (user) {
            res.json({ success: true, profile: user });
        } else {
            res.status(404).json({ error: 'Пользователь не найден' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 5. ЧАТ С ИИ (AnyModel)
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, message, model } = req.body;
        let chatMessages = [];
        
        if (Array.isArray(messages) && messages.length > 0) {
            chatMessages = messages;
        } else if (message) {
            chatMessages = [{ role: 'user', content: message }];
        } else {
            return res.status(400).json({ error: 'Пустое сообщение' });
        }

        const response = await fetch('https://anymodel.org/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ANYMODEL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || "am/gpt-5.6-terra",
                messages: chatMessages,
                temperature: 0.7
            })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'Ошибка AnyModel' });
        }

        res.json({ success: true, reply: data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: 'Внутренняя ошибка сервера чата' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
