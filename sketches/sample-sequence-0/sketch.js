import { createEngine } from "../_shared/engine.js";
import { createSpringSettings, Spring } from "../_shared/spring.js";

const { renderer, input, math, run, finish } = createEngine();
const { ctx, canvas } = renderer;
// array of preloaded images
const imagePaths = ["./car_01.png", "./car_02.png", "./car_03.png"];

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
let rotationSpeed = 180; // degrees per second

const ellipseRadiusX = 400;
const ellipseRadiusY = 600;

let carX = 0;
let carY = 0;
let carVelocityX = 0;
let carVelocityY = 0;
let forceMultiplier = 5;
let damping = 2; // damping coefficient

const points = [];

const centerX = canvas.width / 2;
const centerY = canvas.height / 2;

//create points on ellipse
const pointCount = 100;
for (let i = 0; i < pointCount; i++) {
  const a = (i / pointCount) * Math.PI * 2;
  const x = Math.cos(a) * ellipseRadiusX;
  const y = Math.sin(a) * ellipseRadiusY;
  points.push({ x: centerX + x, y: centerY + y, isActive: false });
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
    const activationDist = 100;

    if (dist < activationDist) p.isActive = true;
  }
  const carAngle = Math.atan2(y - carY, x - carX);

  const selectedImageIndex =
    Math.floor((angle / 360) * images.length) % images.length;
  const selectedImage = images[selectedImageIndex];

  // draw to drawing canvas
  drawingCtx.fillStyle = "white";

  drawingCtx.save();
  drawingCtx.translate(carX, carY);
  drawingCtx.rotate(carAngle);
  drawingCtx.beginPath();
  drawingCtx.ellipse(20, 10, 5, 5, 0, 0, Math.PI * 2);
  drawingCtx.ellipse(20, -10, 5, 5, 0, 0, Math.PI * 2);
  drawingCtx.ellipse(-20, 10, 5, 5, 0, 0, Math.PI * 2);
  drawingCtx.ellipse(-20, -10, 5, 5, 0, 0, Math.PI * 2);
  drawingCtx.fill();
  drawingCtx.restore();

  drawingCtx.fillStyle = "rgba(0, 0, 0, 0.05)";
  drawingCtx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(drawingCanvas, 0, 0);

  // ctx.fillStyle = "white";
  // ctx.beginPath();
  // ctx.ellipse(x, y, 50, 50, 0, 0, Math.PI * 2);
  // ctx.fill();

  // draw active points

  for (const p of points) {
    if (p.isActive) {
      ctx.fillStyle = "yellow";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 10, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "gray";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // draw car
  ctx.save();
  ctx.translate(carX, carY);
  ctx.rotate(carAngle);
  ctx.fillStyle = "red";
  const carWidth = 60;
  const carHeight = 30;
  ctx.drawImage(
    selectedImage,
    -carWidth / 2,
    -carHeight / 2,
    carWidth,
    carHeight
  );
  //ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);
  ctx.restore();
}
