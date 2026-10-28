const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = crypto.randomBytes(16).toString('hex');

  try {
    const { error } = await supabase
      .from('login_tokens')
      .insert({ token, status: 'pending' });

    if (error) throw error;

    res.status(200).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось создать токен входа' });
  }
};