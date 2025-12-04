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

run(update);

function update(deltaTime) {
  physics.bounds = {
    bottom: canvas.height,
  };

  dragManager.update(input.getX(), input.getY(), input.isPressed());
  physics.update(deltaTime);

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 10;
  ctx.strokeStyle = "white";
  ctx.lineJoin = "round";

  ctx.beginPath();
  const firstBody = chain.bodies[0];
  ctx.moveTo(firstBody.positionX, firstBody.positionY);
  for (const body of chain.bodies) {
    ctx.lineTo(body.positionX, body.positionY);
  }
  const lastBody = chain.bodies[chain.bodies.length - 1];
  ctx.lineTo(lastBody.positionX, lastBody.positionY);
  ctx.stroke();

  // --- rectangle au bout du fil (top-center fixé, sans rotation) ---
  {
    const rectW = 40; // largeur du rectangle
    const rectH = 80; // hauteur du rectangle

    // positionner le rectangle de sorte que son bord supérieur soit au dernier maillon
    const rx = lastBody.positionX - rectW / 2;
    const ry = lastBody.positionY; // bord supérieur = point d'ancrage

    ctx.fillStyle = "white";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    ctx.fillRect(rx, ry, rectW, rectH);
    ctx.strokeRect(rx, ry, rectW, rectH);

    // petit point d'ancrage visible au top-center
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(lastBody.positionX, lastBody.positionY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // debug visualization
  //physics.displayDebug()
}
