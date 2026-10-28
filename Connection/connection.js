const SWITCH_FADE_MS = 200; // должно совпадать с transition в CSS (.forms)

// Заготовки. Содержимое каждой формы допишем, когда будет описана её логика.
const FORM_RENDERERS = {
  contact: (box) => {
    box.innerHTML = '<p>Форма «Связь с модерацией» появится здесь</p>';
  },
  suggest: (box) => {
    box.innerHTML = '<p>Форма «Предложка» появится здесь</p>';
  },
};

let switchTimer = null;

function showForm(type, { animate = true } = {}) {
  const box = document.querySelector('.forms');
  const render = FORM_RENDERERS[type];
  if (!box || !render) return;

  clearTimeout(switchTimer);

  if (!animate) {
    render(box);
    return;
  }

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