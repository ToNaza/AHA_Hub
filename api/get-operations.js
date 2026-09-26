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
  const cookies = parseCookies(req);
  const token = cookies.session;

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
    const { data: ops, error } = await supabase
      .from('operations')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const counterpartyIds = [...new Set(ops.map(o => o.counterparty_id).filter(Boolean))];
    let namesById = {};

    if (counterpartyIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, username')
        .in('id', counterpartyIds);

      (users || []).forEach(u => {
        namesById[u.id] = u.first_name || u.username || u.id;
      });
    }

    const operations = ops.map(o => ({
      amount: o.amount,
      message: o.message,
      counterparty_id: o.counterparty_id,
      counterparty_name: namesById[o.counterparty_id] || o.counterparty_id,
      created_at: o.created_at,
    }));

    res.status(200).json({ operations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};