const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_SECRET = process.env.SESSION_SECRET;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LOG_CHAT_ID = process.env.TELEGRAM_ARTS_LOG_CHAT_ID;   // чат уведомлений (-1004325704341)
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;          // канал для публикаций (-1004398700559)
const CRON_SECRET = process.env.CRON_SECRET;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

const BUCKET = 'arts';

// ---------- Настройки (меняются здесь) ----------
const HASHTAGS = [
  'Арт', 'Мем',
  'Интерн', 'Медсестра', 'Секретарь', 'Фельдшер', 'Психолог', 'Доктор',
  'Пожарный', 'Охранник', 'Старшая_медсестра', 'Хирург', 'Секретный_агент',
  'ОС',
];
const SOURCES = [
  { id: 'telegram',  label: '💬 Из телеграма' },
  { id: 'tiktok',    label: '🎥 Из тиктока' },
  { id: 'pinterest', label: '📷 Из пинтереста' },
  { id: 'browser',   label: '🔍 Из браузеров' },
  { id: 'suggest',   label: '⭐ Из предложки' },
];
const MAX_MEDIA = 5;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;    // лимит Telegram для фото по ссылке
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;   // лимит Telegram для видео по ссылке
const MAX_PENDING_PER_USER = 10;            // сколько заявок «на рассмотрении» может быть у одного человека
const UPLOADS_PER_HOUR = 30;
const REJECTED_KEEP_DAYS = 5;               // отклонённые / отменённые живут столько дней
const PUBLISHED_KEEP_DAYS = 3;              // опубликованные живут столько дней
const MAX_ATTEMPTS = 5;                     // сколько раз пробуем опубликовать
const MAX_AUTHOR_TEXT = 50;

const MIME = {
  'image/jpeg': { ext: 'jpg', type: 'image' },
  'image/png':  { ext: 'png', type: 'image' },
  'image/webp': { ext: 'webp', type: 'image' },
  'video/mp4':  { ext: 'mp4', type: 'video' },
};

const STATUS_LABELS = {
  pending: 'На рассмотрении',
  accepted: 'Принята',
  rejected: 'Отклонена',
  canceled: 'Отменена',
  publishing: 'Публикуется',
  published: 'Опубликована',
  failed: 'Ошибка публикации',
};

