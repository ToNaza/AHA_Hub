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


const soundWhod = new Audio('sound/whod.mp3');
soundWhod.preload = 'auto';
soundWhod.load();

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

function playNextBup() {
  const currentSound = bupSounds[currentBupIndex];
  
  currentSound.currentTime = 0;
  currentSound.play().catch(err => console.log('Ошибка воспроизведения:', err));

  currentBupIndex = (currentBupIndex + 1) % bupSounds.length;
}

let hasPlayedEntrance = false;

function playEntranceSound() {
  if (!hasPlayedEntrance) {
    soundWhod.play().catch(err => console.log('Autoplay blocked:', err));
    hasPlayedEntrance = true;
    document.removeEventListener('click', playEntranceSound);
  }
}

document.addEventListener('click', playEntranceSound);

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
    document.addEventListener('click', playEntranceSound);
  });
});