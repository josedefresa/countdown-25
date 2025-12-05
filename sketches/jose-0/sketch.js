import { createEngine } from "../_shared/engine.js";
import { createSpringSettings, Spring } from "../_shared/spring.js";

const { renderer, input, math, run, finish, audio } = createEngine();
const { ctx, canvas } = renderer;
// array of preloaded images
const imagePaths = [
  "./car_01.png",
  "./car_02.png",
  "./car_03.png",
  "./car_04.png",
  "./car_05.png",
  "./car_06.png",
  "./car_07.png",
  "./car_08.png",
];

const images = [];

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function preloadImages() {
  for (const path of imagePaths) {
    const img = await loadImage(path);
    images.push(img);
  }
}

preloadImages().then(() => {
  run(update);
});

// new drawing canvas
const drawingCanvas = document.createElement("canvas");
drawingCanvas.width = canvas.width;
drawingCanvas.height = canvas.height;
const drawingCtx = drawingCanvas.getContext("2d");

let angle = 0;
let rotationSpeed = 120; // degrees per second

const ellipseRadiusX = 400;
const ellipseRadiusY = 600;

let carX = 0;
let carY = 0;
let carVelocityX = 0;
let carVelocityY = 0;
let forceMultiplier = 5;
let damping = 2; // damping coefficient

let lastSector = 6; // par défaut vers le haut
const DIRECTION_SPEED_THRESHOLD = 20; // px/s : ajuster pour rendre la détection plus/moins sensible

const points = [];

const centerX = canvas.width / 2;
const centerY = canvas.height / 2;

//create points on ellipse
const pointCount = 80; //number of points
for (let i = 0; i < pointCount; i++) {
  const a = (i / pointCount) * Math.PI * 2;
  const x = Math.cos(a) * ellipseRadiusX;
  const y = Math.sin(a) * ellipseRadiusY;
  points.push({ x: centerX + x, y: centerY + y, isActive: false });
}

// mapping unique (0=right,1=down-right,2=down,3=down-left,4=left,5=up-left,6=up,7=up-right)
const SECTOR_TO_IMAGE_INDEX = [6, 5, 4, 3, 2, 1, 0, 7]; // ajuster si besoin

// --- auto-reset quand tous les points sont activés ---
let autoResetScheduled = false;
function allPointsActivated() {
  for (const p of points) {
    if (!p.isActive) return false;
  }
  return true;
}

function scheduleAutoReset() {
  // finish after a short delay for la mise en scène
  setTimeout(() => {
    finish();
  }, 3000);
  autoResetScheduled = true;
}

// --- Réglages audio (volumes) ---
const MASTER_VOLUME = 0.9; // volume global
const VOLUME_ACCEL = 0.8; // vroum_01 (accélération brutale)
const VOLUME_CRUISE = 0.6; // vroum_02 (avancer en général)
const VOLUME_DECEL = 0.7; // vroum_03 (décélération)

// seuil pour considérer "à l'arrêt" (px/s)
const STOP_SPEED_THRESHOLD = 8;
// durée du fade-out en secondes
const DECEL_FADE_DURATION = 0.6;

// --- Audio "vroum" ---
const vroumAccel = await audio.load("Audio/vroum_01.mp3");
const vroumCruise = await audio.load("Audio/vroum_02.mp3");
const vroumDecel = await audio.load("Audio/vroum_03.mp3");

// instance en cours pour la décélération (pour pouvoir la couper/fader)
let currentDecelInst = null;

// helpers
function playOnce(inst, { rate = 1, volume = 1 } = {}) {
  inst.play({ rate, volume: Math.max(0, Math.min(1, volume * MASTER_VOLUME)) });
}

function playDecel({ rate = 1 } = {}) {
  // si un ancien son décél est en cours, le laisser jouer (pas de stack infini)
  if (!currentDecelInst || currentDecelInst.isStopped) {
    currentDecelInst = vroumDecel.play({
      rate,
      volume: Math.max(0, Math.min(1, VOLUME_DECEL * MASTER_VOLUME)),
    });
  }
}

function fadeOutDecel(durationSec = DECEL_FADE_DURATION) {
  if (!currentDecelInst || currentDecelInst.isStopped) return;
  const inst = currentDecelInst;
  const startVol = inst.getVolume
    ? inst.getVolume()
    : VOLUME_DECEL * MASTER_VOLUME;
  const startTime = performance.now();
  const durationMs = Math.max(0.05, durationSec) * 1000;

  function step() {
    const t = performance.now() - startTime;
    const k = Math.min(1, t / durationMs);
    const newVol = startVol * (1 - k);
    if (inst.setVolume) inst.setVolume(newVol);
    if (k < 1) {
      requestAnimationFrame(step);
    } else {
      if (inst.stop) inst.stop(); // stop propre quand volume à 0
      currentDecelInst = null;
    }
  }
  requestAnimationFrame(step);
}

