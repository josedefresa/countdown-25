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

// récupérer l'image insérée dans le HTML (si présente)
const maisonsImg = document.getElementById("maisons");

// les images de routes et tunnels
const BD = document.getElementById("routeBD");
const BD2 = document.getElementById("routeBDv2");
const GH = document.getElementById("routeGH");
const GB = document.getElementById("routeGB");
const HB = document.getElementById("routeHB");
const HD = document.getElementById("routeHD");
const tunnel = document.getElementById("tunnel");
const tunnel2 = document.getElementById("tunnel2");

const imgBD = {};

// configuration grille
const COLS = 8;
const ROWS = 5;
const TOTAL = COLS * ROWS;

// cases avec images (ne sont pas draggables)
const replaceNums = new Set([
  1, 2, 3, 8, 9, 10, 13, 14, 17, 18, 25, 29, 30, 32, 33, 40,
]);

// cases avec des images de route
const roadNums = new Set([
  4, 5, 6, 7, 11, 12, 15, 16, 19, 20, 21, 22, 23, 24, 26, 27, 28, 31, 34, 35,
  36, 37, 38, 39,
]);

const MAISON_SCALE = 0.8;

const indexTypeMap = {
  1: "maisons", // index 1 -> type maisons
  2: "maisons", // index 2 -> type maisons
  3: "maisons", // index 3 -> type maisons
  4: "BD", // index 4 -> type BD
  // exemples pour plusieurs "route" (il y a 7 cas, adapte les index)
  5: "route",
  6: "route",
  7: "GB",
  8: "maisons",
  9: "maisons",
  10: "maisons",
  11: "BD",
  12: "GH",
  13: "maisons",
  14: "maisons",
  15: "HD",
  16: "GB",
  17: "maisons",
  18: "maisons",
  19: "tunnel",
  20: "BD",
  21: "route",
  22: "route",
  23: "route",
  24: "GH",
  25: "maisons",
  26: "BD",
  27: "route",
  28: "GH",
  29: "maisons",
  30: "maisons",
  31: "Tunnel2",
  32: "maisons",
  33: "maisons",
  34: "HD",
  35: "route",
  36: "route",
  37: "route",
  38: "route",
  39: "GH",
  40: "maisons",
};

// état de contenu des cases : pour chaque index 1..TOTAL
// cellContent[i] = { type: 'image'|'number', value: number, originalIndex: number }
const cellContent = new Array(TOTAL + 1);
// initialisation robuste de cellContent en fonction de indexTypeMap
for (let i = 1; i <= TOTAL; i++) {
  if (indexTypeMap[i]) {
    // type image : on stocke le nom de l'image dans la propriété `img`
    cellContent[i] = { type: "image", img: indexTypeMap[i], originalIndex: i };
  } else {
    // par défaut : cellule numérotée (draggable)
    cellContent[i] = { type: "number", value: i, originalIndex: i };
  }
}

console.log(cellContent);

// drag state
let dragging = null; // {index, value, offsetX, offsetY}
let dragPos = { x: 0, y: 0 };

// utilitaires pour coordonnées canvas (bitmap coords used by drawing)
function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function cellIndexFromPoint(px, py) {
  const cellW = canvas.width / COLS;
  const cellH = canvas.height / ROWS;
  const c = Math.floor(px / cellW);
  const r = Math.floor(py / cellH);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return r * COLS + c + 1; // 1-based
}

// pointer events for dragging
canvas.addEventListener("pointerdown", (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY);
  const idx = cellIndexFromPoint(p.x, p.y);
  if (!idx) return;
  const cell = cellContent[idx];
  if (!cell || cell.type !== "image") return; // only numbers draggable
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  // start drag
  dragging = {
    index: idx,
    value: cell.value,
    pointerId: e.pointerId,
    offsetX: p.x - (((idx - 1) % COLS) + 0.5) * (canvas.width / COLS),
    offsetY:
      p.y - (Math.floor((idx - 1) / COLS) + 0.5) * (canvas.height / ROWS),
  };
  // visually remove from its cell until drop (we'll not draw it in its cell while dragging)
  dragPos.x = p.x;
  dragPos.y = p.y;
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging || dragging.pointerId !== e.pointerId) return;
  const p = getCanvasPoint(e.clientX, e.clientY);
  dragPos.x = p.x;
  dragPos.y = p.y;
});

