import { createEngine } from "../_shared/engine.js";
import { Spring } from "../_shared/spring.js";

const { renderer, input, math, run, finish, audio } = createEngine();
const { ctx, canvas } = renderer;
run(update);

// --- audio: jouer un son lors du drop d'une image ---
const dropSound = await audio.load("Audio/wood.mp3");
// helper pour jouer le son (avec légère variation si tu veux)
function playDrop() {
  dropSound.play({
    rate: 0.95 + Math.random() * 0.1,
    volume: 0.8,
  });
}

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

const MAISON_SCALE = 1;

// REMPLACER indexTypeMap avec des clés cohérentes (utilise les id HTML)
const indexTypeMap = {
  1: "maisons",
  2: "maisons",
  3: "routeBD", // était "BD"
  4: "route",
  5: "route",
  6: "routeGB", // était "GB"
  7: "maisons",
  8: "maisons",
  9: "maisons",
  10: "routeBD", // était "BD"
  11: "routeGH", // était "GH"
  12: "maisons",
  13: "maisons",
  14: "routeHD", // était "HD"
  15: "routeGB", // était "GB"
  16: "maisons",
  17: "maisons",
  18: "tunnel",
  19: "routeBD", // était "BD"
  20: "route",
  21: "route",
  22: "route",
  23: "routeGH", // était "GH"
  24: "maisons",
  25: "maisons",
  26: "routeBD", // était "BD"
  27: "routeGH", // était "GH"
  28: "maisons",
  29: "maisons",
  30: "maisons",
  31: "tunnel2", // était "Tunnel2"
  32: "maisons",
  33: "maisons",
  34: "routeHD", // était "HD"
  35: "route",
  36: "route",
  37: "route",
  38: "route",
  39: "routeGH", // était "GH"
  40: "maisons",
};

// drag state
let dragging = null; // {index, value, offsetX, offsetY}
let dragPos = { x: 0, y: 0 };

// AJOUTER CETTE LIGNE :
const cellContent = new Array(TOTAL + 1);

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

// --- nouvelle configuration pour grille carrée ---
let grid = {
  cellSize: 0, // taille d'une case en pixels bitmap
  gridW: 0,
  gridH: 0,
  offsetX: 0,
  offsetY: 0,
};

function computeGrid() {
  // canvas.width/height sont en pixels bitmap
  const maxCellW = Math.floor(canvas.width / COLS);
  const maxCellH = Math.floor(canvas.height / ROWS);
  const cellSize = Math.max(1, Math.floor(Math.min(maxCellW, maxCellH)));

  grid.cellSize = cellSize;
  grid.gridW = cellSize * COLS;
  grid.gridH = cellSize * ROWS;
  grid.offsetX = Math.round((canvas.width - grid.gridW) / 2);
  grid.offsetY = Math.round((canvas.height - grid.gridH) / 2);
}

// utilitaire mis à jour pour trouver l'index de cellule en tenant compte de l'offset et du cellSize
function cellIndexFromPoint(px, py) {
  // s'assurer que la grille est calculée
  if (!grid.cellSize) computeGrid();

  const xRel = px - grid.offsetX;
  const yRel = py - grid.offsetY;
  if (xRel < 0 || yRel < 0) return null;
  if (xRel >= grid.gridW || yRel >= grid.gridH) return null;

  const c = Math.floor(xRel / grid.cellSize);
  const r = Math.floor(yRel / grid.cellSize);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return r * COLS + c + 1; // 1-based
}

// --- DÉPLACER CES BLOCS ICI (avant les event listeners, ligne ~195) ---

// clés considérées comme "route/tunnel" (déplaçables et swappables)
const movableKeys = new Set([
  "route",
  "routeGB", // était "GB"
  "routeGH", // était "GH"
  "routeBD", // était "BD"
  "routeHD", // était "HD"
  "tunnel",
  "tunnel2", // était "Tunnel2"
]);

// conversion en v2 quand une image est placée à son index final
const toV2 = {
  route: "routev2",
  routeBD: "routeBDv2", // était BD: "routeBDv2"
  routeGB: "routeGBv2", // était GB: "routeGBv2"
  routeGH: "routeGHv2", // était GH: "routeGHv2"
  routeHD: "routeHDv2", // était HD: "routeHDv2"
  tunnel: "tunnelv2",
  tunnel2: "tunnel2v2", // était Tunnel2: "tunnel2v2"
};

