const SWITCH_FADE_MS = 200; // должно совпадать с transition в CSS (.forms)

// ---------- Уведомления на сайте ----------
// showToast('текст', 'ok' | 'error' | 'info')
function showToast(text, kind = 'info', ms = 3500) {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text; // textContent: текст не может внедрить HTML
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- Форма 1: «Связь с модерацией» ----------
function renderContactForm(box) {
  box.innerHTML = `
    <form class="contact-form" autocomplete="off">
      <h3 class="form-title">Связь с модерацией</h3>
      <input type="text" id="contactHeading" placeholder="Тема" maxlength="50" required>
      <textarea id="contactDescription" placeholder="Описание" maxlength="300" required></textarea>
      <button type="submit" id="contactSend">Отправить</button>
    </form>
  `;

  const form = box.querySelector('.contact-form');
  const heading = box.querySelector('#contactHeading');
  const description = box.querySelector('#contactDescription');
  const sendBtn = box.querySelector('#contactSend');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const h = heading.value.trim();
    const d = description.value.trim();
    if (!h || !d) {
      showToast('Заполните тему и описание', 'error');
      return;
    }

    sendBtn.disabled = true;
    try {
      const res = await fetch('/api/send-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ heading: h, description: d }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        heading.value = '';
        description.value = '';
        showToast('Сообщение отправлено', 'ok');
      } else {
        showToast(data.error === 'USER_BLOCKED' ? 'Доступ ограничен' : (data.error || 'Ошибка отправки'), 'error');
      }
    } catch (err) {
      showToast('Нет связи с сервером', 'error');
    } finally {
      sendBtn.disabled = false;
    }
  });
}

const FORM_RENDERERS = {
  contact: renderContactForm,
  // Сама форма живёт в arts.js (там же окно заявок)
  suggest: (box) => {
    if (typeof renderSuggestForm === 'function') renderSuggestForm(box);
    else box.textContent = 'Не удалось загрузить форму';
  },
};

let switchTimer = null;

function showForm(type, { animate = true } = {}) {
  const box = document.querySelector('.forms');
  const render = FORM_RENDERERS[type];
  if (!box || !render) return;

  clearTimeout(switchTimer);
  if (!animate) { render(box); return; }

  box.classList.add('switching');
  switchTimer = setTimeout(() => {
    render(box);
    box.classList.remove('switching');
  }, SWITCH_FADE_MS);
}

function setupFormSwitcher() {
  const select = document.getElementById('formSelect');
  if (!select) return;
  showForm(select.value, { animate: false });
  select.addEventListener('change', () => showForm(select.value));
}

document.addEventListener('DOMContentLoaded', setupFormSwitcher);