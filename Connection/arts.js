// Предложка творчества: форма «Предложка» + окно #arts_menu (заявки, просмотр, модерация, планирование)
// Всё внутри функции, наружу выходит только window.renderSuggestForm (его вызывает connection.js)
(function () {
  const ALLOWED_TYPES = { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'video/mp4': 'video' };
  const ANON_HINT = 'Выберете "Анон" если не желаете что б под постом писали ваш ник как автора';
  const BREAK_BEFORE = new Set(['Интерн', 'ОС']); // где в списке хештегов начинается новая строка

  /* ---------- Мелкие помощники ---------- */

  // h('div', {class:'x', text:'...', onclick: fn}, ...дети) — безопасно: текст идёт через textContent
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  const toast = (text, kind) => (typeof showToast === 'function' ? showToast(text, kind) : alert(text));

  async function api(action, body = {}) {
    const res = await fetch('/api/arts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error === 'USER_BLOCKED' ? 'Доступ ограничен' : (data.error || 'Ошибка запроса'));
    return data;
  }

  let metaPromise = null;
  function getMeta() {
    if (!metaPromise) metaPromise = api('meta').catch((e) => { metaPromise = null; throw e; });
    return metaPromise;
  }

  const fmtDate = (iso) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

  function toLocalInput(date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
  }

  /* ---------- Просмотр медиа на весь экран ---------- */

  function openLightbox(item) {
    const media = item.type === 'video'
      ? h('video', { src: item.url, controls: true, autoplay: true, playsinline: true })
      : h('img', { src: item.url, alt: '' });
    const box = h('div', { class: 'lightbox' }, media);
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', (e) => { if (e.target !== media) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
  }

  /* ---------- Выбор медиа (квадраты с прокруткой) ---------- */

  function createMediaPicker({ meta, initial = [], readonly = false, onChange = () => {} }) {
    const limits = meta.limits;
    let seq = 0;
    let items = initial.map((m) => ({ key: m.path, path: m.path, type: m.type, url: m.url, file: null }));
    const initialKeys = items.map((i) => i.key).join('|');

    const strip = h('div', { class: 'media-strip' });
    const input = h('input', { type: 'file', accept: Object.keys(ALLOWED_TYPES).join(','), multiple: true, hidden: true });
    const el = h('div', { class: 'media-picker' }, strip, input);

    function render() {
      strip.replaceChildren();
      for (const item of items) {
        const preview = item.type === 'video'
          ? h('video', { src: item.url, muted: true, preload: 'metadata', playsinline: true })
          : h('img', { src: item.url, alt: '' });
        const tile = h('div', { class: 'media-tile', onclick: () => openLightbox(item) }, preview,
          item.type === 'video' ? h('span', { class: 'media-badge', text: '▶' }) : null,
          readonly ? null : h('button', {
            type: 'button', class: 'media-remove', 'aria-label': 'Убрать', text: '✕',
            onclick: (e) => {
              e.stopPropagation();
              items = items.filter((x) => x !== item);
              if (item.file) URL.revokeObjectURL(item.url);
              render(); onChange();
            },
          }));
        strip.append(tile);
      }
      if (!readonly && items.length < limits.maxMedia) {
        strip.append(h('button', { type: 'button', class: 'media-add', 'aria-label': 'Добавить файл', text: '+', onclick: () => input.click() }));
      }
    }

    input.addEventListener('change', () => {
      for (const file of Array.from(input.files)) {
        if (items.length >= limits.maxMedia) { toast(`Максимум ${limits.maxMedia} файлов`, 'error'); break; }
        const type = ALLOWED_TYPES[file.type];
        if (!type) { toast('Подходят только JPG, PNG, WEBP и MP4', 'error'); continue; }
        const max = type === 'image' ? limits.imageBytes : limits.videoBytes;
        if (file.size > max) { toast(`«${file.name}» больше ${Math.round(max / 1048576)} МБ`, 'error'); continue; }
        items.push({ key: 'new' + (++seq), path: null, type, url: URL.createObjectURL(file), file });
      }
      input.value = '';
      render(); onChange();
    });

    render();

    async function uploadItem(item) {
      const info = await api('upload-url', { mime: item.file.type, size: item.file.size });
      const fd = new FormData();
      fd.append('cacheControl', '3600');
      fd.append('', item.file);
      const headers = { 'x-upsert': 'false' };
      if (info.apikey) { headers.apikey = info.apikey; headers.Authorization = 'Bearer ' + info.apikey; }
      const r = await fetch(info.signedUrl, { method: 'PUT', headers, body: fd });
      if (!r.ok) throw new Error('Не удалось загрузить файл');
      item.path = info.path;
    }

    return {
      el,
      count: () => items.length,
      isChanged: () => items.map((i) => i.key).join('|') !== initialKeys,
      // Загружает новые файлы и возвращает список [{path}] в нужном порядке
      async upload() {
        for (const item of items) if (!item.path) await uploadItem(item);
        return items.map((i) => ({ path: i.path }));
      },
      destroy() { items.forEach((i) => i.file && URL.revokeObjectURL(i.url)); },
    };
  }

  /* ---------- Выбор хештегов ---------- */

  function createHashtagPicker({ tags, selected = [], readonly = false, onChange = () => {} }) {
    const set = new Set(selected);
    const el = h('div', { class: 'tag-picker' });
    const buttons = [];
    for (const tag of tags) {
      if (readonly && !set.has(tag)) continue;
      if (BREAK_BEFORE.has(tag) && el.childNodes.length) el.append(h('span', { class: 'tag-break' }));
      const b = h(readonly ? 'span' : 'button', { class: 'tag' + (set.has(tag) ? ' selected' : ''), text: '#' + tag, ...(readonly ? {} : { type: 'button', 'aria-pressed': String(set.has(tag)) }) });
      if (!readonly) {
        b.addEventListener('click', () => {
          if (set.has(tag)) set.delete(tag); else set.add(tag);
          b.classList.toggle('selected', set.has(tag));
          b.setAttribute('aria-pressed', String(set.has(tag)));
          onChange();
        });
      }
      buttons.push(b);
      el.append(b);
    }
    const initialKey = [...set].sort().join('|');
    return {
      el,
      getSelected: () => tags.filter((t) => set.has(t)),
      isChanged: () => [...set].sort().join('|') !== initialKey,
    };
  }

  // Выбор ровно одного варианта (откуда взято)
  function createSingleChoice(options) {
    let value = null;
    const el = h('div', { class: 'tag-picker source-picker' });
    const btns = options.map((o) => {
      const b = h('button', { type: 'button', class: 'tag', text: o.label, 'aria-pressed': 'false' });
      b.addEventListener('click', () => {
        value = o.id;
        btns.forEach((x) => { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      });
      el.append(b);
      return b;
    });
    return { el, getValue: () => value };
  }

  // Чекбокс «Анон / Не анон» + подсказка (¡)
  function createAnonRow({ checked = false, readonly = false, onChange = () => {} }) {
    const box = h('input', { type: 'checkbox', disabled: readonly });
    box.checked = checked;
    const label = h('span', { text: checked ? 'Анон' : 'Не анон' });
    box.addEventListener('change', () => { label.textContent = box.checked ? 'Анон' : 'Не анон'; onChange(); });
    const hint = h('div', { class: 'hint', text: ANON_HINT });
    const hintBtn = h('button', { type: 'button', class: 'hint-btn', 'aria-label': 'Подсказка', text: '¡', onclick: () => hint.classList.toggle('show') });
    const el = h('div', { class: 'anon-row' }, h('label', { class: 'anon-label' }, box, label), hintBtn, hint);
    return { el, isAnon: () => box.checked };
  }

  /* ---------- Форма «Предложка» ---------- */

  function renderSuggestForm(box) {
    const title = h('h3', { class: 'form-title', text: 'Предложка' });
    const form = h('form', { class: 'suggest-form', autocomplete: 'off' }, title, h('p', { class: 'form-loading', text: 'Загрузка...' }));
    box.replaceChildren(form);

    getMeta().then((meta) => {
      if (!form.isConnected) return; // пока грузилось, форму успели переключить
      const picker = createMediaPicker({ meta });
      const anon = createAnonRow({});
      const tags = createHashtagPicker({ tags: meta.hashtags });
      const send = h('button', { type: 'submit', class: 'send-btn', text: 'Отправить' });
      form.replaceChildren(title, picker.el, anon.el, tags.el, send);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!picker.count()) { toast('Добавьте хотя бы один файл', 'error'); return; }
        const selected = tags.getSelected();
        if (!selected.length) { toast('Выберите хотя бы один хештег', 'error'); return; }

        send.disabled = true;
        toast('Загрузка файлов...', 'info');
        try {
          const media = await picker.upload();
          const r = await api('create', { media, anon: anon.isAnon(), hashtags: selected });
          toast(`Предложка №${r.number} отправлена`, 'ok');
          picker.destroy();
          if (form.isConnected) renderSuggestForm(form.parentElement);
        } catch (err) {
          toast(err.message || 'Не удалось отправить', 'error');
          send.disabled = false;
        }
      });
    }).catch(() => {
      if (!form.isConnected) return;
      form.replaceChildren(title, h('p', { class: 'form-loading', text: 'Не удалось загрузить форму. Обновите страницу.' }));
    });
  }
  window.renderSuggestForm = renderSuggestForm;

  /* ---------- Окно заявок #arts_menu ---------- */

  const state = { menu: null, box: null, isMod: false, meta: null, cleanup: null };

  function setView(...nodes) {
    if (state.cleanup) { state.cleanup(); state.cleanup = null; }
    state.box.replaceChildren(...nodes);
  }

  function openMenu() {
    if (typeof openModalFade === 'function') openModalFade(state.menu);
    else { state.menu.style.display = 'flex'; state.menu.classList.add('active'); }
    showList();
  }

  function closeMenu() {
    if (typeof closeModalFade === 'function') closeModalFade(state.menu);
    else { state.menu.classList.remove('active'); state.menu.style.display = 'none'; }
    setView();
  }

  async function showList() {
    setView(h('p', { class: 'form-loading', text: 'Загрузка...' }));
    try {
      const data = await api('list');
      state.isMod = data.isModerator;
      state.meta = data.meta;
      renderList(data.arts);
    } catch (err) {
      setView(h('p', { class: 'form-loading', text: err.message || 'Не удалось загрузить заявки' }));
    }
  }

  function renderList(arts) {
    const list = h('div', { class: 'arts_list' });
    if (!arts.length) {
      list.append(h('p', { class: 'form-loading', text: state.isMod ? 'Заявок пока нет' : 'У вас пока нет заявок. Отправить можно через форму «Предложка»' }));
    }
    for (const art of arts) {
      const first = art.media[0];
      const thumb = !first ? h('div', { class: 'art-thumb' })
        : h('div', { class: 'art-thumb' }, first.type === 'video'
          ? h('video', { src: first.url, muted: true, preload: 'metadata', playsinline: true })
          : h('img', { src: first.url, alt: '' }));
      list.append(h('button', { type: 'button', class: 'art-row', onclick: () => renderDetail(art) },
        thumb,
        h('span', { class: 'art-tag', text: art.kind === 'mod' ? 'Пост' : 'Арт' }),
        h('span', { class: 'art-info' },
          h('span', { class: 'art-number', text: '№' + art.number }),
          h('span', { class: 'art-status ' + art.status, text: art.statusLabel }))));
    }
    const nodes = [list];
    if (state.isMod) nodes.push(h('button', { type: 'button', class: 'arts-action', text: 'Запланировать пост', onclick: renderCompose }));
    setView(...nodes);
  }

  const line = (label, value) => h('p', { class: 'art-line' }, h('b', { text: label + ' ' }), value);

  async function guarded(fn, okText) {
    try {
      await fn();
      if (okText) toast(okText, 'ok');
      showList();
    } catch (err) {
      toast(err.message || 'Ошибка', 'error');
    }
  }

  function renderDetail(art) {
    const meta = state.meta;
    const isModView = state.isMod;
    const editable = !isModView && art.kind === 'user' && art.status === 'pending';

    let picker, anon, tags;
    const actions = h('div', { class: 'art-actions' });
    const back = h('button', { type: 'button', class: 'arts-back', text: 'Назад', onclick: showList });

    const refreshButtons = () => {
      if (!editable) return;
      const changed = picker.isChanged() || tags.isChanged() || anon.isAnon() !== art.anon;
      actions.replaceChildren(back, changed
        ? h('button', { type: 'button', class: 'arts-save', text: 'Сохранить', onclick: save })
        : h('button', { type: 'button', class: 'arts-delete', text: 'Удалить', onclick: remove }));
    };

    picker = createMediaPicker({ meta, initial: art.media, readonly: !editable, onChange: refreshButtons });
    anon = createAnonRow({ checked: art.anon, readonly: !editable, onChange: refreshButtons });
    tags = createHashtagPicker({ tags: meta.hashtags, selected: art.hashtags, readonly: !editable, onChange: refreshButtons });

    async function save() {
      const selected = tags.getSelected();
      if (!picker.count()) return toast('Добавьте хотя бы один файл', 'error');
      if (!selected.length) return toast('Выберите хотя бы один хештег', 'error');
      toast('Сохранение...', 'info');
      guarded(async () => {
        const media = await picker.upload();
        await api('update', { id: art.id, media, anon: anon.isAnon(), hashtags: selected });
      }, 'Изменения сохранены');
    }
    function remove() {
      if (!confirm(`Удалить заявку №${art.number}?`)) return;
      guarded(() => api('delete', { id: art.id }), 'Заявка удалена');
    }

    const head = [h('h3', { class: 'form-title', text: (art.kind === 'mod' ? 'Пост №' : 'Предложка №') + art.number })];
    head.push(h('p', { class: 'art-status ' + art.status, text: art.statusLabel }));

    const info = [];
    if (isModView && art.author) {
      info.push(line(art.kind === 'mod' ? 'Запланировал:' : 'Автор:', `${art.author.firstName || '—'} | ${art.author.username ? '@' + art.author.username : 'нет username'} | ID ${art.author.id}`));
    }
    if (art.kind === 'user') info.push(line('Источник -', meta.suggestSource));
    if (art.kind === 'mod') {
      const src = meta.sources.find((s) => s.id === art.source);
      info.push(line('Откуда взято -', src ? src.label : ''));
      info.push(line('Автор -', art.authorText || ''));
    }
    if (art.publishAt && ['accepted', 'publishing', 'failed'].includes(art.status)) info.push(line('Публикация:', fmtDate(art.publishAt)));

    const body = [picker.el, ...(art.kind === 'user' ? [anon.el] : []), tags.el];

    if (editable) {
      refreshButtons();
    } else if (isModView) {
      if (art.kind === 'user' && art.status === 'pending') {
        const when = h('input', { type: 'datetime-local', min: toLocalInput(new Date()) });
        when.value = toLocalInput(new Date(Date.now() + 3600000));
        const acceptBox = h('div', { class: 'accept-box', hidden: true }, h('label', { text: 'Когда опубликовать: ' }, when),
          h('button', { type: 'button', class: 'arts-accept', text: 'Подтвердить', onclick: () => {
            if (!when.value) return toast('Укажите дату и время', 'error');
            guarded(() => api('review', { id: art.id, decision: 'accept', publishAt: new Date(when.value).toISOString() }), `Предложка №${art.number} принята`);
          } }));
        actions.append(
          h('button', { type: 'button', class: 'arts-reject', text: 'Отклонить', onclick: () => {
            if (!confirm(`Отклонить заявку №${art.number}?`)) return;
            guarded(() => api('review', { id: art.id, decision: 'reject' }), `Предложка №${art.number} отклонена`);
          } }),
          h('button', { type: 'button', class: 'arts-accept', text: 'Принять', onclick: () => { acceptBox.hidden = !acceptBox.hidden; } }),
          acceptBox);
      } else if (art.kind === 'mod' && ['accepted', 'failed'].includes(art.status)) {
        actions.append(h('button', { type: 'button', class: 'arts-delete', text: 'Удалить', onclick: remove }));
      }
      // Модератор выходит из просмотра кликом за окном
    } else if (art.kind === 'user' && art.status === 'accepted') {
      actions.append(back, h('button', { type: 'button', class: 'arts-delete', text: 'Отменить', onclick: () => {
        if (!confirm(`Отменить принятую заявку №${art.number}?`)) return;
        guarded(() => api('cancel', { id: art.id }), 'Заявка отменена');
      } }));
    } else {
      actions.append(back);
    }

    setView(h('div', { class: 'art-detail' }, ...head, ...info, ...body), actions);
    state.cleanup = () => picker.destroy();
  }

  function renderCompose() {
    const meta = state.meta;
    const picker = createMediaPicker({ meta });
    const source = createSingleChoice(meta.sources);
    const author = h('input', { type: 'text', class: 'art-author', placeholder: 'Автор', maxlength: meta.limits.authorText });
    const tags = createHashtagPicker({ tags: meta.hashtags });
    const when = h('input', { type: 'datetime-local', min: toLocalInput(new Date()) });
    when.value = toLocalInput(new Date(Date.now() + 3600000));

    const send = h('button', { type: 'button', class: 'arts-save', text: 'Запланировать', onclick: async () => {
      const selected = tags.getSelected();
      if (!picker.count()) return toast('Добавьте хотя бы один файл', 'error');
      if (!source.getValue()) return toast('Выберите, откуда взято', 'error');
      if (!author.value.trim()) return toast('Укажите автора', 'error');
      if (!selected.length) return toast('Выберите хотя бы один хештег', 'error');
      if (!when.value) return toast('Укажите дату и время', 'error');
      send.disabled = true;
      toast('Загрузка файлов...', 'info');
      try {
        const media = await picker.upload();
        const r = await api('schedule', {
          media, hashtags: selected, source: source.getValue(), authorText: author.value.trim(),
          publishAt: new Date(when.value).toISOString(),
        });
        toast(`Пост №${r.number} запланирован`, 'ok');
        showList();
      } catch (err) {
        toast(err.message || 'Ошибка', 'error');
        send.disabled = false;
      }
    } });

    setView(
      h('div', { class: 'art-detail' },
        h('h3', { class: 'form-title', text: 'Запланировать пост' }),
        picker.el,
        h('p', { class: 'art-line', text: 'Откуда взято:' }), source.el,
        author,
        tags.el,
        h('label', { class: 'art-line', text: 'Когда опубликовать: ' }, when)),
      h('div', { class: 'art-actions' }, h('button', { type: 'button', class: 'arts-back', text: 'Назад', onclick: showList }), send));
    state.cleanup = () => picker.destroy();
  }

  function setupArtsMenu() {
    const btn = document.getElementById('btnartconsole');
    const menu = document.getElementById('arts_menu');
    if (!btn || !menu) return;
    state.menu = menu;
    state.box = menu.querySelector('.arts_menu_box') || menu;
    btn.addEventListener('click', openMenu);
    // Клик за пределами окна закрывает его
    menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });
  }

  document.addEventListener('DOMContentLoaded', setupArtsMenu);
})();