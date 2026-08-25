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

// ==========================================
// НАСТРОЙКА ЗВУКОВ И ГРОМКОСТИ
// ==========================================

// 1. Входной звук (исправлено расширение на .mpeg)
const soundWhod = new Audio('sound/whod.mpeg');
soundWhod.preload = 'auto';

// ---> ВОТ ЗДЕСЬ НАСТРАИВАЕТСЯ ГРОМКОСТЬ ДЛЯ ВХОДНОГО ЗВУКА (0.5 = 50%) <---
soundWhod.volume = 0.25;

soundWhod.load();

// 2. Звуки клика
const bupSounds = [
  new Audio('sound/bup1.mp3'),
  new Audio('sound/bup2.mp3'),
  new Audio('sound/bup3.mp3')
];

bupSounds.forEach(sound => {
  sound.preload = 'auto';
  
  // ---> ВОТ ЗДЕСЬ НАСТРАИВАЕТСЯ ГРОМКОСТЬ ДЛЯ ЗВУКОВ КЛИКА (0.5 = 50%) <---
  sound.volume = 0.5;
  
  sound.load();
});

let currentBupIndex = 0;

function playNextBup() {
  const currentSound = bupSounds[currentBupIndex];
  
  currentSound.currentTime = 0;
  currentSound.play().catch(err => console.log('Ошибка воспроизведения:', err));

  currentBupIndex = (currentBupIndex + 1) % bupSounds.length;
}

// 3. Логика воспроизведения при входе
let hasPlayedEntrance = false;

function playEntranceSound() {
  if (!hasPlayedEntrance) {
    soundWhod.play().catch(err => console.log('Autoplay blocked:', err));
    hasPlayedEntrance = true;
    document.removeEventListener('click', playEntranceSound);
  }
}

// Попытка автозапуска при загрузке страницы
window.addEventListener('load', () => {
  soundWhod.play().then(() => {
    hasPlayedEntrance = true;
  }).catch(() => {
    // Если браузер заблокировал автоплей, ждем первого клика
    document.addEventListener('click', playEntranceSound);
  });
});

// 4. Привязка звука клика к кнопкам
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.btnbox .btn-card');
  
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      playNextBup();
    });
  });
});