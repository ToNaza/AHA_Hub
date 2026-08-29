const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_SECRET = process.env.SESSION_SECRET;

module.exports = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    res.status(400).json({ error: 'Токен обязателен' });
    return;
  }

  try {
    const { data: tokenRow, error } = await supabase
      .from('login_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (error || !tokenRow) {
      res.status(200).json({ status: 'not_found' });
      return;
    }

    if (tokenRow.status !== 'confirmed') {
      res.status(200).json({ status: 'pending' });
      return;
    }

    const uid = tokenRow.telegram_id;

    const { data: existingUser, error: userFetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (userFetchError) throw userFetchError;

    if (!existingUser) {
      const { error: insertError } = await supabase
        .from('users')
        .insert({ id: uid, balance: 0, blocked: false });
      if (insertError) throw insertError;
    } else if (existingUser.blocked) {
      await supabase.from('login_tokens').delete().eq('token', token);
      res.status(200).json({ status: 'blocked' });
      return;
    }

    // Токен одноразовый — удаляем сразу после использования
    await supabase.from('login_tokens').delete().eq('token', token);

    const sessionToken = jwt.sign({ uid }, SESSION_SECRET, {
      expiresIn: '30d',
    });

    res.setHeader(
      'Set-Cookie',
      `session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
        30 * 24 * 60 * 60
      }`
    );

    res.status(200).json({
      status: 'confirmed',
      profile: {
        id: uid,
        first_name: tokenRow.first_name,
        last_name: tokenRow.last_name,
        username: tokenRow.username,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};