// ---------- Утилиты ----------
function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').filter(Boolean).map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, decodeURIComponent(rest.join('='))];
    })
  );
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const num = (id) => String(id).padStart(4, '0');
const addDays = (d) => new Date(Date.now() + d * 86400000).toISOString();
const publicUrl = (path) => `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

async function telegram(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = {};
  try { data = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok || !data.ok) {
    throw new Error(`Telegram ${method}: ${r.status} ${data.description || ''}`);
  }
  return data;
}

// Уведомление в служебный чат. Никогда не роняет основной запрос
async function sendLog(text) {
  try {
    if (!LOG_CHAT_ID) return;
    await telegram('sendMessage', { chat_id: LOG_CHAT_ID, text });
  } catch (err) {
    console.error('log chat failed', err.message);
  }
}

async function authenticate(req) {
  const token = parseCookies(req).session;
  if (!token) throw new HttpError(401, 'Не авторизован');
  let uid;
  try { uid = String(jwt.verify(token, SESSION_SECRET).uid); }
  catch (e) { throw new HttpError(401, 'Недействительная сессия'); }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, first_name, blocked, is_admin, is_moderator')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw new HttpError(404, 'Пользователь не найден');
  if (user.blocked) throw new HttpError(403, 'USER_BLOCKED');
  user.id = String(user.id);
  user.isMod = !!(user.is_admin || user.is_moderator);
  return user;
}

function validateHashtags(input) {
  if (!Array.isArray(input)) throw new HttpError(400, 'Выберите хотя бы один хештег');
  const set = new Set(input.map(String));
  const tags = HASHTAGS.filter((t) => set.has(t));       // в каноническом порядке
  if (tags.length === 0 || tags.length !== set.size) {
    throw new HttpError(400, 'Выберите хотя бы один хештег');
  }
  return tags;
}

function validateFuture(value) {
  const d = new Date(value);
  if (!value || isNaN(d.getTime())) throw new HttpError(400, 'Укажите дату и время публикации');
  if (d.getTime() < Date.now() - 60000) throw new HttpError(400, 'Это время уже прошло');
  if (d.getTime() > Date.now() + 366 * 86400000) throw new HttpError(400, 'Слишком далёкая дата');
  return d.toISOString();
}

// Проверяет список медиа: пути выданы именно этому пользователю и файлы реально загружены
async function validateMedia(uid, input, { existing = [] } = {}) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_MEDIA) {
    throw new HttpError(400, `Добавьте от 1 до ${MAX_MEDIA} файлов`);
  }
  const paths = input.map((m) => String(m && m.path));
  if (new Set(paths).size !== paths.length) throw new HttpError(400, 'Повторяющиеся файлы');
  const re = new RegExp(`^${uid}/[0-9a-f-]{36}\\.(jpg|png|webp|mp4)$`);
  if (!paths.every((p) => re.test(p))) throw new HttpError(400, 'Некорректный файл');

  const { data: rows, error } = await supabase
    .from('art_uploads').select('path, type').eq('author_id', uid).in('path', paths);
  if (error) throw error;
  if (!rows || rows.length !== paths.length) throw new HttpError(400, 'Файл не найден, загрузите заново');
  const typeByPath = Object.fromEntries(rows.map((r) => [r.path, r.type]));

  const fresh = paths.filter((p) => !existing.includes(p));
  await Promise.all(fresh.map(async (p) => {
    const name = p.split('/')[1];
    const { data, error: listErr } = await supabase.storage.from(BUCKET).list(uid, { limit: 5, search: name });
    if (listErr) throw listErr;
    if (!data || !data.some((f) => f.name === name)) throw new HttpError(400, 'Файл не загрузился, попробуйте ещё раз');
  }));

  return paths.map((p) => ({ path: p, type: typeByPath[p] }));
}

async function markUsed(paths) {
  if (paths.length) await supabase.from('art_uploads').update({ used: true }).in('path', paths);
}

async function removeFiles(paths) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error('storage remove failed', error.message);
  await supabase.from('art_uploads').delete().in('path', paths);
}

async function loadArt(id) {
  const { data, error } = await supabase.from('arts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Заявка не найдена');
  return data;
}

function serialize(row, authors) {
  const out = {
    id: row.id,
    number: num(row.id),
    kind: row.kind,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    anon: row.anon,
    hashtags: row.hashtags,
    source: row.source,
    authorText: row.author_text,
    publishAt: row.publish_at,
    createdAt: row.created_at,
    media: (row.media || []).map((m) => ({ path: m.path, type: m.type, url: publicUrl(m.path) })),
  };
  if (authors) {
    const a = authors[row.author_id] || {};
    out.author = { id: row.author_id, firstName: a.first_name || '', username: a.username || '' };
  }
  return out;
}

const meta = () => ({
  hashtags: HASHTAGS,
  sources: SOURCES,
  limits: { maxMedia: MAX_MEDIA, imageBytes: IMAGE_MAX_BYTES, videoBytes: VIDEO_MAX_BYTES, authorText: MAX_AUTHOR_TEXT },
});

// ---------- Действия пользователя ----------
const actions = {
  async meta() { return meta(); },

  async 'upload-url'(body, user) {
    const info = MIME[String(body.mime)];
    const size = Number(body.size);
    if (!info || !(size > 0)) throw new HttpError(400, 'Этот тип файла не поддерживается');
    const limit = info.type === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
    if (size > limit) {
      throw new HttpError(400, `Файл слишком большой (максимум ${Math.round(limit / 1048576)} МБ)`);
    }
    const since = new Date(Date.now() - 3600000).toISOString();
    const { count } = await supabase.from('art_uploads')
      .select('path', { count: 'exact', head: true }).eq('author_id', user.id).gte('created_at', since);
    if ((count || 0) >= UPLOADS_PER_HOUR) throw new HttpError(429, 'Слишком много загрузок, подождите немного');

    const path = `${user.id}/${crypto.randomUUID()}.${info.ext}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    const { error: insErr } = await supabase.from('art_uploads')
      .insert({ path, author_id: user.id, type: info.type });
    if (insErr) throw insErr;
    return { path, type: info.type, signedUrl: data.signedUrl, token: data.token, apikey: ANON_KEY || null };
  },

  async create(body, user) {
    const hashtags = validateHashtags(body.hashtags);
    const { count } = await supabase.from('arts')
      .select('id', { count: 'exact', head: true }).eq('author_id', user.id).eq('status', 'pending');
    if ((count || 0) >= MAX_PENDING_PER_USER) {
      throw new HttpError(400, `Одновременно можно держать не больше ${MAX_PENDING_PER_USER} заявок на рассмотрении`);
    }
    const media = await validateMedia(user.id, body.media);
    const { data, error } = await supabase.from('arts')
      .insert({ kind: 'user', author_id: user.id, media, anon: !!body.anon, hashtags })
      .select('id').single();
    if (error) throw error;
    await markUsed(media.map((m) => m.path));
    await sendLog(`Создана предложка творчества №${num(data.id)}`);
    return { id: data.id, number: num(data.id) };
  },

  async list(body, user) {
    let q = supabase.from('arts').select('*').order('id', { ascending: false }).limit(200);
    if (!user.isMod) q = q.eq('author_id', user.id);
    const { data, error } = await q;
    if (error) throw error;

    let authors = null;
    if (user.isMod && data.length) {
      const ids = [...new Set(data.map((r) => r.author_id))];
      const { data: us } = await supabase.from('users').select('id, username, first_name').in('id', ids);
      authors = Object.fromEntries((us || []).map((u) => [String(u.id), u]));
    }
    return { isModerator: user.isMod, arts: data.map((r) => serialize(r, authors)), meta: meta() };
  },

  async update(body, user) {
    const art = await loadArt(body.id);
    if (art.author_id !== user.id || art.kind !== 'user' || art.status !== 'pending') {
      throw new HttpError(403, 'Эту заявку нельзя изменить');
    }
    const hashtags = validateHashtags(body.hashtags);
    const oldPaths = art.media.map((m) => m.path);
    const media = await validateMedia(user.id, body.media, { existing: oldPaths });
    const { error } = await supabase.from('arts')
      .update({ media, anon: !!body.anon, hashtags, updated_at: new Date().toISOString() })
      .eq('id', art.id).eq('status', 'pending');
    if (error) throw error;
    const newPaths = media.map((m) => m.path);
    await markUsed(newPaths);
    await removeFiles(oldPaths.filter((p) => !newPaths.includes(p)));
    return { ok: true };
  },

  async delete(body, user) {
    const art = await loadArt(body.id);
    const ownPending = art.author_id === user.id && art.kind === 'user' && art.status === 'pending';
    const modScheduled = user.isMod && art.kind === 'mod' && ['accepted', 'failed'].includes(art.status);
    if (!ownPending && !modScheduled) throw new HttpError(403, 'Эту заявку нельзя удалить');
    const { error } = await supabase.from('arts').delete().eq('id', art.id).eq('status', art.status);
    if (error) throw error;
    await removeFiles(art.media.map((m) => m.path));
    return { ok: true };
  },

  async cancel(body, user) {
    const art = await loadArt(body.id);
    if (art.author_id !== user.id || art.kind !== 'user' || art.status !== 'accepted') {
      throw new HttpError(403, 'Эту заявку нельзя отменить');
    }
    const { data, error } = await supabase.from('arts')
      .update({ status: 'canceled', delete_after: addDays(REJECTED_KEEP_DAYS), updated_at: new Date().toISOString() })
      .eq('id', art.id).eq('status', 'accepted').select('id');
    if (error) throw error;
    if (!data || !data.length) throw new HttpError(409, 'Заявка уже изменилась, обновите список');
    await sendLog(`Принятая предложка №${num(art.id)} была отменена автором`);
    return { ok: true };
  },

  async review(body, user) {
    if (!user.isMod) throw new HttpError(403, 'Нет доступа');
    const art = await loadArt(body.id);
    if (art.kind !== 'user' || art.status !== 'pending') throw new HttpError(409, 'Заявка уже обработана');

    let patch;
    if (body.decision === 'accept') {
      patch = { status: 'accepted', publish_at: validateFuture(body.publishAt) };
    } else if (body.decision === 'reject') {
      patch = { status: 'rejected', delete_after: addDays(REJECTED_KEEP_DAYS) };
    } else {
      throw new HttpError(400, 'Некорректное решение');
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('arts')
      .update(patch).eq('id', art.id).eq('status', 'pending').select('id');
    if (error) throw error;
    if (!data || !data.length) throw new HttpError(409, 'Заявка уже обработана');
    await sendLog(`Предложка №${num(art.id)} ${body.decision === 'accept' ? 'принята' : 'отклонена'}`);
    return { ok: true };
  },

  async schedule(body, user) {
    if (!user.isMod) throw new HttpError(403, 'Нет доступа');
    const hashtags = validateHashtags(body.hashtags);
    const source = SOURCES.find((s) => s.id === body.source);
    if (!source) throw new HttpError(400, 'Выберите, откуда взято');
    const authorText = String(body.authorText || '').trim();
    if (!authorText || authorText.length > MAX_AUTHOR_TEXT) {
      throw new HttpError(400, `Укажите автора (до ${MAX_AUTHOR_TEXT} символов)`);
    }
    const publishAt = validateFuture(body.publishAt);
    const media = await validateMedia(user.id, body.media);
    const { data, error } = await supabase.from('arts')
      .insert({
        kind: 'mod', author_id: user.id, media, hashtags, source: source.id,
        author_text: authorText, status: 'accepted', publish_at: publishAt,
      }).select('id').single();
    if (error) throw error;
    await markUsed(media.map((m) => m.path));
    return { id: data.id, number: num(data.id) };
  },
};

