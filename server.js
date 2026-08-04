const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
// Увеличиваем лимит JSON для передачи аватарок, изображений и Lottie-статусов (Base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Email владельца системы, которому разрешено управлять DEV MODE
const OWNER_EMAIL = "egorapostol9@gmail.com";

// Временное хранилище кодов подтверждения (в оперативной памяти)
const verificationCodes = new Map();

// Путь к файлу базы данных пользователей
const USERS_FILE = path.join(__dirname, 'users.json');

// Ваша рабочая ссылка из Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyef-au6hEXD_axsB3JDtbx9ugmSdAATKjGb3LbXTaCWoesxfyTl2x9Sz_xS0AxsZ6c/exec";

// Ваш API-ключ AnyModel
const ANYMODEL_API_KEY = "sk-dc9d4b7df36ba555-0ftx1p-0544b8e2";

// Функция чтения пользователей из файла
function getUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
            return {};
        }
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Ошибка чтения users.json:', err);
        return {};
    }
}

// Функция сохранения пользователей в файл
function saveUsers(usersData) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 4), 'utf8');
    } catch (err) {
        console.error('Ошибка записи users.json:', err);
    }
}

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

// 3. Сохранение/Обновление профиля в файл (включая Lottie статус)
app.post('/api/save-profile', (req, res) => {
    const { email, nickname, avatar, statusEmoji } = req.body;
    if (!email || !nickname) return res.status(400).json({ error: 'Заполните никнейм' });

    const users = getUsers();
    
    // Если пользователь новый
    if (!users[email]) {
        users[email] = {
            email: email,
            nickname: nickname,
            avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${nickname}&backgroundColor=121212`,
            statusEmoji: statusEmoji || null,
            isUncensored: (email.toLowerCase() === OWNER_EMAIL.toLowerCase()),
            chats: [],
            registeredAt: new Date().toISOString()
        };
    } else {
        users[email].nickname = nickname;
        if (avatar) users[email].avatar = avatar;
        if (statusEmoji !== undefined) users[email].statusEmoji = statusEmoji;
        if (!users[email].chats) users[email].chats = [];
    }

    saveUsers(users);
    res.json({ success: true, profile: users[email] });
});

// 4. Получение профиля
app.post('/api/get-profile', (req, res) => {
    const { email } = req.body;
    const users = getUsers();
    
    if (users[email]) {
        res.json({ success: true, profile: users[email] });
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
    }
});

// 5. Сохранение истории чатов
app.post('/api/save-chats', (req, res) => {
    const { email, chats } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const users = getUsers();
    if (users[email]) {
        users[email].chats = chats || [];
        saveUsers(users);
        res.json({ success: true, message: 'История сохранена' });
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
    }
});

// 6. Получение истории чатов
app.post('/api/get-chats', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const users = getUsers();
    if (users[email]) {
        res.json({ success: true, chats: users[email].chats || [] });
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
    }
});

// 7. АДМИН-ПАНЕЛЬ: Получить всех пользователей (доступно только владельцу)
app.post('/api/admin/get-users', (req, res) => {
    const { adminEmail } = req.body;
    if (!adminEmail || adminEmail.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
        return res.status(403).json({ error: 'Доступ запрещен. Только для владельца.' });
    }

    const users = getUsers();
    const userList = Object.values(users).map(u => ({
        email: u.email,
        nickname: u.nickname,
        avatar: u.avatar,
        isUncensored: !!u.isUncensored,
        registeredAt: u.registeredAt
    }));

    res.json({ success: true, users: userList });
});

// 8. АДМИН-ПАНЕЛЬ: Изменить статус DEV MODE у пользователя
app.post('/api/admin/toggle-devmode', (req, res) => {
    const { adminEmail, targetEmail, isUncensored } = req.body;
    if (!adminEmail || adminEmail.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
        return res.status(403).json({ error: 'Доступ запрещен. Только для владельца.' });
    }

    const users = getUsers();
    if (users[targetEmail]) {
        users[targetEmail].isUncensored = !!isUncensored;
        saveUsers(users);
        res.json({ success: true, isUncensored: users[targetEmail].isUncensored });
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
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
