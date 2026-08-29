const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

module.exports = async (req, res) => {
  // Проверяем, что запрос реально пришёл от Telegram, а не от кого-то ещё
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  if (secretHeader !== WEBHOOK_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const update = req.body;
  const message = update && update.message;

  // Telegram ожидает ответ 200 в любом случае, иначе будет повторять запрос
  if (!message || !message.text) {
    res.status(200).json({ ok: true });
    return;
  }

  const match = message.text.match(/^\/start\s+(\S+)/);
  if (!match) {
    res.status(200).json({ ok: true });
    return;
  }

  const token = match[1];
  const from = message.from;

  try {
    const { data: tokenRow, error: fetchError } = await supabase
      .from('login_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (fetchError || !tokenRow) {
      await sendMessage(
        message.chat.id,
        'Ссылка входа недействительна или устарела. Вернитесь на сайт и попробуйте снова.'
      );
      res.status(200).json({ ok: true });
      return;
    }

    await supabase
      .from('login_tokens')
      .update({
        status: 'confirmed',
        telegram_id: String(from.id),
        first_name: from.first_name || '',
        last_name: from.last_name || '',
        username: from.username || '',
      })
      .eq('token', token);

    await sendMessage(
      message.chat.id,
      'Готово! Вы вошли на сайт AHA Hub. Можете вернуться в браузер.'
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: true });
  }
};