// ---------- Публикация и очистка (вызывается планировщиком раз в минуту) ----------
function buildCaption(row, author) {
  const tags = row.hashtags.map((t) => '#' + t).join(' ');
  let head;
  if (row.kind === 'mod') {
    const src = SOURCES.find((s) => s.id === row.source);
    head = `Откуда взято - ${src ? src.label : ''}, Автор - ${row.author_text}`;
  } else if (row.anon) {
    head = 'Автор - Решил остаться анонимным';
  } else {
    const name = author && author.username ? '@' + author.username : (author && author.first_name) || 'Неизвестно';
    head = `Автор - ${name}`;
  }
  return `${head}\n\n${tags}`;
}

async function publishArt(row) {
  let author = null;
  if (row.kind === 'user' && !row.anon) {
    const { data } = await supabase.from('users').select('username, first_name').eq('id', row.author_id).maybeSingle();
    author = data;
  }
  const caption = buildCaption(row, author);
  const items = row.media.map((m) => ({ type: m.type === 'video' ? 'video' : 'photo', url: publicUrl(m.path) }));

  if (items.length === 1) {
    const it = items[0];
    if (it.type === 'video') {
      await telegram('sendVideo', { chat_id: CHANNEL_ID, video: it.url, caption, supports_streaming: true });
    } else {
      await telegram('sendPhoto', { chat_id: CHANNEL_ID, photo: it.url, caption });
    }
  } else {
    await telegram('sendMediaGroup', {
      chat_id: CHANNEL_ID,
      media: items.map((it, i) => ({ type: it.type, media: it.url, ...(i === 0 ? { caption } : {}) })),
    });
  }
}

