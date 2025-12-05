import { createEngine } from "../_shared/engine.js";
import { VerletPhysics } from "../_shared/verletPhysics.js";
import { DragManager } from "../_shared/dragManager.js";

const { renderer, input, math, run, finish, audio } = createEngine();
const { ctx, canvas } = renderer;

// helper : convertir clientX/clientY -> coords canvas (pixels bitmap)
function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

const physics = new VerletPhysics();
physics.gravityY = 1000;

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
// PASSER à let pour pouvoir ajuster la taille si l'image est chargée
let rectW = 0; // plus de carré visible tant que l'image n'est pas prête
let rectH = 0; // même chose pour la hauteur

// DÉCLARATION DE rectDragTarget AVANT TOUT USAGE (pointerdown, etc.)
const rectDragTarget = {
  positionX: chain.bodies[chain.bodies.length - 1].positionX,
  positionY: chain.bodies[chain.bodies.length - 1].positionY + rectH / 2,
  contains(x, y) {
    const left = this.positionX - rectW / 2;
    const top = this.positionY - rectH / 2;
    return x >= left && x <= left + rectW && y >= top && y <= top + rectH;
  },
};

// récupérer l'image punchbag (assure-toi d'avoir <img id="punchbag_01" ...> dans index.html)
const punchImg = document.getElementById("punchbag_01");
let punchClickCount = 0;
let punchDetached = false;
let punchLanded = false;
const punchPhysics = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
};

// resize punch dimensions quand l'image charge
if (punchImg) {
  const applySize = () => {
    const maxScale = 0.8;
    const scale = Math.min(
      maxScale,
      Math.max(
        0.25,
        Math.min(
          canvas.width / 2 / punchImg.naturalWidth,
          canvas.height / 2 / punchImg.naturalHeight
        )
      )
    );
    rectW = Math.round(punchImg.naturalWidth * scale);
    rectH = Math.round(punchImg.naturalHeight * scale);

    // initialiser position physique au bout du fil si pas encore détaché
    const last = chain.bodies[chain.bodies.length - 1];
    punchPhysics.x = last.positionX;
    punchPhysics.y = last.positionY;
  };
  if (punchImg.complete && punchImg.naturalWidth > 0) {
    applySize();
  } else {
    punchImg.onload = () => applySize();
    punchImg.onerror = () =>
      console.warn("punchbag_01 failed to load:", punchImg?.src);
  }
}

// compteur de clics après atterrissage et état de la punchbag (1..5)
let postLandClickCount = 0;
let punchStage = 1; // 1 = punchbag_01, 2 = punchbag_02, 3 = punchbag_03, 4 = punchbag_04, 5 = punchbag_05

// seuils pour passer au stage suivant
const STAGE_THRESHOLDS = {
  1: 3, // 1 -> 2 après 3 clics
  2: 5, // 2 -> 3 après 5 clics
  3: 10, // 3 -> 4 après 10 clics
  4: 5, // 4 -> 5 après 5 clics
  5: 1, // 5 -> 6 après 1 clic  <-- ajouté
};

// helper pour swap d'image en fonction du stage
function swapToStage(stage) {
  if (stage <= punchStage || stage < 2 || stage > 6) return;
  const id = `punchbag_0${stage}`;
  const altEl = document.getElementById(id);
  if (altEl) {
    punchImg.src = altEl.src;
  } else if (typeof punchImg.src === "string") {
    punchImg.src = punchImg.src.replace(/punchbag_\d+/, id);
  }
  punchStage = stage;
  postLandClickCount = 0;
  punchImg.onload = () => {
    const maxScale = 0.8;
    const scale = Math.min(
      maxScale,
      Math.max(
        0.25,
        Math.min(
          canvas.width / 2 / punchImg.naturalWidth,
          canvas.height / 2 / punchImg.naturalHeight
        )
      )
    );
    rectW = Math.round(punchImg.naturalWidth * scale);
    rectH = Math.round(punchImg.naturalHeight * scale);
    if (punchLanded) {
      punchPhysics.y = canvas.height - rectH;
    }
  };
  console.log(`Punchbag changed to stage ${stage}`);

  // quand on affiche punchbag_06 (stage 6) on considère l'animation terminée et on schedule le reset
  if (stage === 6) {
    scheduleAutoReset();
  }
}

