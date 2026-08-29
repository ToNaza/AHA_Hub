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
    res.status(200).json({ authenticated: false });
    return;
  }

  try {
    const payload = jwt.verify(token, SESSION_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, balance, blocked')
      .eq('id', payload.uid)
      .maybeSingle();

    if (error || !user) {
      res.status(200).json({ authenticated: false });
      return;
    }

    res.status(200).json({ authenticated: true, user });
  } catch (err) {
    // Токен невалиден или истёк
    res.status(200).json({ authenticated: false });
  }
};