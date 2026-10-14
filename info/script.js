/* ==================== Анимация красного текста "Unnoficial" ==================== */

const redText = document.getElementById('redtext');
let progress = 0;
let direction = 1;
const ANIMATION_SPEED = 0.008;

function animateColor() {
  progress += ANIMATION_SPEED * direction;

  if (progress >= 1) {
    progress = 1;
    direction = -1;
  } else if (progress <= 0) {
    progress = 0;
    direction = 1;
  }

  const currentRed = Math.round(255 - progress * (255 - 100));
  if (redText) {
    redText.style.color = `rgb(${currentRed}, 0, 0)`;
  }

  requestAnimationFrame(animateColor);
}

animateColor();

/* ==================== Настройки звука ==================== */

const SOUND_MUTED_KEY = 'sound_muted';
const BGM_TIME_KEY = 'bgm_time';
const INTRO_SEEN_KEY = 'hide_intro_modal';

const ENTRANCE_VOLUME = 0.5; // громкость звука входа, 0.0–1.0
const BG_VOLUME = 0.25;      // громкость фоновой музыки, 0.0–1.0
const CLICK_VOLUME = 1;      // громкость звука клика, 0.0–1.0

const entranceAudio = new Audio('../sound/whod.mp3');
const bgAudio = new Audio('/sound/fon_sound.mp3');
bgAudio.loop = true;

const clickSounds = [
  new Audio('/sound/bup1.mp3'),
  new Audio('/sound/bup2.mp3'),
  new Audio('/sound/bup3.mp3'),
];

clickSounds.forEach(sound => {
  sound.preload = 'auto';
  sound.volume = CLICK_VOLUME;
  sound.load();
});

entranceAudio.volume = ENTRANCE_VOLUME;
bgAudio.volume = BG_VOLUME;
entranceAudio.preload = 'auto';
bgAudio.preload = 'auto';

function isSoundMuted() {
  return localStorage.getItem(SOUND_MUTED_KEY) === 'true';
}

function setSoundMuted(muted) {
  localStorage.setItem(SOUND_MUTED_KEY, muted ? 'true' : 'false');
}

function applyMuteState() {
  const muted = isSoundMuted();
  bgAudio.muted = muted;
  entranceAudio.muted = muted;
}

/* ---------- Переключатель звука (базово включён) ---------- */

function setupSoundToggle() {
  const toggle = document.getElementById('soundToggle');
  if (!toggle) return;

  if (!isSoundMuted()) {
    toggle.classList.add('active');
  }

  toggle.addEventListener('click', () => {
    const nowMuted = !isSoundMuted();
    setSoundMuted(nowMuted);
    applyMuteState();
    toggle.classList.toggle('active', !nowMuted);
  });
}

/* ---------- Звук клика по кнопкам (3 варианта по кругу, случайный старт) ---------- */

let clickSoundIndex = Math.floor(Math.random() * clickSounds.length);

function playClickSound() {
  const sound = clickSounds[clickSoundIndex];
  sound.currentTime = 0;
  sound.play().catch(err => console.log('Звук клика заблокирован:', err));
  clickSoundIndex = (clickSoundIndex + 1) % clickSounds.length;
}

function setupClickSounds() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .btn-card');
    if (target) playClickSound();
  });
}

/* ---------- Звук входа + фоновая музыка ---------- */

function startBackgroundMusic() {
  const savedTime = parseFloat(sessionStorage.getItem(BGM_TIME_KEY));
  if (!isNaN(savedTime)) {
    bgAudio.currentTime = savedTime;
  }

  applyMuteState();
  bgAudio.play().catch(err => console.log('Фоновая музыка заблокирована:', err));
}

// Вызывается перед каждым переходом на другую страницу сайта
function saveBackgroundMusicTime() {
  sessionStorage.setItem(BGM_TIME_KEY, String(bgAudio.currentTime));
}

