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

for (const o of chain.bodies) {
  dragManager.createDragObject({
    target: o,
    onStartDrag: (o) => {
      o.isFixed = true;
    },
    onStopDrag: (o) => {
      o.isFixed = false;
    },
  });
}

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

let rectDragging = false;

// créer un drag object pour la cible du rectangle
dragManager.createDragObject({
  target: rectDragTarget,
  // certains DragManager attendent un hitTest séparé ; on le fournit au cas où
  hitTest: (x, y) => rectDragTarget.contains(x, y),
  onStartDrag: () => {
    rectDragging = true;
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

  // --- IMPORTANT : synchroniser la target du rectangle AVANT le hit test ---
  // si on ne draggue pas, setter la cible sur la position visible du dernier maillon
  if (!rectDragging) {
    rectDragTarget.positionX = lastBody.positionX;
    rectDragTarget.positionY = lastBody.positionY + rectH / 2;
  }

  // mettre à jour le drag manager (il utilisera rectDragTarget pour le hitTest)
  dragManager.update(input.getX(), input.getY(), input.isPressed());

  // si on draggue le rectangle, synchroniser la position du dernier maillon AVANT la mise à jour physique
  if (rectDragging) {
    const last = chain.bodies[chain.bodies.length - 1];
    // on veut que lastBody soit au top-center du rectangle :
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
