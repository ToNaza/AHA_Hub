/* ============================================================
   1. АНИМАЦИЯ НАДПИСИ "Unnoficial" (пульсация красного)
   ============================================================ */

(function initRedTextAnimation() {
  const redText = document.getElementById('redtext');
  if (!redText) return;

  let progress = 0;
  let direction = 1;
  const speed = 0.008;

  function animateColor() {
    progress += speed * direction;

    if (progress >= 1) {
      progress = 1;
      direction = -1;
    } else if (progress <= 0) {
      progress = 0;
      direction = 1;
    }

    const currentRed = Math.round(255 - progress * (255 - 100));
    redText.style.color = `rgb(${currentRed}, 0, 0)`;

    requestAnimationFrame(animateColor);
  }

  animateColor();
})();


/* ============================================================
   2. ЗВУК: настройка громкости/переключатель, вход, фон
   ============================================================ */

const SOUND_MUTED_KEY = 'sound_muted';   // localStorage — постоянное предпочтение пользователя
const BGM_TIME_KEY = 'bgm_time';         // sessionStorage — сбрасывается с закрытием вкладки

const ENTRANCE_VOLUME = 0.5; // громкость звука входа, 0.0–1.0
const BG_VOLUME = 0.25;      // громкость фоновой музыки, 0.0–1.0

const entranceAudio = document.getElementById('entranceAudio');
const bgAudio = document.getElementById('bgAudio');

if (entranceAudio) entranceAudio.volume = ENTRANCE_VOLUME;

function isSoundMuted() {
  return localStorage.getItem(SOUND_MUTED_KEY) === 'true';
}

function setSoundMuted(muted) {
  localStorage.setItem(SOUND_MUTED_KEY, muted ? 'true' : 'false');
}

function applyMuteState() {
  const muted = isSoundMuted();
  if (bgAudio) bgAudio.muted = muted;
  if (entranceAudio) entranceAudio.muted = muted;
}

// Переключатель звука в шапке (#soundToggle), базово ВКЛЮЧЁН
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

// Запускает/продолжает фоновую музыку с сохранённой секунды (если есть)
function startBackgroundMusic() {
  if (!bgAudio) return;

  const savedTime = parseFloat(sessionStorage.getItem(BGM_TIME_KEY));
  if (!isNaN(savedTime)) {
    bgAudio.currentTime = savedTime;
  }

  bgAudio.volume = BG_VOLUME;
  applyMuteState();
  bgAudio.play().catch(err => console.log('Фоновая музыка заблокирована:', err));
}

// Вызывается перед КАЖДЫМ переходом на другую страницу сайта
function saveBackgroundMusicTime() {
  if (!bgAudio) return;
  sessionStorage.setItem(BGM_TIME_KEY, String(bgAudio.currentTime));
}

// Если пользователь только что зашёл на сайт (не переход между страницами
// в этой же вкладке) — играем джингл входа, затем фон. Иначе сразу
// продолжаем фон с сохранённой секунды.
function playEntranceThenBackground() {
  const isReturningNavigation = sessionStorage.getItem(BGM_TIME_KEY) !== null;

  if (isReturningNavigation || !entranceAudio || !bgAudio) {
    startBackgroundMusic();
    return;
  }

  // Оба видео запускаются СИНХРОННО в момент загрузки страницы — это
  // единственный момент, когда браузер может разрешить автовоспроизведение
  // со звуком. Фон при этом стартует без звука и молча играет параллельно
  // с джинглом; когда джингл заканчивается — громкость фона поднимается
  // (это уже не требует нового разрешения на автовоспроизведение).
  bgAudio.volume = 0;
  bgAudio.muted = false;

  Promise.all([entranceAudio.play(), bgAudio.play()])
    .then(() => {
      entranceAudio.addEventListener('ended', () => {
        applyMuteState();
        bgAudio.volume = BG_VOLUME;
      }, { once: true });
    })
    .catch(() => {
      // Автовоспроизведение заблокировано браузером — честный fallback:
      // ждём первое взаимодействие пользователя с страницей
      const events = ['click', 'pointerdown', 'keydown', 'touchstart', 'scroll'];
      const handler = () => {
        bgAudio.pause();
        bgAudio.currentTime = 0;
        startBackgroundMusic();
        events.forEach(ev => document.removeEventListener(ev, handler));
      };
      events.forEach(ev => document.addEventListener(ev, handler, { once: true }));
    });
}


/* ============================================================
   3. ЗВУК КЛИКА — играет по очереди на любой кнопке сайта
   ============================================================ */

const bupSounds = [
  new Audio('sound/bup1.mp3'),
  new Audio('sound/bup2.mp3'),
  new Audio('sound/bup3.mp3'),
];

bupSounds.forEach(sound => {
  sound.preload = 'auto';
  sound.volume = 1;
  sound.load();
});

let currentBupIndex = 0;

function playNextBup() {
  const currentSound = bupSounds[currentBupIndex];
  currentSound.currentTime = 0;
  currentSound.play().catch(err => console.log('Ошибка воспроизведения:', err));
  currentBupIndex = (currentBupIndex + 1) % bupSounds.length;
}

function setupClickSounds() {
  // Любая кнопка и любая карточка-ссылка на сайте
  const clickable = document.querySelectorAll('button, .btn-card');
  clickable.forEach(el => {
    el.addEventListener('click', playNextBup);
  });
}


/* ============================================================
   4. ПЕРЕХОДЫ МЕЖДУ СТРАНИЦАМИ С ЗАТЕМНЕНИЕМ + КНОПКА "НАЗАД"
   ============================================================ */

function navigateWithFade(href) {
  saveBackgroundMusicTime();

  const boxShadow = document.getElementById('box_shadow');
  if (!boxShadow) {
    window.location.href = href;
    return;
  }

  boxShadow.classList.add('active');
  boxShadow.addEventListener('transitionend', () => {
    window.location.href = href;
  }, { once: true });
}

function setupPageTransitions() {
  const cards = document.querySelectorAll('.btnbox .btn-card');

  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      const href = card.getAttribute('href');
      if (!href || href === '#') return;

      // Ctrl/Cmd/Shift+клик или средняя кнопка мыши — открыть в новой
      // вкладке как обычно, не перехватываем переход
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;

      e.preventDefault();
      navigateWithFade(href);
    });
  });

  const backBtn = document.getElementById('back');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      const href = backBtn.getAttribute('href') || backBtn.dataset.href;
      if (!href) return;

      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;

      e.preventDefault();
      navigateWithFade(href);
    });
  }
}

// Кнопка "Назад" браузера может восстановить страницу из bfcache со
// старым классом .active на #box_shadow — сбрасываем при каждом показе
function setupBfcacheFix() {
  window.addEventListener('pageshow', () => {
    const boxShadow = document.getElementById('box_shadow');
    if (boxShadow) boxShadow.classList.remove('active');
  });
}


/* ============================================================
   ТОЧКА ВХОДА
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  setupClickSounds();
  setupPageTransitions();
  setupBfcacheFix();
});

window.addEventListener('load', () => {
  setupSoundToggle();
  playEntranceThenBackground();
});