// --- Audio punch ---
const punch01 = await audio.load("Audio/punch_01.mp3");
const punch02 = await audio.load("Audio/punch_02.mp3");
const punch03 = await audio.load("Audio/punch_03.mp3");

let totalPunchClicks = 0;
function playPunchSound() {
  totalPunchClicks++;
  if (totalPunchClicks <= 10) {
    // jouer punch_01 pour les 10 premiers clics
    punch01.play({
      rate: 0.95 + Math.random() * 0.1,
      volume: 0.7 + Math.random() * 0.3,
    });
  } else {
    // ensuite: aléatoire entre punch_02 et punch_03
    const choose = Math.random() < 0.5 ? punch02 : punch03;
    choose.play({
      rate: 0.95 + Math.random() * 0.1,
      volume: 0.7 + Math.random() * 0.3,
    });
  }
}

// listener pour compter les clics sur la punchbag (zone canvas)
canvas.addEventListener("pointerdown", (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY);

  // avant détachement : clics sur l'image accrochée
  if (!punchDetached) {
    if (rectDragTarget && rectDragTarget.contains(p.x, p.y)) {
      // audio punch
      playPunchSound();

      punchClickCount++;
      console.log("punch clicks (pre-detach):", punchClickCount);
      if (punchClickCount >= 10) detachChainAndPunch();
    }
    return;
  }

  // après détachement : clics sur l'image posée
  if (punchDetached && punchLanded) {
    const left = punchPhysics.x - rectW / 2;
    const top = punchPhysics.y;
    if (
      p.x >= left &&
      p.x <= left + rectW &&
      p.y >= top &&
      p.y <= top + rectH
    ) {
      // audio punch
      playPunchSound();

      postLandClickCount++;
      console.log(
        "punch clicks (post-land):",
        postLandClickCount,
        "stage:",
        punchStage
      );

      const threshold = STAGE_THRESHOLDS[punchStage];
      if (threshold && postLandClickCount >= threshold) {
        swapToStage(punchStage + 1);
      }
    }
  }
});

// fonction de détachement
function detachChainAndPunch() {
  if (punchDetached) return;
  punchDetached = true;
  // libérer l'ancrage du haut de la chaîne
  if (chain && chain.bodies && chain.bodies.length > 0) {
    chain.bodies[0].isFixed = false;
    // s'assurer que le dernier maillon n'est pas fixé
    chain.bodies[chain.bodies.length - 1].isFixed = false;
  }
  // initialiser la physique simple pour la punchbag à la position actuelle visible
  const last = chain.bodies[chain.bodies.length - 1];
  punchPhysics.x = last.positionX;
  punchPhysics.y = last.positionY; // top of image will be at this y
  punchPhysics.vx = 0;
  punchPhysics.vy = 0;

  console.log("Punchbag detached — chain and image now fall");
}

// --- créer d'abord le drag object du rectangle (priorité dans l'ordre d'enregistrement) ---
dragManager.createDragObject({
  target: rectDragTarget,
  // utiliser le nom attendu par DragManager
  isOverlapping: (x, y) => rectDragTarget.contains(x, y),
  onStartDrag: () => {
    rectDragging = true;
    console.log("Started dragging rectangle");
    chain.bodies[chain.bodies.length - 1].isFixed = true;
  },
  onStopDrag: () => {
    rectDragging = false;
    chain.bodies[chain.bodies.length - 1].isFixed = false;
  },
});

// hit margin pour éviter le flicker quand on frôle le bord
const RECT_HIT_MARGIN = 6;

