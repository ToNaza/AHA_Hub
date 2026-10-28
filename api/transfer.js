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

  const cookies = parseCookies(req);
  const token = cookies.session;

  if (!token) {
    res.status(401).json({ error: 'Не авторизован' });
    return;
  }

  let uid;
  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    uid = payload.uid;
  } catch (err) {
    res.status(401).json({ error: 'Недействительная сессия' });
    return;
  }

  const { recipientId, amount, message } = req.body || {};
  const parsedAmount = parseInt(amount, 10);

  if (!recipientId || !parsedAmount || parsedAmount <= 0) {
    res.status(400).json({ error: 'Некорректные данные транзакции' });
    return;
  }

  try {
    const { data: sender, error: senderError } = await supabase
      .from('users')
      .select('blocked')
      .eq('id', uid)
      .maybeSingle();

    if (senderError || !sender) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    if (sender.blocked) {
      res.status(403).json({ error: 'USER_BLOCKED' });
      return;
    }

    const { error: rpcError } = await supabase.rpc('transfer_coins', {
      p_sender_id: uid,
      p_recipient_id: String(recipientId),
      p_amount: parsedAmount,
      p_message: message ? String(message).slice(0, 200) : null,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('INSUFFICIENT_FUNDS')) {
        res.status(400).json({ error: 'Недостаточно средств' });
        return;
      }
      if (msg.includes('RECIPIENT_NOT_FOUND')) {
        res.status(404).json({ error: 'Получатель не найден' });
        return;
      }
      if (msg.includes('SELF_TRANSFER')) {
        res.status(400).json({ error: 'Нельзя отправить самому себе' });
        return;
      }
      if (msg.includes('INVALID_AMOUNT')) {
        res.status(400).json({ error: 'Некорректная сумма' });
        return;
      }
      throw rpcError;
    }

    const { data: updatedSender } = await supabase
      .from('users')
      .select('balance')
      .eq('id', uid)
      .maybeSingle();

    res.status(200).json({ balance: updatedSender ? updatedSender.balance : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};