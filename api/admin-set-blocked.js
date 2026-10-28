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

  const { userId, blocked } = req.body || {};

  if (!userId || typeof blocked !== 'boolean') {
    res.status(400).json({ error: 'Некорректные данные' });
    return;
  }

  const targetId = String(userId);

  try {
    const { data: me, error: meError } = await supabase
      .from('users')
      .select('is_admin, blocked')
      .eq('id', uid)
      .maybeSingle();

    if (meError || !me || !me.is_admin || me.blocked) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    if (targetId === uid) {
      res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
      return;
    }

    const { data: target, error: targetError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', targetId)
      .maybeSingle();

    if (targetError || !target) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    if (target.is_admin) {
      res.status(403).json({ error: 'Нельзя заблокировать администратора' });
      return;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ blocked })
      .eq('id', targetId);

    if (updateError) throw updateError;

    res.status(200).json({ id: targetId, blocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};