async function handleCron(req, res) {
  const auth = req.headers.authorization || '';
  const key = (req.query && req.query.key) || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!CRON_SECRET || key !== CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = { published: 0, failed: 0, deleted: 0, orphans: 0 };

  // 1. Публикация того, чьё время пришло
  const { data: due, error: dueErr } = await supabase.from('arts').select('*')
    .eq('status', 'accepted').lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: true }).limit(5);
  if (dueErr) throw dueErr;

  for (const row of due || []) {
    // «Захват»: если другой запуск уже взял эту заявку, пропускаем (двойной публикации не будет)
    const { data: claimed } = await supabase.from('arts')
      .update({ status: 'publishing' }).eq('id', row.id).eq('status', 'accepted').select('id');
    if (!claimed || !claimed.length) continue;

    try {
      await publishArt(row);
      await supabase.from('arts').update({
        status: 'published', published_at: new Date().toISOString(),
        delete_after: addDays(PUBLISHED_KEEP_DAYS), updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      result.published++;
    } catch (err) {
      console.error('publish failed', row.id, err.message);
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await supabase.from('arts').update({
        status: giveUp ? 'failed' : 'accepted', attempts, updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      if (giveUp) {
        result.failed++;
        await sendLog(`Не удалось опубликовать пост №${num(row.id)} (${MAX_ATTEMPTS} попыток). Проверьте заявку на сайте`);
      }
    }
  }

  // 2. Удаление просроченных записей вместе с файлами
  const { data: old } = await supabase.from('arts').select('id, media')
    .lte('delete_after', new Date().toISOString()).limit(50);
  for (const row of old || []) {
    await supabase.from('arts').delete().eq('id', row.id);
    await removeFiles(row.media.map((m) => m.path));
    result.deleted++;
  }

  // 3. Файлы, которые загрузили, но заявку так и не отправили (старше суток)
  const { data: orphans } = await supabase.from('art_uploads').select('path')
    .eq('used', false).lte('created_at', new Date(Date.now() - 86400000).toISOString()).limit(50);
  if (orphans && orphans.length) {
    await removeFiles(orphans.map((o) => o.path));
    result.orphans = orphans.length;
  }

  res.status(200).json(result);
}

// ---------- Вход ----------
module.exports = async (req, res) => {
  try {
    const action = (req.query && req.query.action) || (req.body && req.body.action);

    if (action === 'cron') {
      await handleCron(req, res);
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const handler = Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : null;
    if (!handler) {
      res.status(400).json({ error: 'Неизвестное действие' });
      return;
    }

    const user = await authenticate(req);
    const result = await handler(req.body || {}, user);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};