const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Временное хранилище кодов подтверждения (в оперативной памяти)
const verificationCodes = new Map();

// Путь к файлу базы данных пользователей
const USERS_FILE = path.join(__dirname, 'users.json');

// Ваша новая ссылка из Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyef-au6hEXD_axsB3JDtbx9ugmSdAATKjGb3LbXTaCWoesxfyTl2x9Sz_xS0AxsZ6c/exec";



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
        
        console.log(`Код ${code} отправлен на ${email}`);
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

// 3. Сохранение/Обновление профиля в файл (JSON База Данных)
app.post('/api/save-profile', (req, res) => {
    const { email, nickname, avatar } = req.body;
    if (!email || !nickname) return res.status(400).json({ error: 'Заполните никнейм' });

    const users = getUsers();
    
    // Если пользователь новый
    if (!users[email]) {
        users[email] = {
            email: email,
            nickname: nickname,
            avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${nickname}&backgroundColor=121212`,
            isUncensored: false, // По умолчанию цензура включена
            chats: [], // История диалогов
            registeredAt: new Date().toISOString()
        };
    } else {
        // Если уже существует, обновляем ник и аватарку
        users[email].nickname = nickname;
        if (avatar) users[email].avatar = avatar;
        if (!users[email].chats) users[email].chats = [];
    }

    saveUsers(users); // Перезаписываем файл
    
    res.json({ success: true, profile: users[email] });
});

// 4. Получение профиля (проверка прав при загрузке страницы)
app.post('/api/get-profile', (req, res) => {
    const { email } = req.body;
    const users = getUsers();
    
    if (users[email]) {
        res.json({ success: true, profile: users[email] });
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
    }
});

// 5. Сохранение истории чатов конкретного пользователя
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

// 6. Получение истории чатов конкретного пользователя
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT} (База данных users.json подключена)`);
});
