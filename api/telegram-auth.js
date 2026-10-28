const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// service role key даёт полный доступ к базе — используется ТОЛЬКО тут,
// на сервере, никогда не попадает в браузер
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SESSION_SECRET = process.env.SESSION_SECRET;

// Проверка подписи по алгоритму из документации Telegram:
// https://core.telegram.org/widgets/login#checking-authorization
function checkTelegramAuth(data) {
  const { hash, ...fields } = data;

  const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();

  const checkString = Object.keys(fields)
    .filter((key) => fields[key] !== undefined && fields[key] !== null)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');

  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  return hmac === hash;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const data = req.body;

  if (!data || !data.hash || !data.id) {
    res.status(400).json({ error: 'Отсутствуют данные авторизации Telegram' });
    return;
  }

  // Данные от Telegram считаются валидными не дольше 24 часов
  const authDate = parseInt(data.auth_date, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 86400) {
    res.status(400).json({ error: 'Данные авторизации устарели' });
    return;
  }

  if (!checkTelegramAuth(data)) {
    res.status(403).json({ error: 'Неверная подпись Telegram' });
    return;
  }

  const uid = String(data.id);

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!existing) {
      // Первый вход — создаём запись. Храним ТОЛЬКО id/баланс/бан,
      // как и договаривались — всё остальное живёт в localStorage клиента.
      const { error: insertError } = await supabase
        .from('users')
        .insert({ id: uid, balance: 0, blocked: false });
      if (insertError) throw insertError;
    } else if (existing.blocked) {
      res.status(403).json({ error: 'USER_BLOCKED' });
      return;
    }

    // Выдаём собственную сессию (JWT в httpOnly cookie) — это заменяет
    // Firebase Auth, без него всё проще
    const token = jwt.sign({ uid }, SESSION_SECRET, { expiresIn: '30d' });

    res.setHeader(
      'Set-Cookie',
      `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
        30 * 24 * 60 * 60
      }`
    );
    res.status(200).json({ ok: true, uid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};