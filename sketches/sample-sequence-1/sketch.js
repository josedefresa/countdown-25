import { createEngine } from "../_shared/engine.js";
import { VerletPhysics } from "../_shared/verletPhysics.js";
import { DragManager } from "../_shared/dragManager.js";

const { renderer, input, math, run, finish } = createEngine();
const { ctx, canvas } = renderer;

const physics = new VerletPhysics();
physics.gravityY = 2000;

const dragManager = new DragManager();

// CHAIN
const chain = physics.createChain({
  startPositionX: canvas.width / 2,
  startPositionY: 0,
  endPositionX: canvas.width / 2 + 40,
  endPositionY: canvas.height / 2,
  elementCount: 16,
  linkOptions: {
    //mode: VerletMode.Pull,
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

  // debug visualization
  //physics.displayDebug()
}
