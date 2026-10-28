const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_SECRET = process.env.SESSION_SECRET;

// Фиксированная награда — задаётся ТОЛЬКО тут, на сервере.
// Клиент не может передать своё значение и накрутить себе баланс.
const EASTER_EGG_COIN_REWARD = 100;

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

  const cookies = parseCookies(req);
  const token = cookies.session;

  if (!token) {
    res.status(401).json({ error: 'Не авторизован' });
    return;
  }

  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    const uid = payload.uid;

    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('balance, blocked')
      .eq('id', uid)
      .maybeSingle();

    if (fetchError || !user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    if (user.blocked) {
      res.status(403).json({ error: 'USER_BLOCKED' });
      return;
    }

    const newBalance = (user.balance || 0) + EASTER_EGG_COIN_REWARD;

    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', uid);

    if (updateError) throw updateError;

    res.status(200).json({ balance: newBalance });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Недействительная сессия' });
  }
};