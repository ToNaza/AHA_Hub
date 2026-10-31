const SWITCH_FADE_MS = 200; // должно совпадать с transition в CSS (.forms)

// ---------- Форма 1: «Связь с модерацией» ----------
function renderContactForm(box) {
  box.innerHTML = `
    <form class="contact-form" autocomplete="off">
      <h3 class="form-title">Связь с модерацией</h3>
      <input type="text" id="contactHeading" placeholder="Тема" maxlength="50" required>
      <textarea id="contactDescription" placeholder="Описание" maxlength="300" required></textarea>
      <p class="form-status" id="contactStatus"></p>
      <button type="submit" id="contactSend">Отправить</button>
    </form>
  `;

  const form = box.querySelector('.contact-form');
  const heading = box.querySelector('#contactHeading');
  const description = box.querySelector('#contactDescription');
  const status = box.querySelector('#contactStatus');
  const sendBtn = box.querySelector('#contactSend');

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const h = heading.value.trim();
    const d = description.value.trim();
    if (!h || !d) {
      setStatus('Заполните тему и описание', 'error');
      return;
    }

    sendBtn.disabled = true;
    setStatus('Отправка...', '');
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
        setStatus('Отправлено ✓', 'ok');
      } else {
        setStatus(data.error === 'USER_BLOCKED' ? 'Доступ ограничен' : (data.error || 'Ошибка отправки'), 'error');
      }
    } catch (err) {
      setStatus('Нет связи с сервером', 'error');
    } finally {
      sendBtn.disabled = false;
    }
  });
}

const FORM_RENDERERS = {
  contact: renderContactForm,
  // Заготовка. Допишем, когда будет готово окно #btnartconsole и описана логика.
  suggest: (box) => { box.innerHTML = '<p>Форма «Предложка» появится здесь</p>'; },
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