// --- création des drag objects pour les maillons : utiliser isOverlapping et refuser si pointer dans le rectangle ---
for (const o of chain.bodies) {
  dragManager.createDragObject({
    target: o,
    // isOverlapping remplace hitTest pour la compatibilité avec DragManager
    isOverlapping: (x, y) => {
      if (rectDragTarget && rectDragTarget.contains) {
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

// Curseur personnalisé (Glove)
const GLOVE_SIZE_PX = 128; // <-- change la taille du curseur ici
const gloveImg = document.getElementById("glove"); // ajouter <img id="glove" src="./assets/Glove.png" style="display:none">
if (gloveImg) gloveImg.style.display = "none";
// cacher le curseur natif sur le canvas
canvas.style.cursor = "none";

// position du pointeur en coords canvas (mise à jour chaque frame)
const pointerPos = { x: -9999, y: -9999 };

run(update);

function update(deltaTime) {
  // permettre à la chaîne de tomber sous le canvas quand elle est détachée
  // (le punchbag continue de "lander" au bas visible du canvas)
  const extraFall = punchDetached
    ? Math.max(rectH || 0, CHAIN_LENGTH_PX || 0) + 200
    : 0;
  physics.bounds = {
    bottom: canvas.height + extraFall,
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

  // mettre à jour la position globale du pointeur (utilisée pour dessiner le glove)
  pointerPos.x = px;
  pointerPos.y = py;

  // IMPORTANT: mettre à jour la position de la target du rectangle AVANT le hit test
  if (!rectDragging) {
    rectDragTarget.positionX = lastBody.positionX;
    rectDragTarget.positionY = lastBody.positionY + rectH / 2;
  }

  // passer les coords converties au dragManager (hit tests utilisent ces mêmes coords)
  dragManager.update(px, py, input.isPressed());

  // si on draggue le rectangle, synchroniser la position du dernier maillon AVANT la mise à jour physique
  if (rectDragging) {
    const last = chain.bodies[chain.bodies.length - 1];
    last.positionX = rectDragTarget.positionX;
    last.positionY = rectDragTarget.positionY - rectH / 2;
  }

  // si punch détachée, simuler sa chute (simple intégrateur)
  if (punchDetached && !punchLanded) {
    const g = physics.gravityY || 1000; // px/s^2
    // integrate velocity
    punchPhysics.vy += g * deltaTime;
    // integrate position
    punchPhysics.y += punchPhysics.vy * deltaTime;
    punchPhysics.x += punchPhysics.vx * deltaTime;

    // collision avec le bas du canvas : on plaque l'image et on stoppe la vélocité
    const bottomY = canvas.height;
    const imageBottom = punchPhysics.y + rectH;
    if (imageBottom >= bottomY) {
      punchPhysics.y = bottomY - rectH;
      punchPhysics.vy = 0;
      punchPhysics.vx = 0;
      punchLanded = true;
      console.log("Punchbag landed");
    }
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

  // dessiner le rectangle / punchbag :
  const rx = lastBody.positionX - rectW / 2;
  const ry = lastBody.positionY; // bord supérieur = point d'ancrage

  if (
    punchImg &&
    punchImg.complete &&
    punchImg.naturalWidth > 0 &&
    rectW > 0 &&
    rectH > 0
  ) {
    if (!punchDetached) {
      // image accrochée : dessiner top-center au lastBody (comme avant)
      ctx.drawImage(punchImg, rx, ry, rectW, rectH);
    } else {
      // punch détachée : dessiner selon punchPhysics (reste droite, pas de rotation)
      ctx.drawImage(
        punchImg,
        punchPhysics.x - rectW / 2,
        punchPhysics.y,
        rectW,
        rectH
      );
    }
  }

  // dessiner le curseur gant (en dernier, au dessus de tout)
  if (gloveImg && gloveImg.complete && gloveImg.naturalWidth > 0) {
    // calculer taille en respectant le ratio de l'image
    const scale = GLOVE_SIZE_PX / gloveImg.naturalWidth;
    const gw = Math.max(1, Math.round(gloveImg.naturalWidth * scale));
    const gh = Math.max(1, Math.round(gloveImg.naturalHeight * scale));

    // offset centré (tu peux ajuster ici si tu veux que le doigt pointe ailleurs)
    const gx = Math.round(pointerPos.x - gw / 2);
    const gy = Math.round(pointerPos.y - gh / 2);

    ctx.drawImage(gloveImg, gx, gy, gw, gh);
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") {
    finish();
  }
});

// délai avant reset automatique (ms)
const AUTO_RESET_DELAY = 5000;
let autoResetTimer = null;

function resetCanvas() {
  // reset simple : recharger la page — remplace si tu as une fonction de reset propre
  window.location.reload();
}

function scheduleAutoReset() {
  // finish after a short delay for la mise en scène, then schedule full reset
  setTimeout(() => {
    finish();
  }, 3000);

  console.log("Scheduling auto-reset in", AUTO_RESET_DELAY, "ms");
  if (autoResetTimer) clearTimeout(autoResetTimer);
  autoResetTimer = setTimeout(resetCanvas, AUTO_RESET_DELAY);
}
