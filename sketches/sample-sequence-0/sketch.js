import { createEngine } from "../_shared/engine.js";
import { createSpringSettings, Spring } from "../_shared/spring.js";

const { renderer, input, math, run, finish } = createEngine();
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

function update(dt) {
  angle += dt * rotationSpeed;

  const x = input.getX();
  const y = input.getY();

  const forceToTargetX = (x - carX) * forceMultiplier;
  const forceToTargetY = (y - carY) * forceMultiplier;
  carVelocityX += forceToTargetX * dt;
  carVelocityY += forceToTargetY * dt;
  // damping exp
  carVelocityX *= Math.exp(-damping * dt);
  carVelocityY *= Math.exp(-damping * dt);

  carX += carVelocityX * dt;
  carY += carVelocityY * dt;

  // activate close points
  for (const p of points) {
    const dx = carX;
    const dy = carY;
    const dist = math.dist(p.x, p.y, carX, carY);
    const activationDist = 80;

    if (dist < activationDist) p.isActive = true;
  }

  // si toutes les cases sont activées, planifier le reset (une seule fois)
  if (!autoResetScheduled && allPointsActivated()) {
    scheduleAutoReset();
  }

  // --- déterminer la direction à partir de la vitesse (vx,vy) ---
  const speed = Math.hypot(carVelocityX, carVelocityY);

  // utiliser la vitesse si suffisante, sinon utiliser la direction vers le pointeur
  let angleForSector;
  if (speed >= DIRECTION_SPEED_THRESHOLD) {
    angleForSector = Math.atan2(carVelocityY, carVelocityX);
  } else {
    // réactif : prendre la direction vers la cible (input) quand la voiture est lente
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