function convertIfFinal(idx) {
  const cell = cellContent[idx];
  if (!cell || cell.type !== "image") return;
  const finalType = cell.finalType;
  if (!finalType) return;

  // base sans suffixe v2
  const base = cell.img.endsWith("v2") ? cell.img.slice(0, -2) : cell.img;

  // ne convertir que les routes/tunnels (pas les maisons)
  if (!movableKeys.has(base)) return;

  if (base === finalType) {
    const v2 = toV2[base] || base + "v2";
    cell.img = v2;
    cell.locked = true;
  }
}

// helper : set des clés images de type "route" draggables
const draggableImageKeys = new Set([
  "route",
  "routev2",
  "GB",
  "GH",
  "BD",
  "BDv2",
  "HD",
  "HB",
  "tunnel",
  "Tunnel2",
  "tunnel2",
]);

function getImgElementForKey(key) {
  switch (key) {
    case "maisons":
      return maisonsImg;
    case "route":
      return document.getElementById("route");
    case "routev2":
      return document.getElementById("routev2");
    case "routeBD":
      return document.getElementById("routeBD");
    case "routeBDv2":
      return document.getElementById("routeBDv2");
    case "routeGB":
      return document.getElementById("routeGB");
    case "routeGBv2":
      return document.getElementById("routeGBv2");
    case "routeGH":
      return document.getElementById("routeGH");
    // si ton id réel est “route.GHv2”, remplace ci-dessous par getElementById("route.GHv2")
    case "routeGHv2":
      return document.getElementById("routeGHv2");
    case "routeHD":
      return document.getElementById("routeHD");
    case "routeHDv2":
      return document.getElementById("routeHDv2");
    case "tunnel":
      return document.getElementById("tunnel");
    case "tunnelv2":
      return document.getElementById("tunnelv2");
    case "tunnel2":
      return document.getElementById("tunnel2");
    case "tunnel2v2":
      return document.getElementById("tunnel2v2");
    default:
      return document.getElementById(key) || null;
  }
}

// pointer events : maintenant on permet le drag des images "route" (pas des maisons)
canvas.addEventListener("pointerdown", (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY);
  const idx = cellIndexFromPoint(p.x, p.y);
  if (!idx) return;
  const cell = cellContent[idx];
  if (!cell) return;

  // maisons ou locked => non draggable
  if (cell.type === "image" && (cell.img === "maisons" || cell.locked)) return;

  // extraire la clé de base (sans v2)
  let baseImg = cell.img;
  if (baseImg.endsWith("v2")) {
    baseImg = baseImg.slice(0, -2); // enlève "v2"
  }

  if (cell.type === "image" && movableKeys.has(baseImg)) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    const orig = { ...cellContent[idx] };
    cellContent[idx] = { type: "empty", originalIndex: orig.originalIndex };

    dragging = {
      kind: "image",
      img: orig.img,
      index: idx,
      originalCellData: orig,
      pointerId: e.pointerId,
      locked: !!orig.locked,
      offsetX:
        p.x - (grid.offsetX + (((idx - 1) % COLS) + 0.5) * grid.cellSize),
      offsetY:
        p.y -
        (grid.offsetY + (Math.floor((idx - 1) / COLS) + 0.5) * grid.cellSize),
    };
    dragPos.x = p.x;
    dragPos.y = p.y;
    return;
  }
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

  if (dragging.kind === "image") {
    if (!targetIdx) {
      // hors grille -> restore
      cellContent[dragging.index] = { ...dragging.originalCellData };
    } else {
      const targetFinalType = indexTypeMap[targetIdx];
      const targetCell = cellContent[targetIdx];

      // can't drop on maison or on locked cell
      if (targetFinalType === "maisons" || (targetCell && targetCell.locked)) {
        cellContent[dragging.index] = { ...dragging.originalCellData };
      } else if (
        targetCell &&
        targetCell.type === "image" &&
        !targetCell.locked
      ) {
        const temp = { ...targetCell };
        const dragged = { ...dragging.originalCellData };

        cellContent[targetIdx] = {
          type: "image",
          img: dragged.img,
          finalType: indexTypeMap[targetIdx] || temp.finalType || null,
          locked: false,
          originalIndex: targetIdx,
        };

        cellContent[dragging.index] = {
          type: "image",
          img: temp.img,
          finalType: indexTypeMap[dragging.index] || dragged.finalType || null,
          locked: !!temp.locked,
          originalIndex: dragging.index,
        };

        // convertir/locker les deux cases impliquées
        convertIfFinal(targetIdx);
        convertIfFinal(dragging.index);

        // jouer le son après un swap
        playDrop();
      } else {
        // target is number / empty -> move dragged image into target
        cellContent[targetIdx] = {
          type: "image",
          img: dragging.img,
          finalType: indexTypeMap[targetIdx] || null,
          locked: false,
          originalIndex: targetIdx,
        };

        // convertir en v2 + lock si c'est la bonne place
        convertIfFinal(targetIdx);

        // jouer le son après un drop simple
        playDrop();
      }
    }
  }

  canvas.releasePointerCapture(e.pointerId);
  dragging = null;
});