// --- update ---
function update(dt) {
  angle += dt * rotationSpeed;

  const x = input.getX();
  const y = input.getY();

  const forceToTargetX = (x - carX) * forceMultiplier;
  const forceToTargetY = (y - carY) * forceMultiplier;
  carVelocityX += forceToTargetX * dt;
  carVelocityY += forceToTargetY * dt;
  carVelocityX *= Math.exp(-damping * dt);
  carVelocityY *= Math.exp(-damping * dt);

  carX += carVelocityX * dt;
  carY += carVelocityY * dt;

  // --- audio: détecter accélération / croisière / décélération ---
  const speed = Math.hypot(carVelocityX, carVelocityY);
  const speedDeltaPerSec = (speed - lastSpeed) / Math.max(dt, 1e-6);
  cruiseCooldownT = Math.max(0, cruiseCooldownT - dt);
  peakCooldownT = Math.max(0, peakCooldownT - dt);

  if (peakCooldownT <= 0 && speedDeltaPerSec >= ACCEL_SPIKE_THRESHOLD) {
    playOnce(vroumAccel, {
      rate: 1 + Math.random() * 0.1,
      volume: VOLUME_ACCEL,
    });
    peakCooldownT = PEAK_COOLDOWN;
  } else if (
    peakCooldownT <= 0 &&
    speedDeltaPerSec <= DECEL_THRESHOLD &&
    speed > MIN_CRUISE_SPEED * 0.5
  ) {
    // décélération
    playDecel({ rate: 0.9 + Math.random() * 0.1 });
    peakCooldownT = PEAK_COOLDOWN;
  } else if (cruiseCooldownT <= 0 && speed >= MIN_CRUISE_SPEED) {
    playOnce(vroumCruise, {
      rate: 0.95 + Math.random() * 0.1,
      volume: VOLUME_CRUISE,
    });
    cruiseCooldownT = CRUISE_COOLDOWN;
  }

  // si la voiture est quasi à l'arrêt, fader le son de décélération en cours
  if (speed <= STOP_SPEED_THRESHOLD) {
    fadeOutDecel(DECEL_FADE_DURATION);
  }

  lastSpeed = speed;

  // activate close points
  for (const p of points) {
    const dist = math.dist(p.x, p.y, carX, carY);
    const activationDist = 80;
    if (dist < activationDist) p.isActive = true;
  }

  if (!autoResetScheduled && allPointsActivated()) {
    scheduleAutoReset();
  }

  // --- direction pour l'image de la voiture (réutilise `speed`) ---
  let angleForSector;
  if (speed >= DIRECTION_SPEED_THRESHOLD) {
    angleForSector = Math.atan2(carVelocityY, carVelocityX);
  } else {
    angleForSector = Math.atan2(y - carY, x - carX);
  }

  const angleDeg = (angleForSector * 180) / Math.PI;
  const angleNorm = (angleDeg + 360) % 360;
  const sector = Math.round(angleNorm / 45) % 8;
  lastSector = sector;

  const selectedImage = images[SECTOR_TO_IMAGE_INDEX[sector] || 0];

  // --- dessin ---

  // draw to drawing canvas (conserve effet existant)
  drawingCtx.fillStyle = "white";

  drawingCtx.save();
  drawingCtx.translate(carX, carY);
  drawingCtx.rotate(Math.atan2(y - carY, x - carX)); // garder si tu veux l'effet déjà présent pour les ellipses
  drawingCtx.beginPath();
  drawingCtx.ellipse(20, 15, 5, 5, 0, 0, Math.PI * 2);
  drawingCtx.ellipse(20, -15, 5, 5, 0, 0, Math.PI * 2);
  drawingCtx.ellipse(-20, 15, 5, 5, 0, 0, Math.PI * 2);
  drawingCtx.ellipse(-20, -15, 5, 5, 0, 0, Math.PI * 2);
  drawingCtx.fill();
  drawingCtx.restore();

  drawingCtx.fillStyle = "rgba(0, 0, 0, 0.05)";
  drawingCtx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(drawingCanvas, 0, 0);

  // draw active points
  for (const p of points) {
    if (p.isActive) {
      ctx.fillStyle = "white";
      const s = 50; // taille du carré actif (px)
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    } else {
      ctx.fillStyle = "gray";
      const s = 10; // taille du carré inactif (px)
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
  }

  // draw car : on ne rotate PAS l'image, on la remplace selon la direction
  ctx.save();
  const carWidth = 150;
  const carHeight = 150;
  if (selectedImage) {
    ctx.drawImage(
      selectedImage,
      Math.round(carX - carWidth / 2),
      Math.round(carY - carHeight / 2),
      carWidth,
      carHeight
    );
  } else {
    // fallback visuel si images pas encore prêtes
    ctx.fillStyle = "red";
    ctx.fillRect(
      Math.round(carX - carWidth / 2),
      Math.round(carY - carHeight / 2),
      carWidth,
      carHeight
    );
  }
  ctx.restore();
}

// seuils audio (accel / cruise / decel)
const ACCEL_SPIKE_THRESHOLD = 250; // px/s^2
const MIN_CRUISE_SPEED = 60; // px/s
const DECEL_THRESHOLD = -120; // px/s^2
const CRUISE_COOLDOWN = 0.25; // s
const PEAK_COOLDOWN = 0.35; // s

// états pour la détection
let lastSpeed = 0;
let cruiseCooldownT = 0;
let peakCooldownT = 0;
