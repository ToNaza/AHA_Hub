const TELEGRAM_BOT_USERNAME = 'aha_helper_bot'; // без @

let isAuthenticated = false;
let pollTimer = null;

/* ---------- Встраивание официального Telegram Login Widget ---------- */
/* Виджет рендерится в #tg-widget-container с opacity: 0 и накладывается
   поверх кастомной кнопки #entrance через CSS (см. index.html). Клик
   визуально идёт по кастомной кнопке, а физически — по настоящему
   виджету Telegram, что гарантированно работает (в отличие от
   программного вызова Telegram.Login.auth()). */

function initTelegramWidget() {
  const container = document.getElementById('tg-widget-container');
  if (!container || container.dataset.initialized) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.setAttribute('data-telegram-login', TELEGRAM_BOT_USERNAME);
  script.setAttribute('data-size', 'large');
  script.setAttribute('data-request-access', 'write');
  script.setAttribute('data-onauth', 'onTelegramAuth(user)');

  container.appendChild(script);
  container.dataset.initialized = 'true';
}

// Telegram вызывает эту функцию по имени из iframe — должна быть глобальной
window.onTelegramAuth = function (user) {
  handleTelegramResponse(user);
};

async function handleTelegramResponse(telegramData) {
  try {
    const response = await fetch('/api/telegram-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramData),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Ошибка авторизации');
    }

    // Профильные данные (имя, юзернейм, фото) храним ТОЛЬКО локально —
    // сервер их не хранит, только id/баланс/бан
    localStorage.setItem(
      'telegram_profile',
      JSON.stringify({
        first_name: telegramData.first_name || '',
        last_name: telegramData.last_name || '',
        username: telegramData.username || '',
        photo_url: telegramData.photo_url || './media/profile.svg',
        id: telegramData.id,
      })
    );

    closeModal(document.getElementById('reg'));
    await refreshSession();
  } catch (err) {
    console.error('Ошибка авторизации:', err);
    if (err.message && err.message.includes('USER_BLOCKED')) {
      showBanScreen();
    } else {
      alert('Не удалось войти. Попробуйте ещё раз.');
    }
  }
}

/* ---------- Модальные окна: открытие/закрытие ---------- */

function openModal(el) {
  if (el) el.style.display = 'flex';
}

function closeModal(el) {
  if (el) el.style.display = 'none';
}

function setupModalBehaviour() {
  const regModal = document.getElementById('reg');
  const profileModal = document.getElementById('profile');
  const profTrigger = document.getElementById('prof');
  const entranceBtn = document.getElementById('entrance');
  const skipBtn = document.getElementById('skip');
  const exitBtn = document.getElementById('exit');

  if (profTrigger) {
    profTrigger.addEventListener('click', () => {
      if (isAuthenticated) {
        openModal(profileModal);
      } else {
        openModal(regModal);
        // Инициализируем виджет именно сейчас, когда модалка уже видима —
        // иначе iframe не подгрузится внутри display:none контейнера
        initTelegramWidget();
      }
    });
  }

  if (entranceBtn) {
    // Клик теперь физически ловит невидимый Telegram-виджет поверх кнопки,
    // отдельный обработчик здесь не нужен
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', () => closeModal(regModal));
  }

  if (exitBtn) {
    exitBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      localStorage.removeItem('telegram_profile');
      isAuthenticated = false;
      closeModal(profileModal);
      stopPolling();
    });
  }

  // Закрытие окна профиля только кликом ЗА его пределами
  if (profileModal) {
    profileModal.addEventListener('click', (e) => {
      const box = profileModal.querySelector('.profile_box');
      if (box && !box.contains(e.target)) {
        closeModal(profileModal);
      }
    });
  }
}

/* ---------- Отрисовка профиля ---------- */

function renderProfileFromLocalStorage() {
  const raw = localStorage.getItem('telegram_profile');
  if (!raw) return;
  const profile = JSON.parse(raw);

  const nameEl = document.getElementById('name');
  const usernameEl = document.getElementById('username');
  const avaEl = document.getElementById('ava');

  if (nameEl) {
    nameEl.textContent =
      [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
      'Без имени';
  }
  if (usernameEl) {
    usernameEl.textContent = profile.username
      ? `Username - @${profile.username}`
      : 'Username - не указан';
  }
  if (avaEl) {
    avaEl.src = profile.photo_url;
  }
}

function renderBalanceAndId(user) {
  const uidEl = document.getElementById('uid');
  const balanceEl = document.getElementById('balanc');
  if (uidEl) uidEl.textContent = `Id - ${user.id}`;
  if (balanceEl) balanceEl.textContent = String(user.balance ?? 0);
}

/* ---------- Проверка сессии (авторизован? забанен?) ---------- */

async function refreshSession() {
  try {
    const response = await fetch('/api/session');
    const result = await response.json();

    if (result.authenticated) {
      isAuthenticated = true;
      renderProfileFromLocalStorage();
      renderBalanceAndId(result.user);

      if (result.user.blocked) {
        showBanScreen();
      } else {
        hideBanScreen();
      }

      startPolling();
    } else {
      isAuthenticated = false;
      hideBanScreen();
      stopPolling();
    }
  } catch (err) {
    console.error('Не удалось проверить сессию:', err);
  }
}

// Опрашиваем сессию каждые 20 секунд — этого достаточно, чтобы бан
// сработал почти сразу, без необходимости в realtime-инфраструктуре
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(refreshSession, 20000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* ---------- Экран бана ---------- */

function ensureBanScreenExists() {
  if (document.getElementById('ban-screen')) return;

  const overlay = document.createElement('div');
  overlay.id = 'ban-screen';
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.92);
    z-index: 999999;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-family: sans-serif;
    text-align: center;
    padding: 20px;
  `;
  overlay.innerHTML = `
    <div>
      <h2 style="color:#ff4d4d; margin-bottom: 10px;">Вы заблокированы</h2>
      <p>Взаимодействие с сайтом недоступно. Обратитесь к администрации.</p>
    </div>
  `;
  document.body.appendChild(overlay);
}

function showBanScreen() {
  ensureBanScreenExists();
  document.getElementById('ban-screen').style.display = 'flex';
}

function hideBanScreen() {
  const el = document.getElementById('ban-screen');
  if (el) el.style.display = 'none';
}

/* ---------- Точка входа ---------- */

document.addEventListener('DOMContentLoaded', () => {
  setupModalBehaviour();
  ensureBanScreenExists();
  refreshSession();
});