function waitForFirstInteractionThen(callback) {
  const events = ['click', 'pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
  const handler = () => {
    events.forEach(ev => document.removeEventListener(ev, handler));
    callback();
  };
  events.forEach(ev => document.addEventListener(ev, handler, { once: true }));
}

// Проигрывает джингл входа, затем фон. Используется и по клику "Закрыть"
// в модалке (гарантированно сработает — это настоящий пользовательский
// клик), и как попытка "вслепую" для тех, кто уже согласился раньше.
function playEntranceSequence() {
  applyMuteState();

  entranceAudio.play().then(() => {
    entranceAudio.addEventListener('ended', startBackgroundMusic, { once: true });
  }).catch(() => {
    waitForFirstInteractionThen(() => {
      entranceAudio.play().then(() => {
        entranceAudio.addEventListener('ended', startBackgroundMusic, { once: true });
      }).catch(() => startBackgroundMusic());
    });
  });
}

/* ---------- Стартовая информационная модалка ---------- */

function setupIntroModal() {
  const modal = document.getElementById('introModal');
  const closeBtn = document.getElementById('introCloseBtn');
  const dontShowCheckbox = document.getElementById('introDontShow');

  if (!modal || !closeBtn) {
    // Модалки нет на этой странице — просто пробуем запустить звук как есть
    playEntranceSequence();
    return;
  }

  modal.style.display = 'flex';

  closeBtn.addEventListener('click', () => {
    if (dontShowCheckbox && dontShowCheckbox.checked) {
      localStorage.setItem(INTRO_SEEN_KEY, 'true');
    }
    modal.style.display = 'none';
    playEntranceSequence(); // настоящий клик — звук точно проиграется
  });
}

function initEntranceAndBackground() {
  // Если позиция фоновой музыки уже сохранена в sessionStorage — это переход
  // между страницами сайта в текущей вкладке, а не новый заход. Модалку
  // и джингл входа не показываем, просто продолжаем фон.
  const isReturningNavigation = sessionStorage.getItem(BGM_TIME_KEY) !== null;
  if (isReturningNavigation) {
    startBackgroundMusic();
    return;
  }

  const hasAgreedBefore = localStorage.getItem(INTRO_SEEN_KEY) === 'true';
  if (hasAgreedBefore) {
    // Согласие уже было раньше — пробуем запустить сразу, без модалки
    playEntranceSequence();
    return;
  }

  setupIntroModal();
}

/* ==================== Переходы между страницами с затемнением ==================== */

function setupPageTransitions() {
  const boxShadow = document.getElementById('box_shadow');

  function navigateWithFade(href) {
    saveBackgroundMusicTime();

    if (!boxShadow) {
      window.location.href = href;
      return;
    }

    boxShadow.classList.add('active');
    boxShadow.addEventListener('transitionend', () => {
      window.location.href = href;
    }, { once: true });
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.btn-card');
    if (card) {
      const href = card.getAttribute('href');
      if (!href || href === '#') return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;

      e.preventDefault();
      navigateWithFade(href);
      return;
    }

    const backBtn = e.target.closest('#back');
    if (backBtn) {
      const href = backBtn.getAttribute('href') || backBtn.dataset.href;
      if (!href) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;

      e.preventDefault();
      navigateWithFade(href);
    }
  });
}

// Восстановление из bfcache кнопкой "Назад" браузера может вернуть DOM
// с классом .active на #box_shadow — сбрасываем на каждый показ страницы
window.addEventListener('pageshow', () => {
  const boxShadow = document.getElementById('box_shadow');
  if (boxShadow) boxShadow.classList.remove('active');
});

/* ==================== Точка входа ==================== */

window.addEventListener('load', () => {
  setupSoundToggle();
  setupClickSounds();
  setupPageTransitions();
  initEntranceAndBackground();
});





function toggleCard(button) {
  const card = button.closest('.rules-card');
  const isExpanded = card.classList.toggle('expanded');

  if (isExpanded) {
    button.textContent = 'Свернуть';
    button.classList.remove('blue');
    button.classList.add('orange');
  } else {
    button.textContent = 'Развернуть';
    button.classList.remove('orange');
    button.classList.add('blue');
  }
}