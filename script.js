const redText = document.getElementById('redtext');
let progress = 0;
let direction = 1; // 1 — темнеет, -1 — светлеет
const speed = 0.008; // Скорость перелива

function animateColor() {
  progress += speed * direction;

  if (progress >= 1) {
    progress = 1;
    direction = -1;
  } else if (progress <= 0) {
    progress = 0;
    direction = 1;
  }

  // Интерполяция от 255 до 100
  const currentRed = Math.round(255 - progress * (255 - 100));
  redText.style.color = `rgb(${currentRed}, 0, 0)`;

  requestAnimationFrame(animateColor);
}

animateColor();


// 1. Входной звук с правильным расширением .mpeg
const soundWhod = new Audio('sound/whod.mpeg');
soundWhod.preload = 'auto';
soundWhod.load();

// 2. Предзагрузка массива звуков для клика
const bupSounds = [
  new Audio('sound/bup1.mp3'),
  new Audio('sound/bup2.mp3'),
  new Audio('sound/bup3.mp3')
];

bupSounds.forEach(sound => {
  sound.preload = 'auto';
  sound.load();
});

let currentBupIndex = 0;

// 3. Функция чередования звуков
function playNextBup() {
  const currentSound = bupSounds[currentBupIndex];
  
  currentSound.currentTime = 0; // Сброс для мгновенного повторного воспроизведения
  currentSound.play().catch(err => console.log('Ошибка воспроизведения:', err));

  // Переход к следующему звуку (по кругу: 0 -> 1 -> 2 -> 0)
  currentBupIndex = (currentBupIndex + 1) % bupSounds.length;
}

// 4. Воспроизведение входного звука при первом клике
let hasPlayedEntrance = false;

function playEntranceSound() {
  if (!hasPlayedEntrance) {
    soundWhod.play().catch(err => console.log('Autoplay blocked:', err));
    hasPlayedEntrance = true;
    document.removeEventListener('click', playEntranceSound);
  }
}

document.addEventListener('click', playEntranceSound);

// 5. Навешивание чередующегося звука на кнопки
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.btnbox .btn-card');
  
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      playNextBup();
    });
  });
});

window.addEventListener('load', () => {
  soundWhod.play().catch(() => {
    // Если браузер заблокировал, сыграет при первом клике
    document.addEventListener('click', playEntranceSound);
  });
});