canvas.addEventListener("pointerup", (e) => {
  if (!dragging || dragging.pointerId !== e.pointerId) return;
  const p = getCanvasPoint(e.clientX, e.clientY);
  const targetIdx = cellIndexFromPoint(p.x, p.y);
  // attempt swap only with other number cells
  if (
    targetIdx &&
    targetIdx !== dragging.index &&
    cellContent[targetIdx].type === "number"
  ) {
    // swap values
    const tmp = cellContent[targetIdx].value;
    cellContent[targetIdx].value = dragging.value;
    cellContent[dragging.index].value = tmp;
  } else {
    // snap back (no change)
  }
  canvas.releasePointerCapture(e.pointerId);
  dragging = null;
});

canvas.addEventListener("pointercancel", (e) => {
  if (!dragging) return;
  dragging = null;
});

// --- update / drawing ---
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
  }

  // fond noir (utilise bitmap dimensions comme le reste du fichier)
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ---------- GRILLE 8x5 BLANCHE ----------
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.fillStyle = "white";
  // verticales
  for (let i = 0; i <= COLS; i++) {
    let X = Math.round((i * canvas.width) / COLS);
    if (X < 0) X = 0;
    if (X >= canvas.width) X = canvas.width - 1;
    ctx.fillRect(X, 0, 1, canvas.height);
  }
  // horizontales
  for (let j = 0; j <= ROWS; j++) {
    let Y = Math.round((j * canvas.height) / ROWS);
    if (Y < 0) Y = 0;
    if (Y >= canvas.height) Y = canvas.height - 1;
    ctx.fillRect(0, Y, canvas.width, 1);
  }

  // Numérotation / images
  const cellW = canvas.width / COLS;
  const cellH = canvas.height / ROWS;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fontSize = Math.max(12, Math.floor(Math.min(cellW, cellH) * 0.25));
  ctx.font = `${fontSize}px sans-serif`;

  const strokeW = Math.max(1, Math.floor(fontSize * 0.12));
  ctx.lineWidth = strokeW;

  let n = 1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = Math.round((c + 0.5) * cellW);
      const cy = Math.round((r + 0.5) * cellH);

      const cell = cellContent[n];

      // if dragging this index, skip drawing it in place (we'll draw the ghost later)
      if (dragging && dragging.index === n && cell && cell.type === "number") {
        n++;
        continue;
      }

      if (cell.type === "image") {
        // dessiner l'image correspondant à cell.img (indexTypeMap)
        const size = Math.min(cellW, cellH) * MAISON_SCALE;
        const key = String(cell.img);

        // récupérer l'élément <img> correspondant (fallback direct via document)
        let imgEl = null;
        switch (key) {
          case "maisons":
            imgEl = maisonsImg;
            break;
          case "BD":
            imgEl = BD;
            break;
          case "BDv2":
          case "routeBDv2":
            imgEl = BD2;
            break;
          case "GH":
            imgEl = GH;
            break;
          case "GB":
            imgEl = GB;
            break;
          case "HB":
            imgEl = HB;
            break;
          case "HD":
            imgEl = HD;
            break;
          case "tunnel":
            imgEl = tunnel;
            break;
          case "Tunnel2":
          case "tunnel2":
            imgEl = tunnel2;
            break;
          case "route":
            imgEl = document.getElementById("route") || null;
            break;
          case "routev2":
            imgEl = document.getElementById("routev2") || null;
            break;
          default:
            // si clé personnalisée, tenter de récupérer un <img id="...">
            imgEl = document.getElementById(key) || null;
        }

        if (imgEl && imgEl.complete) {
          ctx.drawImage(imgEl, cx - size / 2, cy - size / 2, size, size);
        } else {
          // fallback lisible : afficher la clé au centre
          ctx.fillStyle = "white";
          ctx.fillText(key, cx, cy);
        }
      } else {
        // couleur : verte si le numéro est à sa place d'origine
        const isHome = cell.value === cell.originalIndex;
        ctx.fillStyle = isHome ? "green" : "white";
        ctx.strokeStyle = "black";

        // Afficher des images ici
        ctx.strokeText(String(cell.value), cx, cy);
        ctx.fillText(String(cell.value), cx, cy);
      }
      n++;
    }
  }

  // draw dragging ghost on top
  if (dragging) {
    // pointer position in bitmap coords dragPos.x/y
    const gx = dragPos.x;
    const gy = dragPos.y;

    // taille de la police pour le ghost (légèrement plus grande)
    const ghostFontSize = Math.max(12, Math.round(fontSize * 1.2));

    ctx.save();
    ctx.font = `${ghostFontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // uniquement texte rempli — plus de contour/stroke
    ctx.fillStyle = "white";
    ctx.fillText(String(dragging.value), gx, gy);

    ctx.restore();
  }

  ctx.restore();
}
