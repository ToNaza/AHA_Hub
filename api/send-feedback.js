    const jwt = require('jsonwebtoken');
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const SESSION_SECRET = process.env.SESSION_SECRET;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_MODERATION_CHAT_ID;

    const MAX_HEADING = 50;
    const MAX_DESCRIPTION = 300;

    function parseCookies(req) {
    const header = req.headers.cookie || '';
    return Object.fromEntries(
        header
        .split(';')
        .filter(Boolean)
        .map((part) => {
            const [key, ...rest] = part.trim().split('=');
            return [key, decodeURIComponent(rest.join('='))];
        })
    );
    }

    module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const token = parseCookies(req).session;
    if (!token) {
        res.status(401).json({ error: 'Не авторизован' });
        return;
    }

    let uid;
    try {
        uid = jwt.verify(token, SESSION_SECRET).uid;
    } catch (err) {
        res.status(401).json({ error: 'Недействительная сессия' });
        return;
    }

    const body = req.body || {};
    const heading = String(body.heading || '').trim();
    const description = String(body.description || '').trim();

    if (!heading || !description) {
        res.status(400).json({ error: 'Заполните тему и описание' });
        return;
    }
    if (heading.length > MAX_HEADING || description.length > MAX_DESCRIPTION) {
        res.status(400).json({ error: 'Слишком длинный текст' });
        return;
    }

    try {
        const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, username, blocked')
        .eq('id', uid)
        .maybeSingle();

        if (userError || !user) {
        res.status(404).json({ error: 'Пользователь не найден' });
        return;
        }
        if (user.blocked) {
        res.status(403).json({ error: 'USER_BLOCKED' });
        return;
        }

        // Юзернейм и ID берём только из базы — подделать их с клиента нельзя
        const usernameText = user.username ? '@' + user.username : 'нет username';
        const text =
        `Username - ${usernameText} | ID - ${user.id}\n` +
        `Heading - ${heading}\n` +
        `Description - ${description}`;

        // Без parse_mode: пользовательский текст уходит как обычный текст
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text }),
        });

        if (!tgRes.ok) {
        console.error('Telegram sendMessage failed', tgRes.status, await tgRes.text());
        res.status(502).json({ error: 'Не удалось отправить. Попробуйте позже' });
        return;
        }

        res.status(200).json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
    };