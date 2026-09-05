const redText = document.getElementById('redtext');
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
  if (redText) {
    redText.style.color = `rgb(${currentRed}, 0, 0)`;
  }

  requestAnimationFrame(animateColor);
}

animateColor();

// Звуки клика по карточкам — не связаны со звуком входа/фона, оставляем как было
const bupSounds = [
  new Audio('sound/bup1.mp3'),
  new Audio('sound/bup2.mp3'),
  new Audio('sound/bup3.mp3')
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

/* ==================== ЗВУК: переключатель, вход, фон ==================== */

const SOUND_MUTED_KEY = 'sound_muted';
const BGM_TIME_KEY = 'bgm_time';

const entranceAudio = document.getElementById('entranceAudio');
const bgAudio = document.getElementById('bgAudio');

const ENTRANCE_VOLUME = 0.5; // громкость звука входа, 0.0–1.0
const BG_VOLUME = 0.25; // громкость фоновой музыки, 0.0–1.0

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

function setupSoundToggle() {
  const toggle = document.getElementById('soundToggle');
  if (!toggle) return;

  // По умолчанию (нет записи в localStorage) звук ВКЛЮЧЁН
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

// Вызывать перед КАЖДЫМ переходом на другую страницу сайта
function saveBackgroundMusicTime() {
  if (!bgAudio) return;
  sessionStorage.setItem(BGM_TIME_KEY, String(bgAudio.currentTime));
}

function playEntranceThenBackground() {
  // Если позиция фоновой музыки уже сохранена в sessionStorage — это переход
  // между страницами САЙТА В ТЕКУЩЕЙ ВКЛАДКЕ, а не новый заход на сайт.
  // sessionStorage сам очищается при закрытии вкладки/браузера, поэтому
  // при каждом новом заходе (новая вкладка, перезапуск браузера) джингл
  // входа снова сыграет.
  const isReturningNavigation = sessionStorage.getItem(BGM_TIME_KEY) !== null;
  if (isReturningNavigation) {
    startBackgroundMusic();
    return;
  }

  if (!entranceAudio || !bgAudio) {
    startBackgroundMusic();
    return;
  }

  // Ключевой момент: оба видео запускаются СИНХРОННО прямо на загрузке
  // страницы — это единственный момент, когда браузер разрешает автовоспроизведение
  // видео со звуком. Фон при этом стартует БЕЗ звука (volume 0) и молча
  // играет параллельно с джинглом входа. Когда джингл заканчивается — просто
  // поднимаем громкость уже играющего фона, для этого повторное разрешение
  // на автовоспроизведение не нужно.
  bgAudio.volume = 0;
  bgAudio.muted = false;

  const entrancePlay = entranceAudio.play();
  const bgPlay = bgAudio.play();

  Promise.all([entrancePlay, bgPlay]).then(() => {
    entranceAudio.addEventListener('ended', () => {
      applyMuteState();
      bgAudio.volume = BG_VOLUME;
    }, { once: true });
  }).catch(() => {
    // Если даже этот трюк не сработал — ждём первое взаимодействие пользователя
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

window.addEventListener('load', () => {
  setupSoundToggle();
  playEntranceThenBackground();
});

/* ==================== Переходы между страницами с затемнением ==================== */

document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.btnbox .btn-card');
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

  buttons.forEach(button => {
    button.addEventListener('click', (e) => {
      playNextBup();

      const href = button.getAttribute('href');
      if (!href || href === '#') return;

      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
        return;
      }

      e.preventDefault();
      navigateWithFade(href);
    });
  });

  // Кнопка "назад" на других страницах сайта (id="back") — та же логика
  const backBtn = document.getElementById('back');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      const href = backBtn.getAttribute('href') || backBtn.dataset.href;
      if (!href) return;

      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
        return;
      }

      e.preventDefault();
      navigateWithFade(href);
    });
  }
});