canvas.addEventListener("pointercancel", (e) => {
  if (!dragging) return;
  const orig = dragging.originalCellData;
  if (orig) {
    cellContent[dragging.index] = { ...orig };
  }
  dragging = null;
});

// ---- Remplacement : initialisation des cellules + shuffle des routes/tunnels ----

// construire la liste des indices finaux (indexTypeMap) qui sont movables
const movableIndices = [];
const movableTypes = [];
for (let i = 1; i <= TOTAL; i++) {
  const t = indexTypeMap[i];
  if (t && movableKeys.has(t)) {
    movableIndices.push(i);
    movableTypes.push(t);
  }
}

// shuffle simple Fisher–Yates pour mélanger les images initiales
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}
const shuffledTypes = shuffle(movableTypes.slice());

// initialiser cellContent : maisons restent, cases movables reçoivent un type mélangé,
// autres indices deviennent des nombres (draggables si tu veux)
for (let i = 1; i <= TOTAL; i++) {
  const finalType = indexTypeMap[i] || null;
  if (finalType === "maisons") {
    cellContent[i] = {
      type: "image",
      img: "maisons",
      finalType: finalType,
      locked: true,
      originalIndex: i,
    };
  } else if (movableIndices.indexOf(i) !== -1) {
    const assigned = shuffledTypes.shift();
    cellContent[i] = {
      type: "image",
      img: assigned,
      finalType: finalType,
      locked: false,
      originalIndex: i,
    };
  } else {
    cellContent[i] = { type: "number", value: i, originalIndex: i };
  }
}

