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

const soundWhod = new Audio('sound/whod.mpeg');
soundWhod.preload = 'auto';

soundWhod.volume = 0.4;

soundWhod.load();

// 2. Звуки клика
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


let hasPlayedEntrance = false;

function playEntranceSound() {
  if (!hasPlayedEntrance) {
    soundWhod.play().then(() => {
      hasPlayedEntrance = true;
    }).catch(err => console.log('Autoplay blocked:', err));
  }
}

window.addEventListener('load', () => {
  soundWhod.play().then(() => {
    hasPlayedEntrance = true;
  }).catch(() => {
    const events = ['click', 'pointerdown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => {
      playEntranceSound();
      events.forEach(e => document.removeEventListener(e, handler));
    };
    events.forEach(e => document.addEventListener(e, handler, { once: true }));
  });
});