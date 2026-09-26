const TELEGRAM_BOT_USERNAME = 'aha_helper_bot'; // без @

let isAuthenticated = false;
let sessionPollTimer = null;
let loginPollTimer = null;
let loginPollAttempts = 0;

/* ---------- Вход через бота ---------- */

async function startBotLogin() {
  try {
    const response = await fetch('/api/create-login-token', { method: 'POST' });
    const { token } = await response.json();

    // Открываем диалог с ботом в самом Telegram — там пользователь
    // просто жмёт "Start", никакого ввода номера телефона
    window.open(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`, '_blank');

    loginPollAttempts = 0;
    if (loginPollTimer) clearInterval(loginPollTimer);
    loginPollTimer = setInterval(() => checkLoginToken(token), 2000);
  } catch (err) {
    console.error('Не удалось начать вход:', err);
    alert('Не удалось начать вход. Попробуйте ещё раз.');
  }
}

async function checkLoginToken(token) {
  loginPollAttempts += 1;

  // Останавливаемся примерно через 2 минуты ожидания
  if (loginPollAttempts > 60) {
    clearInterval(loginPollTimer);
    loginPollTimer = null;
    return;
  }

  try {
    const response = await fetch(`/api/check-login-token?token=${token}`);
    const result = await response.json();

    if (result.status === 'confirmed') {
      clearInterval(loginPollTimer);
      loginPollTimer = null;

      // Профильные данные храним ТОЛЬКО локально — сервер хранит
      // только id/баланс/бан
      localStorage.setItem(
        'telegram_profile',
        JSON.stringify({
          first_name: result.profile.first_name || '',
          last_name: result.profile.last_name || '',
          username: result.profile.username || '',
          photo_url: result.profile.photo_url || './media/profile.svg',
          id: result.profile.id,
        })
      );

      closeModal(document.getElementById('reg'));
      await refreshSession();
    } else if (result.status === 'blocked') {
      clearInterval(loginPollTimer);
      loginPollTimer = null;
      showBanScreen();
    }
    // 'pending' и 'not_found' — просто продолжаем ждать
  } catch (err) {
    console.error('Ошибка проверки входа:', err);
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
      }
    });
  }

  if (entranceBtn) {
    entranceBtn.addEventListener('click', startBotLogin);
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
      stopSessionPolling();
      openModal(regModal);
    });
  }

  // Закрытие окна профиля кликом ЗА его пределами — слушаем клики на
  // всём документе, чтобы не зависеть от того, как именно раскинута
  // вёрстка модалки в CSS
  document.addEventListener('click', (e) => {
    if (!profileModal || profileModal.style.display !== 'flex') return;

    const box = profileModal.querySelector('.profile_box');
    const isClickInsideBox = box && box.contains(e.target);
    const isClickOnTrigger = profTrigger && profTrigger.contains(e.target);

    if (!isClickInsideBox && !isClickOnTrigger) {
      closeModal(profileModal);
    }
  });
}

/* ---------- Отрисовка профиля ---------- */

function renderProfileFromLocalStorage() {
  const raw = localStorage.getItem('telegram_profile');
  if (!raw) return;
  const profile = JSON.parse(raw);

  const nameEl = document.getElementById('name');
  const usernameEl = document.getElementById('username');
  const avaEl = document.getElementById('ava');
  const profTrigger = document.getElementById('prof');

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
  if (profTrigger) {
    profTrigger.src = profile.photo_url;
  }
}

function updateBalanceDisplay(balance) {
  const value = String(balance ?? 0);
  const profileBalanceEl = document.getElementById('balanc');
  const cardBalanceEl = document.getElementById('balancCard');
  if (profileBalanceEl) profileBalanceEl.textContent = value;
  if (cardBalanceEl) cardBalanceEl.textContent = value;
}

function renderBalanceAndId(user) {
  const uidEl = document.getElementById('uid');
  if (uidEl) uidEl.textContent = `Id - ${user.id}`;
  updateBalanceDisplay(user.balance);
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

      startSessionPolling();
    } else {
      isAuthenticated = false;
      hideBanScreen();
      stopSessionPolling();
      openModal(document.getElementById('reg'));
    }
  } catch (err) {
    console.error('Не удалось проверить сессию:', err);
  }
}

// Опрашиваем сессию каждые 20 секунд — этого достаточно, чтобы бан
// сработал почти сразу, без необходимости в realtime-инфраструктуре
function startSessionPolling() {
  if (sessionPollTimer) return;
  sessionPollTimer = setInterval(refreshSession, 20000);
}

function stopSessionPolling() {
  if (sessionPollTimer) {
    clearInterval(sessionPollTimer);
    sessionPollTimer = null;
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

/* ---------- Плавное открытие/закрытие модалок (opacity) ---------- */

function openModalFade(el) {
  if (!el) return;
  el.style.display = 'flex';
  requestAnimationFrame(() => {
    el.classList.add('active');
  });
}

function closeModalFade(el) {
  if (!el) return;
  el.classList.remove('active');
  el.addEventListener('transitionend', () => {
    el.style.display = 'none';
  }, { once: true });
}

/* ---------- Виртуальный банк ---------- */

function renderOperationsList(operations) {
  const container = document.getElementById('operations');
  if (!container) return;

  container.innerHTML = '';

  if (!operations || operations.length === 0) {
    container.innerHTML = '<p style="color:#888; text-align:center; padding:10px;">Операций пока нет</p>';
    return;
  }

  operations.forEach(op => {
    const row = document.createElement('div');
    row.className = 'operation-row';

    const isIncome = op.amount > 0;
    const sign = isIncome ? '+' : '-';
    const amountAbs = Math.abs(op.amount);
    const direction = isIncome ? 'от' : 'на';
    const messagePart = op.message ? ` "${op.message}"` : '';

    row.textContent = `${sign}${amountAbs}c ${direction} "${op.counterparty_name}"${messagePart}`;
    row.style.color = isIncome ? '#75ab31' : '#ff6b6b';

    container.appendChild(row);
  });
}

async function loadOperations() {
  try {
    const response = await fetch('/api/get-operations');
    if (!response.ok) return;
    const result = await response.json();
    renderOperationsList(result.operations);
  } catch (err) {
    console.error('Не удалось загрузить операции:', err);
  }
}

function setupBankCard() {
  const cardTrigger = document.getElementById('btncard');
  const balanceModal = document.getElementById('balance');
  const transactionModal = document.getElementById('transaction');
  const openTransactionBtn = document.getElementById('opentransaction');
  const cancelTransactionBtn = document.getElementById('cancelTransaction');
  const pushBtn = document.getElementById('push');
  const sumInput = document.getElementById('sum');
  const id1Input = document.getElementById('id1');
  const id2Input = document.getElementById('id2');
  const textInput = document.getElementById('textt');

  if (cardTrigger) {
    cardTrigger.addEventListener('click', () => {
      openModalFade(balanceModal);
      if (isAuthenticated) {
        loadOperations();
      } else {
        renderOperationsList([]);
      }
    });
  }

  if (balanceModal) {
    document.addEventListener('click', (e) => {
      if (balanceModal.style.display !== 'flex') return;
      const box = balanceModal.querySelector('.mycard_box');
      const isInsideBox = box && box.contains(e.target);
      const isOnTrigger = cardTrigger && cardTrigger.contains(e.target);
      if (!isInsideBox && !isOnTrigger) {
        closeModalFade(balanceModal);
      }
    });
  }

  if (openTransactionBtn) {
    openTransactionBtn.addEventListener('click', () => {
      if (!isAuthenticated) {
        alert('Нужно войти в аккаунт, чтобы создавать транзакции');
        return;
      }

      const profile = JSON.parse(localStorage.getItem('telegram_profile') || 'null');
      if (id1Input && profile) {
        id1Input.value = profile.id;
        id1Input.readOnly = true;
      }
      if (id2Input) id2Input.value = '';
      if (sumInput) sumInput.value = '';
      if (textInput) textInput.value = '';

      openModalFade(transactionModal);
    });
  }

  if (cancelTransactionBtn) {
    cancelTransactionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModalFade(transactionModal);
    });
  }

  if (transactionModal) {
    document.addEventListener('click', (e) => {
      if (transactionModal.style.display !== 'flex') return;
      const box = transactionModal.querySelector('.transaction_box');
      const isInsideBox = box && box.contains(e.target);
      const isOnTrigger = openTransactionBtn && openTransactionBtn.contains(e.target);
      if (!isInsideBox && !isOnTrigger) {
        closeModalFade(transactionModal);
      }
    });
  }

  if (pushBtn) {
    pushBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const recipientId = id2Input ? id2Input.value.trim() : '';
      const amount = sumInput ? sumInput.value.trim() : '';
      const message = textInput ? textInput.value.trim() : '';

      if (!recipientId || !amount) {
        alert('Заполните сумму и айди получателя');
        return;
      }

      try {
        const response = await fetch('/api/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId, amount, message }),
        });
        const result = await response.json();

        if (!response.ok) {
          alert(result.error || 'Не удалось выполнить перевод');
          return;
        }

        updateBalanceDisplay(result.balance);

        closeModalFade(transactionModal);
        loadOperations();
      } catch (err) {
        console.error('Ошибка транзакции:', err);
        alert('Не удалось выполнить перевод');
      }
    });
  }
}

/* ---------- Точка входа ---------- */

document.addEventListener('DOMContentLoaded', () => {
  setupModalBehaviour();
  setupBankCard();
  ensureBanScreenExists();
  refreshSession();
});







document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('openbar');
  const closeBtn = document.getElementById('btnclosebar');
  const bar = document.getElementById('btnbar');

  if (openBtn && bar) {
    openBtn.addEventListener('click', () => {
      bar.classList.add('open');
    });
  }

  if (closeBtn && bar) {
    closeBtn.addEventListener('click', () => {
      bar.classList.remove('open');
    });
  }
});