// CONVERSION INITIALE: si une image de route/tunnel est déjà à sa case finale, passer en v2 et locker
for (let i = 1; i <= TOTAL; i++) {
  const cell = cellContent[i];
  if (!cell || cell.type !== "image") continue;
  const expected = cell.finalType;
  if (!expected) continue;

  const base = cell.img.endsWith("v2") ? cell.img.slice(0, -2) : cell.img;

  // ne convertir que les routes/tunnels (pas les maisons)
  if (!movableKeys.has(base)) continue;

  if (base === expected) {
    const v2Map = {
      route: "routev2",
      routeBD: "routeBDv2",
      routeGB: "routeGBv2",
      routeGH: "routeGHv2",
      routeHD: "routeHDv2",
      tunnel: "tunnelv2",
      tunnel2: "tunnel2v2",
    };
    cell.img = v2Map[base] || base + "v2";
    cell.locked = true;
  }
}

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
        //finish();
        console.log("Animation finished");
        break;
      case State.Falling:
        scaleSpring.target = 1.2;
        break;
    }
  }

  // recalculer grille (utile si canvas resized)
  computeGrid();

  // fond noir (utilise bitmap dimensions)
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ---------- GRILLE carrée ----------
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // SUPPRESSION de l'affichage des lignes de grille
  // ctx.fillStyle = "white";
  // // verticales centrées dans la zone de la grille
  // for (let i = 0; i <= COLS; i++) {
  //   let X = grid.offsetX + i * grid.cellSize;
  //   if (X < 0) X = 0;
  //   if (X >= canvas.width) X = canvas.width - 1;
  //   ctx.fillRect(Math.round(X), 0, 1, canvas.height);
  // }
  // // horizontales
  // for (let j = 0; j <= ROWS; j++) {
  //   let Y = grid.offsetY + j * grid.cellSize;
  //   if (Y < 0) Y = 0;
  //   if (Y >= canvas.height) Y = canvas.height - 1;
  //   ctx.fillRect(0, Math.round(Y), canvas.width, 1);
  // }

  // Numérotation / images — utiliser grid.cellSize et offsets pour centres
  const cellSize = grid.cellSize;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontSize = Math.max(12, Math.floor(Math.min(cellSize) * 0.25));
  ctx.font = `${fontSize}px sans-serif`;

  let n = 1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = Math.round(grid.offsetX + (c + 0.5) * cellSize);
      const cy = Math.round(grid.offsetY + (r + 0.5) * cellSize);

      const cell = cellContent[n];

      // si on drag depuis cette case et que c'était un nombre, on ne redessine pas la valeur (ghost dessiné plus bas)
      if (dragging && dragging.index === n && cell && cell.type === "number") {
        n++;
        continue;
      }

      // gérer explicitement les cellules vides => ne rien dessiner
      if (!cell || cell.type === "empty") {
        n++;
        continue;
      }

      if (cell.type === "image") {
        const size = Math.max(1, Math.floor(cellSize * MAISON_SCALE));
        const key = String(cell.img);

        // unifier via getImgElementForKey
        const imgEl = getImgElementForKey(key);

        if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
          ctx.drawImage(imgEl, cx - size / 2, cy - size / 2, size, size);
        } else {
          // fallback non destructif
          ctx.fillStyle = "white";
          ctx.fillText(key, cx, cy);
        }
      } else if (cell.type === "number") {
        // couleur : verte si le numéro est à sa place d'origine
        const isHome = cell.value === cell.originalIndex;
        ctx.fillStyle = isHome ? "green" : "white";
        ctx.fillText(String(cell.value), cx, cy);
      }
      n++;
    }
  }

  // draw dragging ghost on top (utiliser cellSize pour taille)
  if (dragging && dragging.kind === "image") {
    const gx = dragPos.x;
    const gy = dragPos.y;
    const size = Math.max(1, Math.floor(cellSize * 0.6));
    const ghostImg = getImgElementForKey(dragging.img);
    if (ghostImg && ghostImg.complete && ghostImg.naturalWidth > 0) {
      ctx.drawImage(ghostImg, gx - size / 2, gy - size / 2, size, size);
    } else {
      ctx.fillStyle = "white";
      ctx.fillText(dragging.img, gx, gy);
    }
  }

  ctx.restore();

  checkCompleteAndFinish();
}

// retourne true si toutes les cases ayant un finalType de movableKeys sont en place (v2/locked)
function allCellsPlaced() {
  for (let i = 1; i <= TOTAL; i++) {
    const expected = indexTypeMap[i];
    if (!expected) continue; // pas d'image attendue ici
    if (!movableKeys.has(expected)) continue; // on ne vérifie que les routes/tunnels
    const cell = cellContent[i];
    if (!cell || cell.type !== "image") return false;
    // base sans suffixe v2
    const base = cell.img.endsWith("v2") ? cell.img.slice(0, -2) : cell.img;
    if (base !== expected) return false;
    if (!cell.locked) return false; // doit être verrouillée après conversion en v2
  }
  return true;
}

// appeler la vérification depuis update() (par ex. à la fin) :
function checkCompleteAndFinish() {
  if (allCellsPlaced()) {
    console.log("Toutes les cases sont à leur place !");
    setTimeout(() => {
      console.log("Animation will finish in 2 seconds...");
      finish();
    }, 3000);
    currentState = State.Finished; // ou autre action : afficher message / bloquer interactions
    // optionnel : faire quelque chose une seule fois
    // finish(); // si tu veux terminer proprement
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") {
    finish();
  }
});
