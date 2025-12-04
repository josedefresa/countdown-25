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

const MAISON_SCALE = 0.9;

const indexTypeMap = {
  1: "maisons", // index 1 -> type maisons
  2: "maisons", // index 2 -> type maisons
  3: "BD", // index 3 -> type maisons
  4: "route", // index 4 -> type BD
  // exemples pour plusieurs "route" (il y a 7 cas, adapte les index)
  5: "route",
  6: "GB",
  7: "maisons",
  8: "maisons",
  9: "maisons",
  10: "BD",
  11: "GH",
  12: "maisons",
  13: "maisons",
  14: "HD",
  15: "GB",
  16: "maisons",
  17: "maisons",
  18: "tunnel",
  19: "BD",
  20: "route",
  21: "route",
  22: "route",
  23: "GH",
  24: "maisons",
  25: "maisons",
  26: "BD",
  27: "GH",
  28: "maisons",
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
    case "BD":
      return BD;
    case "BDv2":
    case "routeBDv2":
      return BD2;
    case "GH":
      return GH;
    case "GB":
      return GB;
    case "HB":
      return HB;
    case "HD":
      return HD;
    case "tunnel":
      return tunnel;
    case "Tunnel2":
    case "tunnel2":
      return tunnel2;
    case "route":
      return document.getElementById("route") || null;
    case "routev2":
      return document.getElementById("routev2") || null;
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

  // empêcher drag des maisons / cases non-draggables
  if (cell.type === "image" && cell.img === "maisons") return;

  // autoriser uniquement les images de type route (et similaires)
  if (cell.type === "image" && draggableImageKeys.has(cell.img)) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    // stocker l'original et vider la source pour éviter duplication
    const orig = { ...cellContent[idx] };
    cellContent[idx] = { type: "empty", originalIndex: orig.originalIndex };

    dragging = {
      kind: "image",
      img: orig.img,
      index: idx,
      originalCellData: orig,
      pointerId: e.pointerId,
      // offsets pour position relative si besoin (en bitmap coords)
      offsetX: p.x - (((idx - 1) % COLS) + 0.5) * (canvas.width / COLS),
      offsetY:
        p.y - (Math.floor((idx - 1) / COLS) + 0.5) * (canvas.height / ROWS),
    };
    dragPos.x = p.x;
    dragPos.y = p.y;
    return;
  }

  // (optionnel) si tu veux drag des nombres à la place, ajoute la logique ici.
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
    // drop rules :
    // - can't drop on house cells
    // - if target is image -> swap
    // - if target is number/empty -> move image there
    // - else restore original
    if (!targetIdx || indexTypeMap[targetIdx] === "maisons") {
      // invalid -> restore
      cellContent[dragging.index] = { ...dragging.originalCellData };
    } else {
      const targetCell = cellContent[targetIdx];
      if (targetCell && targetCell.type === "image") {
        // swap : place dragged image into target, place target image back to source
        const temp = { ...targetCell };
        cellContent[targetIdx] = {
          type: "image",
          img: dragging.img,
          originalIndex: targetIdx,
        };
        cellContent[dragging.index] = temp;
      } else {
        // move into number/empty -> image occupies target, source stays empty
        // special rule preserved: if dragged image is routev2 and target is not in original routev2 cells,
        // convert to "route" (fallback)
        let finalImgKey = dragging.img;
        if (
          dragging.img === "routev2" &&
          !Object.keys(indexTypeMap).some(
            (k) =>
              Number(k) === targetIdx && indexTypeMap[targetIdx] === "routev2"
          )
        ) {
          finalImgKey = "route";
        }
        cellContent[targetIdx] = {
          type: "image",
          img: finalImgKey,
          originalIndex: targetIdx,
        };
        // source already emptied at pointerdown
      }
    }
  }

  canvas.releasePointerCapture(e.pointerId);
  dragging = null;
});

canvas.addEventListener("pointercancel", (e) => {
  if (!dragging) return;
  // restore original cell content on cancel
  const orig = dragging.originalCellData;
  if (orig) {
    cellContent[dragging.index] = { ...orig };
  }
  dragging = null;
});

// ---- Remplacement : initialisation des cellules + shuffle des routes/tunnels ----

// clés considérées comme "route/tunnel" (déplaçables et swappables)
const movableKeys = new Set([
  "route",
  "GB",
  "GH",
  "BD",
  "HD",
  "tunnel",
  "Tunnel2",
]);

// map pour conversion en v2 quand l'image arrive à sa place finale
const toV2 = {
  route: "routev2",
  BD: "BDv2",
  GB: "GBv2",
  GH: "GHv2",
  HD: "HDv2",
  tunnel: "tunnelv2",
  Tunnel2: "tunnel2v2",
};

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
    // maison : immobile, image 'maisons', locked
    cellContent[i] = {
      type: "image",
      img: "maisons",
      finalType: finalType,
      locked: true,
      originalIndex: i,
    };
  } else if (movableIndices.indexOf(i) !== -1) {
    // distribuer une image mélangée (version non-v2)
    const assigned = shuffledTypes.shift();
    cellContent[i] = {
      type: "image",
      img: assigned,
      finalType: finalType,
      locked: false,
      originalIndex: i,
    };
  } else {
    // case numérique par défaut
    cellContent[i] = { type: "number", value: i, originalIndex: i };
  }
}

// ---- Remplacement : pointer handlers pour respecter verrouillage et conversion v2 ----

