import { createEngine } from "../_shared/engine.js";
import { Spring } from "../_shared/spring.js";

const { renderer, input, math, run, finish } = createEngine();
const { ctx, canvas } = renderer;
run(update);

const ySpring = new Spring({
  position: -canvas.height,
  target: 0,
  frequency: 1.5,
  halfLife: 0.05,
});
const scaleSpring = new Spring({
  position: 1,
  frequency: 1.5,
  halfLife: 0.1,
});
const rotationSpring = new Spring({
  position: 180,
  frequency: 0.5,
  halfLife: 0.805,
  wrap: 360,
});

let fallPos = 0;
let fallVel = 0;

const State = {
  WaitingForInput: "waitingForInput",
  Interactive: "interactive",
  Falling: "falling",
  Finished: "finished",
};
let currentState = State.WaitingForInput;
let startInputX = 0;

// récupérer l'image insérée dans le HTML
const maisonsImg = document.getElementById("maisons");

// liste des numéros à remplacer par l'image
const replaceNums = new Set([
  1, 2, 3, 8, 9, 10, 13, 14, 17, 18, 25, 29, 30, 32, 33, 40,
]);

const MAISON_SCALE = 0.8;

function update(dt) {
  let nextState = undefined;
  switch (currentState) {
    case State.WaitingForInput: {
      if (input.hasStarted()) {
        startInputX = input.getX();
        nextState = State.Interactive;
      }
      break;
    }

    case State.Interactive: {
      const xOffset = input.getX() - startInputX;
      rotationSpring.target = math.map(xOffset, 0, canvas.width, 0, 360) + 180;
      rotationSpring.step(dt);
      if (
        Math.abs(math.deltaAngleDeg(rotationSpring.position, 0)) < 5 &&
        Math.abs(rotationSpring.velocity, 0) < 10
      )
        nextState = State.Falling;
      break;
    }

    case State.Falling: {
      const drag = 0.1;
      const gravity = canvas.height * 3;
      const rotationForce = 200 * Math.sign(rotationSpring.velocity);
      rotationSpring.velocity += rotationForce * dt;
      rotationSpring.velocity *= Math.exp(-dt * drag);
      rotationSpring.position += rotationSpring.velocity * dt;
      fallVel += gravity * dt;
      fallPos += fallVel * dt;
      if (fallPos > canvas.height) nextState = State.Finished;
      break;
    }

    case State.Finished: {
      break;
    }
  }

  if (nextState !== undefined) {
    currentState = nextState;
    switch (currentState) {
      case State.Finished:
        finish();
        break;
      case State.Falling:
        scaleSpring.target = 1.2;
        break;
    }
    // change state
  }

  // fond noir
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.restore();

  // ---------- GRILLE 7x4 BLANCHE (overlay) ----------
  // on remet la transform à l'identité et on dessine des bandes d'1px pour éviter gaps
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.fillStyle = "white";
  const cols = 8;
  const rows = 5;

  // verticales
  for (let i = 0; i <= cols; i++) {
    let X = Math.round((i * canvas.width) / cols);
    if (X < 0) X = 0;
    if (X >= canvas.width) X = canvas.width - 1;
    ctx.fillRect(X, 0, 1, canvas.height);
  }
  // horizontales
  for (let j = 0; j <= rows; j++) {
    let Y = Math.round((j * canvas.height) / rows);
    if (Y < 0) Y = 0;
    if (Y >= canvas.height) Y = canvas.height - 1;
    ctx.fillRect(0, Y, canvas.width, 1);
  }

  // Numérotation des cases : petit numéro centré dans chaque case
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fontSize = Math.max(12, Math.floor(Math.min(cellW, cellH) * 0.25));
  ctx.font = `${fontSize}px sans-serif`;

  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = Math.max(1, Math.floor(fontSize * 0.12));

  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = Math.round((c + 0.5) * cellW);
      const cy = Math.round((r + 0.5) * cellH);

      if (replaceNums.has(n) && maisonsImg && maisonsImg.complete) {
        // dessiner l'image centrée dans la case
        const size = Math.min(cellW, cellH) * MAISON_SCALE; // ajuste la taille si besoin
        ctx.drawImage(maisonsImg, cx - size / 2, cy - size / 2, size, size);
      } else {
        const text = String(n);
        ctx.strokeText(text, cx, cy);
        ctx.fillText(text, cx, cy);
      }
      n++;
    }
  }

  ctx.restore();
}
