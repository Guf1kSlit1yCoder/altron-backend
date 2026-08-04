const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
// Увеличиваем лимит JSON для передачи аватарок, изображений и Lottie-статусов (Base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Email владельца системы, которому разрешено управлять DEV MODE
const OWNER_EMAIL = "egorapostol9@gmail.com";

// Временное хранилище кодов подтверждения (в оперативной памяти)
const verificationCodes = new Map();

// Ваша рабочая ссылка из Google Apps Script для отправки почты
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyef-au6hEXD_axsB3JDtbx9ugmSdAATKjGb3LbXTaCWoesxfyTl2x9Sz_xS0AxsZ6c/exec";

// Ваш API-ключ AnyModel
const ANYMODEL_API_KEY = "sk-dc9d4b7df36ba555-0ftx1p-0544b8e2";

// Подключение к MongoDB (берем из переменных окружения Render или используем вашу ссылку)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://egorapostol9_db_user:Gs9pGJRCnOLa9cGQ@cluster0.bocpzhw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('🟢 Успешно подключено к MongoDB Atlas'))
    .catch(err => console.error('🔴 Ошибка подключения к MongoDB:', err));

// Схема пользователя в базе данных
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    nickname: { type: String, required: true },
    avatar: { type: String },
    statusEmoji: { type: String, default: null },
    isUncensored: { type: Boolean, default: false },
    chats: { type: Array, default: [] },
    registeredAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// 1. Отправка реального кода через Google API
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, code);
    
    // Код живет 5 минут
    setTimeout(() => verificationCodes.delete(email), 5 * 60 * 1000);

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ email: email, code: code }),
            redirect: 'follow'
        });
        
        if (!response.ok) throw new Error('Google вернул ошибку при отправке');
        
        res.json({ success: true, message: 'Код отправлен' });
    } catch (error) {
        console.error('Ошибка отправки кода:', error);
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

// 3. Сохранение/Обновление профиля в MongoDB
app.post('/api/save-profile', async (req, res) => {
    try {
        const { email, nickname, avatar, statusEmoji } = req.body;
        if (!email || !nickname) return res.status(400).json({ error: 'Заполните никнейм' });

        const cleanEmail = email.toLowerCase().trim();
        let user = await User.findOne({ email: cleanEmail });
        
        if (!user) {
            user = new User({
                email: cleanEmail,
                nickname: nickname,
                avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${nickname}&backgroundColor=121212`,
                statusEmoji: statusEmoji || null,
                isUncensored: (cleanEmail === OWNER_EMAIL.toLowerCase()),
                chats: []
            });
        } else {
            user.nickname = nickname;
            if (avatar) user.avatar = avatar;
            if (statusEmoji !== undefined) user.statusEmoji = statusEmoji;
        }

        await user.save();
        res.json({ success: true, profile: user });
    } catch (err) {
        console.error('Ошибка сохранения профиля:', err);
        res.status(500).json({ error: 'Ошибка сервера при сохранении профиля' });
    }
});

// 4. Получение профиля
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
        console.error('Ошибка получения профиля:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 5. Сохранение истории чатов
app.post('/api/save-chats', async (req, res) => {
    try {
        const { email, chats } = req.body;
        if (!email) return res.status(400).json({ error: 'Email обязателен' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (user) {
            user.chats = chats || [];
            await user.save();
            res.json({ success: true, message: 'История сохранена' });
        } else {
            res.status(404).json({ error: 'Пользователь не найден' });
        }
    } catch (err) {
        console.error('Ошибка сохранения чатов:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 6. Получение истории чатов
app.post('/api/get-chats', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email обязателен' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (user) {
            res.json({ success: true, chats: user.chats || [] });
        } else {
            res.status(404).json({ error: 'Пользователь не найден' });
        }
    } catch (err) {
        console.error('Ошибка получения чатов:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 7. АДМИН-ПАНЕЛЬ: Получить всех пользователей (доступно только владельцу)
app.post('/api/admin/get-users', async (req, res) => {
    try {
        const { adminEmail } = req.body;
        if (!adminEmail || adminEmail.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
            return res.status(403).json({ error: 'Доступ запрещен. Только для владельца.' });
        }

        const users = await User.find({});
        const userList = users.map(u => ({
            email: u.email,
            nickname: u.nickname,
            avatar: u.avatar,
            isUncensored: !!u.isUncensored,
            registeredAt: u.registeredAt
        }));

        res.json({ success: true, users: userList });
    } catch (err) {
        console.error('Ошибка админ-панели (get-users):', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 8. АДМИН-ПАНЕЛЬ: Изменить статус DEV MODE у пользователя
app.post('/api/admin/toggle-devmode', async (req, res) => {
    try {
        const { adminEmail, targetEmail, isUncensored } = req.body;
        if (!adminEmail || adminEmail.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
            return res.status(403).json({ error: 'Доступ запрещен. Только для владельца.' });
        }

        const user = await User.findOne({ email: targetEmail.toLowerCase().trim() });
        if (user) {
            user.isUncensored = !!isUncensored;
            await user.save();
            res.json({ success: true, isUncensored: user.isUncensored });
        } else {
            res.status(404).json({ error: 'Пользователь не найден' });
        }
    } catch (err) {
        console.error('Ошибка админ-панели (toggle-devmode):', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 9. ЧАТ С ИИ (Интеграция с AnyModel шлюзом)
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, message, model } = req.body;

        let chatMessages = [];
        if (Array.isArray(messages) && messages.length > 0) {
            chatMessages = messages;
        } else if (message) {
            chatMessages = [{ role: 'user', content: message }];
        } else {
            return res.status(400).json({ error: 'Не передано сообщение или история чата' });
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
            console.error('Ошибка от AnyModel:', data);
            return res.status(response.status).json({ 
                error: data.error?.message || 'Ошибка со стороны AnyModel API' 
            });
        }

        const aiReply = data.choices[0].message.content;
        res.json({ success: true, reply: aiReply, usage: data.usage || null });

    } catch (error) {
        console.error('Ошибка бэкенд-сервера чата:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при обращении к AnyModel' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT} (Владелец: ${OWNER_EMAIL})`);
});