// pointerdown : autoriser drag seulement sur images non-locked et appartenant au set movableKeys
canvas.addEventListener("pointerdown", (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY);
  const idx = cellIndexFromPoint(p.x, p.y);
  if (!idx) return;
  const cell = cellContent[idx];
  if (!cell) return;

  // maisons ou locked => non draggable
  if (cell.type === "image" && (cell.img === "maisons" || cell.locked)) return;

  // n'autorise que les images de type "movableKeys"
  if (cell.type === "image" && movableKeys.has(cell.img)) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    // sauvegarder l'original et vider la source pour éviter duplication visuelle
    const orig = { ...cellContent[idx] };
    cellContent[idx] = { type: "empty", originalIndex: orig.originalIndex };

    dragging = {
      kind: "image",
      img: orig.img, // ex: "route" ou "GH", etc.
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

  // autres cas non draggables pour l'instant
});

// pointermove : mise à jour de la position du ghost
canvas.addEventListener("pointermove", (e) => {
  if (!dragging || dragging.pointerId !== e.pointerId) return;
  const p = getCanvasPoint(e.clientX, e.clientY);
  dragPos.x = p.x;
  dragPos.y = p.y;
});

// pointerup : règles de drop
canvas.addEventListener("pointerup", (e) => {
  if (!dragging || dragging.pointerId !== e.pointerId) return;
  const p = getCanvasPoint(e.clientX, e.clientY);
  const targetIdx = cellIndexFromPoint(p.x, p.y);

  if (dragging.kind === "image") {
    // invalid drop -> restore original
    if (!targetIdx) {
      cellContent[dragging.index] = { ...dragging.originalCellData };
    } else {
      // can't drop on maison or on locked cell
      const targetFinalType = indexTypeMap[targetIdx];
      const targetCell = cellContent[targetIdx];

      if (targetFinalType === "maisons" || (targetCell && targetCell.locked)) {
        // restore
        cellContent[dragging.index] = { ...dragging.originalCellData };
      } else if (
        targetCell &&
        targetCell.type === "image" &&
        !targetCell.locked
      ) {
        // swap images: target gets dragged img, source gets target img (preserving finalType)
        const temp = { ...targetCell };
        cellContent[targetIdx] = {
          type: "image",
          img: dragging.img,
          finalType: targetCell.finalType || indexTypeMap[targetIdx],
          locked: false,
          originalIndex: targetIdx,
        };
        // place previous target image back at source (and keep its locked state)
        cellContent[dragging.index] = {
          ...temp,
          originalIndex: dragging.index,
        };
        // after placing into targetIdx, check if it matches final => convert to v2/lock if so
        const placedKey = cellContent[targetIdx].img;
        if (indexTypeMap[targetIdx] && placedKey === indexTypeMap[targetIdx]) {
          const v2 = toV2[placedKey] || placedKey + "v2";
          cellContent[targetIdx].img = v2;
          cellContent[targetIdx].locked = true;
        }
      } else {
        // target is number / empty -> move dragged image into target
        // special rule : if dragged img placed into index whose final type is different, but dragged image is routev2 (shouldn't happen),
        // we convert accordingly. Here dragged images are base types (not v2). After placement, if it matches final expected type, convert to v2 and lock.
        let finalImgKey = dragging.img;
        cellContent[targetIdx] = {
          type: "image",
          img: finalImgKey,
          finalType: indexTypeMap[targetIdx] || null,
          locked: false,
          originalIndex: targetIdx,
        };

        // check if placed at its final index -> convert to v2 and lock
        if (
          indexTypeMap[targetIdx] &&
          finalImgKey === indexTypeMap[targetIdx]
        ) {
          const v2 = toV2[finalImgKey] || finalImgKey + "v2";
          cellContent[targetIdx].img = v2;
          cellContent[targetIdx].locked = true;
        }

        // source already emptied earlier
      }
    }
  }

  canvas.releasePointerCapture(e.pointerId);
  dragging = null;
});

// pointercancel : restaurer en cas d'annulation
canvas.addEventListener("pointercancel", (e) => {
  if (!dragging) return;
  const orig = dragging.originalCellData;
  if (orig) {
    cellContent[dragging.index] = { ...orig };
  }
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
        //finish();
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

  ctx.fillStyle = "white";

  // verticales centrées dans la zone de la grille
  for (let i = 0; i <= COLS; i++) {
    let X = grid.offsetX + i * grid.cellSize;
    // clamp
    if (X < 0) X = 0;
    if (X >= canvas.width) X = canvas.width - 1;
    ctx.fillRect(Math.round(X), 0, 1, canvas.height);
  }
  // horizontales
  for (let j = 0; j <= ROWS; j++) {
    let Y = grid.offsetY + j * grid.cellSize;
    if (Y < 0) Y = 0;
    if (Y >= canvas.height) Y = canvas.height - 1;
    ctx.fillRect(0, Math.round(Y), canvas.width, 1);
  }

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
        // dessiner l'image correspondant à cell.img
        const size = Math.max(1, Math.floor(cellSize * MAISON_SCALE));
        const key = String(cell.img);

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
            imgEl = document.getElementById(key) || null;
        }

        if (imgEl && imgEl.complete) {
          ctx.drawImage(imgEl, cx - size / 2, cy - size / 2, size, size);
        } else {
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
    const imgEl = getImgElementForKey(dragging.img);
    if (imgEl && imgEl.complete) {
      ctx.drawImage(imgEl, gx - size / 2, gy - size / 2, size, size);
    } else {
      // fallback text if image not loaded
      ctx.save();
      ctx.font = `${Math.max(12, Math.round(fontSize * 1.2))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      ctx.fillText(dragging.img, gx, gy);
      ctx.restore();
    }
  }

  ctx.restore();
}
