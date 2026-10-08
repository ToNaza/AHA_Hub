const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_SECRET = process.env.SESSION_SECRET;

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

  try {
    // Права проверяются ЗДЕСЬ, на сервере, по базе — а не по тому,
    // что прислал браузер
    const { data: me, error: meError } = await supabase
      .from('users')
      .select('is_admin, blocked')
      .eq('id', uid)
      .maybeSingle();

    if (meError || !me || !me.is_admin || me.blocked) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('id, blocked, is_admin')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    res.status(200).json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};