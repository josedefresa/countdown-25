import { createEngine } from "../_shared/engine.js";
import { VerletPhysics } from "../_shared/verletPhysics.js";
import { DragManager } from "../_shared/dragManager.js";

const { renderer, input, math, run, finish } = createEngine();
const { ctx, canvas } = renderer;

const physics = new VerletPhysics();
physics.gravityY = 2000;

const dragManager = new DragManager();

// Paramètres de longueur de chaîne
const CHAIN_LENGTH_PX = 600; // longueur verticale totale en pixels
const CHAIN_OFFSET_X = 40; // décalage horizontal (remplace le "+ 40")
const LINK_LENGTH_PX = 40; // longueur moyenne d’un maillon
const CHAIN_SEGMENTS = Math.max(
  2,
  Math.round(CHAIN_LENGTH_PX / LINK_LENGTH_PX)
);

// CHAIN
const startX = canvas.width / 2;
const startY = 0;

const chain = physics.createChain({
  startPositionX: startX,
  startPositionY: startY,
  endPositionX: startX + CHAIN_OFFSET_X,
  endPositionY: startY + CHAIN_LENGTH_PX,
  elementCount: CHAIN_SEGMENTS,
  linkOptions: {
    stiffness: 1,
  },
  bodyOptions: {
    drag: 0.1,
    radius: 50,
  },
});

chain.bodies[0].isFixed = true;

let rectDragging = false;

// --- rectangle au bout du fil (top-center fixé, sans rotation) ---
const rectW = 500; // largeur du rectangle
const rectH = 1000; // hauteur du rectangle

// cible de drag pour la cible du rectangle (sera placée au centre du rectangle)
const rectDragTarget = {
  // position = centre du rectangle
  positionX: chain.bodies[chain.bodies.length - 1].positionX,
  positionY: chain.bodies[chain.bodies.length - 1].positionY + rectH / 2,
  isFixed: false,

  // hit test : true si (x,y) est à l'intérieur du rectangle
  contains(x, y) {
    const left = this.positionX - rectW / 2;
    const top = this.positionY - rectH / 2;
    return x >= left && x <= left + rectW && y >= top && y <= top + rectH;
  },
};

// hit margin pour éviter le flicker quand on frôle le bord
const RECT_HIT_MARGIN = 6;

// --- création des drag objects pour les maillons : ajouter un hitTest priorisant le rectangle ---
for (const o of chain.bodies) {
  dragManager.createDragObject({
    target: o,
    // n'autorise pas le drag du maillon si le pointeur est dans la zone du rectangle
    hitTest: (x, y) => {
      // x,y fournis par dragManager sont en coords canvas (voir update() ci‑dessous)
      if (rectDragTarget && rectDragTarget.contains) {
        // utiliser une marge pour stabiliser le hit test
        const left = rectDragTarget.positionX - rectW / 2 - RECT_HIT_MARGIN;
        const top = rectDragTarget.positionY - rectH / 2 - RECT_HIT_MARGIN;
        if (
          x >= left &&
          x <= left + rectW + RECT_HIT_MARGIN * 2 &&
          y >= top &&
          y <= top + rectH + RECT_HIT_MARGIN * 2
        ) {
          return false;
        }
      }
      const dx = x - o.positionX;
      const dy = y - o.positionY;
      const r = o.radius || 20;
      return dx * dx + dy * dy <= r * r;
    },
    onStartDrag: (o) => {
      o.isFixed = true;
    },
    onStopDrag: (o) => {
      o.isFixed = false;
    },
  });
}

// créer un drag object pour la cible du rectangle
dragManager.createDragObject({
  target: rectDragTarget,
  // certains DragManager attendent un hitTest séparé ; on le fournit au cas où
  hitTest: (x, y) => rectDragTarget.contains(x, y),
  onStartDrag: () => {
    rectDragging = true;
    console.log("Started dragging rectangle");
    // verrouiller temporairement le dernier maillon pour éviter la physique qui l'écrase
    chain.bodies[chain.bodies.length - 1].isFixed = true;
  },
  onStopDrag: () => {
    rectDragging = false;
    chain.bodies[chain.bodies.length - 1].isFixed = false;
  },
});

run(update);

function update(deltaTime) {
  physics.bounds = {
    bottom: canvas.height,
  };

  const lastBody = chain.bodies[chain.bodies.length - 1];
  const rect = canvas.getBoundingClientRect();

  const inX = input.getX();
  const inY = input.getY();

  // si input renvoie déjà des coords bitmap (0..canvas.width / 0..canvas.height), on les réutilise
  let px = inX;
  let py = inY;

  // sinon on convertit depuis les coords client (CSS) en pixels bitmap
  const looksLikeBitmap =
    typeof inX === "number" &&
    typeof inY === "number" &&
    inX >= 0 &&
    inY >= 0 &&
    inX <= canvas.width &&
    inY <= canvas.height;

  if (!looksLikeBitmap) {
    px = (inX - rect.left) * (canvas.width / rect.width);
    py = (inY - rect.top) * (canvas.height / rect.height);
  }

  // passer les coords converties au dragManager (hit tests utilisent ces mêmes coords)
  dragManager.update(px, py, input.isPressed());

  // si on draggue le rectangle, synchroniser la position du dernier maillon AVANT la mise à jour physique
  if (rectDragging) {
    const last = chain.bodies[chain.bodies.length - 1];
    last.positionX = rectDragTarget.positionX;
    last.positionY = rectDragTarget.positionY - rectH / 2;
  }

  physics.update(deltaTime);

  // dessin (inchangé)
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 10;
  ctx.strokeStyle = "white";
  ctx.lineJoin = "round";

  // dessiner la chaîne
  ctx.beginPath();
  const firstBody = chain.bodies[0];
  ctx.moveTo(firstBody.positionX, firstBody.positionY);
  for (const body of chain.bodies) {
    ctx.lineTo(body.positionX, body.positionY);
  }
  ctx.stroke();

  // dessiner le rectangle (top-center fixé au lastBody)
  const rx = lastBody.positionX - rectW / 2;
  const ry = lastBody.positionY; // bord supérieur = point d'ancrage
  ctx.fillStyle = "white";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 4;
  ctx.fillRect(rx, ry, rectW, rectH);
  ctx.strokeRect(rx, ry, rectW, rectH);
}
