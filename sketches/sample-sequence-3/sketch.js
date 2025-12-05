import { createEngine } from "../_shared/engine.js";

// ajouter `audio` depuis l'engine
const { renderer, run, finish, audio } = createEngine();
const { ctx, canvas } = renderer;

run(update);

// --- paramètres modifiables ---
const PIXEL = 16; // offscreen pixel art size (16-bit look)
const ballRenderRadius = 46; // render radius in pixels
const gravity = 1400; // px/s^2
const restitution = 0.78; // wall/bounce base restitution
const bottomBoost = 1.15; // extra bounce factor when hitting bottom
const friction = 0.998; // in-air damping
const stopSpeed = 20; // below this speed, ball considered stopped

// auto-reset après X ms (modifier ici)
const AUTO_RESET_DELAY = 8000; // ms — délai avant réinitialisation du canvas

// --- état ---
let W = canvas.width;
let H = canvas.height;

function resize() {
  W = canvas.width = canvas.clientWidth;
  H = canvas.height = canvas.clientHeight;
}
window.addEventListener("resize", resize);
resize();

// offscreen pixel ball
const pixelCanvas = document.createElement("canvas");
pixelCanvas.width = PIXEL;
pixelCanvas.height = PIXEL;
const pctx = pixelCanvas.getContext("2d");
function makePixelBall() {
  pctx.clearRect(0, 0, PIXEL, PIXEL);
  pctx.fillStyle = "white";
  pctx.beginPath();
  pctx.arc(PIXEL / 2, PIXEL / 2, PIXEL / 2 - 1, 0, Math.PI * 2);
  pctx.fill();
}
makePixelBall();

// base position (middle-left)
const baseX = () => Math.floor(W * 0.18);
const baseY = () => Math.floor(H * 1);

let ball = {
  x: baseX(),
  y: baseY(),
  r: ballRenderRadius,
  vx: 0,
  vy: 0,
};

// pointer interaction
let isDragging = false;
let pointerId = null;
const recent = [];

canvas.style.touchAction = "none";
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);

  // si le rendu final est terminé, un clic sur le rond (centre si finalTraceCanvas) réinitialise
  if (final.done) {
    const centerX = finalTraceCanvas ? W / 2 : ball.x;
    const centerY = finalTraceCanvas ? H / 2 : ball.y;
    const hitRadius = finalTraceCanvas
      ? Math.max(finalTraceCanvas.w, finalTraceCanvas.h) / 2
      : ball.r + 8;
    const dx = px - centerX;
    const dy = py - centerY;
    if (Math.hypot(dx, dy) <= hitRadius) {
      resetCanvas();
      return;
    }
  }

  const dx = px - ball.x;
  const dy = py - ball.y;
  if (Math.hypot(dx, dy) <= ball.r + 6) {
    // SI la balle est en simulation (lancée) et que l'animation finale n'est pas affichée,
    // un simple clic sur la balle recharge le canvas.
    if (simulating && !final.active && !final.done) {
      resetCanvas();
      return;
    }

    isDragging = true;
    pointerId = e.pointerId;
    canvas.setPointerCapture(pointerId);
    recent.length = 0;
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!isDragging || e.pointerId !== pointerId) return;
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  ball.x = px;
  ball.y = py;
  recent.push({ x: px, y: py, t: performance.now() });
  while (recent.length > 8) recent.shift();
});
canvas.addEventListener("pointerup", (e) => {
  if (!isDragging || e.pointerId !== pointerId) return;
  isDragging = false;
  canvas.releasePointerCapture(pointerId);
  pointerId = null;

  // compute throw velocity (défaut 0 si pas assez de points)
  ball.vx = 0;
  ball.vy = 0;
  if (recent.length >= 2) {
    const a = recent[0];
    const b = recent[recent.length - 1];
    const dt = Math.max((b.t - a.t) / 1000, 0.001);
    ball.vx = (b.x - a.x) / dt;
    ball.vy = (b.y - a.y) / dt;
  }

  // Si au tout début (aucun rebond) et que le déplacement effectué est très petit,
  // on ajoute un léger nudge vers la droite pour que la balle "parte" légèrement.
  const dragDist = Math.hypot(ball.x - baseX(), ball.y - baseY());
  const releaseSpeed = Math.hypot(ball.vx, ball.vy);
  const smallMoveThreshold = 12; // px — considérer comme "très peu" déplacé
  const smallSpeedThreshold = 80; // px/s — vitesse de release considérée faible
  const initialNudge = 120; // px/s ajouté vers la droite

  if (
    bottomBounces === 0 &&
    !final.active &&
    !recording &&
    dragDist <= smallMoveThreshold &&
    releaseSpeed <= smallSpeedThreshold
  ) {
    ball.vx += initialNudge;
  }

  // start physics simulation after release (ball figée au départ tant que non manipulée)
  simulating = true;
});
canvas.addEventListener("pointercancel", () => {
  isDragging = false;
  pointerId = null;
});

// trail
const trail = [];

// bounce tracking (bottom-only consecutive bounces)
let bottomBounces = 0;
let lastTouchedBottom = false;

// simulation start flag: balle figée au début tant que false
let simulating = false;

// final '3' state
let final = {
  active: false,
  animStart: 0,
  animDuration: 900,
  done: false,
};

// timer auto-reset
let autoResetTimer = null;

// --- nouvel état pour enregistrement de la trainée formant le '3' ---
let recording = false; // true entre 1er et 3ème rebond
let recordStarted = false; // devient true au 1er rebond
let recordCanvas = null;
let recordCtx = null;
let recordBounds = {
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
};
let finalTraceCanvas = null; // image cropée de la trace enregistrée

function startRecording() {
  recordCanvas = document.createElement("canvas");
  recordCanvas.width = W;
  recordCanvas.height = H;
  recordCtx = recordCanvas.getContext("2d");
  // keep full-resolution, draw with pixel look
  recordCtx.clearRect(0, 0, W, H);
  recordCtx.fillStyle = "white";
  recordCtx.imageSmoothingEnabled = false;
  recordCtx.globalCompositeOperation = "source-over";
  recordBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  recording = true;
  recordStarted = true;

  // start visual trail at the same time and ensure it's empty
  trail.length = 0;
  // record the current position immediately
  recordPoint(ball.x, ball.y);
  trail.push({ x: ball.x, y: ball.y, t: performance.now() });
}

function recordPoint(x, y) {
  if (!recording || !recordCtx) return;
  // draw the same pixel-ball sprite used for on-screen trail to get a coherent "3" trace
  const scale = (ball.r * 2) / PIXEL;
  const drawW = Math.max(2, PIXEL * scale);
  const drawH = Math.max(2, PIXEL * scale);
  recordCtx.drawImage(
    pixelCanvas,
    Math.round(x - drawW / 2),
    Math.round(y - drawH / 2),
    drawW,
    drawH
  );
  // update bounds with padding of half-draw size
  const r = Math.max(2, Math.round(drawW / 2));
  recordBounds.minX = Math.min(recordBounds.minX, x - r);
  recordBounds.minY = Math.min(recordBounds.minY, y - r);
  recordBounds.maxX = Math.max(recordBounds.maxX, x + r);
  recordBounds.maxY = Math.max(recordBounds.maxY, y + r);
}

function stopRecordingAndCreateFinal() {
  recording = false;
  if (!recordCanvas) return;
  // if nothing recorded, bail
  if (
    !isFinite(recordBounds.minX) ||
    !isFinite(recordBounds.minY) ||
    !isFinite(recordBounds.maxX) ||
    !isFinite(recordBounds.maxY)
  ) {
    recordCanvas = null;
    recordCtx = null;
    return;
  }
  // compute crop bounds with some padding
  const pad = 8;
  let minX = Math.max(0, Math.floor(recordBounds.minX - pad));
  let minY = Math.max(0, Math.floor(recordBounds.minY - pad));
  let maxX = Math.min(W, Math.ceil(recordBounds.maxX + pad));
  let maxY = Math.min(H, Math.ceil(recordBounds.maxY + pad));
  let w = Math.max(2, maxX - minX);
  let h = Math.max(2, maxY - minY);

  // LIMIT : éviter que la zone cropée devienne trop large par rapport à la hauteur / écran
  // ajuste ce ratio (0.6) si tu veux une largeur maximale différente
  const maxAllowedW = Math.floor(Math.min(W, H) * 0.6);
  if (w > maxAllowedW) {
    const cx = Math.floor((minX + maxX) / 2);
    let newMinX = Math.max(0, cx - Math.floor(maxAllowedW / 2));
    let newMaxX = Math.min(W, newMinX + maxAllowedW);
    // re-ajuste si on a heurté la bordure droite
    newMinX = Math.max(0, newMaxX - maxAllowedW);
    minX = newMinX;
    maxX = newMaxX;
    w = maxAllowedW;
  }

  // create cropped canvas
  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  const cctx = crop.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  cctx.clearRect(0, 0, w, h);
  cctx.drawImage(recordCanvas, minX, minY, w, h, 0, 0, w, h);

  // optional: enhance contrast / thicken stroke slightly by drawing the crop over itself offset (cheap dilation)
  cctx.globalCompositeOperation = "lighter";
  cctx.globalAlpha = 0.9;
  cctx.drawImage(crop, 1, 0, w, h);
  cctx.drawImage(crop, -1, 0, w, h);
  cctx.globalAlpha = 1;
  cctx.globalCompositeOperation = "source-over";

  // si la trace est très serrée verticalement, on ajoute du padding vertical
  const minDesiredHeight = Math.floor(Math.min(W, H) * 0.28);
  let finalCanvas = crop;
  let finalOx = minX;
  let finalOy = minY;
  if (h < minDesiredHeight) {
    // ne PAS étirer la crop : créer une nouvelle canvas plus haute et y centrer la crop sans scale
    const padded = document.createElement("canvas");
    padded.width = w; // conserver la largeur d'origine
    padded.height = minDesiredHeight;
    const pctx2 = padded.getContext("2d");
    pctx2.imageSmoothingEnabled = false;
    pctx2.clearRect(0, 0, padded.width, padded.height);

    // placer la crop centrée verticalement (sans la redimensionner)
    const dy = Math.floor((padded.height - h) / 2);
    pctx2.drawImage(crop, 0, dy);

    // léger renforcement du trait (optionnel, similaire au traitement précédent)
    pctx2.globalCompositeOperation = "lighter";
    pctx2.globalAlpha = 0.9;
    pctx2.drawImage(padded, 1, 0, w, padded.height);
    pctx2.drawImage(padded, -1, 0, w, padded.height);
    pctx2.globalAlpha = 1;
    pctx2.globalCompositeOperation = "source-over";

    // on conserve la largeur d'origine ; l'origine y affichée doit être décalée
    finalCanvas = padded;
    finalOx = minX;
    finalOy = Math.max(0, minY - dy);
  }

  finalTraceCanvas = {
    canvas: finalCanvas,
    ox: finalOx,
    oy: finalOy,
    w: finalCanvas.width,
    h: finalCanvas.height,
  };
  // clean up recordCanvas reference
  recordCanvas = null;
  recordCtx = null;
}

// helper: abort recording and reset bottom-sequence state
function abortRecordingAndResetSequence() {
  recording = false;
  recordStarted = false;
  recordCanvas = null;
  recordCtx = null;
  recordBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  bottomBounces = 0;
  lastTouchedBottom = false;

  // clear visual trail and any pending final trace when any non-bottom wall is touched
  trail.length = 0;
  finalTraceCanvas = null;
}

// schedule / reset helpers
function resetCanvas() {
  // annule timer éventuel
  if (autoResetTimer) {
    clearTimeout(autoResetTimer);
    autoResetTimer = null;
  }
  // réinitialise tous les états pertinents
  final = { active: false, animStart: 0, animDuration: 900, done: false };
  finalTraceCanvas = null;
  recording = false;
  recordStarted = false;
  recordCanvas = null;
  recordCtx = null;
  recordBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  trail.length = 0;
  bottomBounces = 0;
  lastTouchedBottom = false;
  simulating = false;
  // repositionne la balle au point de base
  ball.x = baseX();
  ball.y = baseY();
  ball.vx = 0;
  ball.vy = 0;
}

window.addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") {
    finish();
  }
});

function scheduleAutoReset() {
  setTimeout(() => {
    finish();
  }, 3000);
  console.log("Scheduling auto-reset in", AUTO_RESET_DELAY, "ms");
  if (autoResetTimer) clearTimeout(autoResetTimer);
  autoResetTimer = setTimeout(resetCanvas, AUTO_RESET_DELAY);
}

// --- Audio: boings ---
// Assure-toi que les fichiers existent aux chemins indiqués
(async () => {
  try {
    const boingBottom = await audio.load("Audio/boing_01.mp3");
    const boingWall = await audio.load("Audio/boing_02.mp3");
    // expose via closures ou variables externes
    window._boingBottom = boingBottom;
    window._boingWall = boingWall;
  } catch (err) {
    console.error("Audio load failed:", err);
  }
})();

// et dans tes fonctions:
function playBoingBottom() {
  if (!window._boingBottom) return;
  window._boingBottom.play({ rate: 0.95 + Math.random() * 0.1, volume: 0.7 });
}
function playBoingWall() {
  if (!window._boingWall) return;
  window._boingWall.play({ rate: 0.95 + Math.random() * 0.1, volume: 0.7 });
}

function update(dt) {
  // dt in seconds

  // update sizes (engine may have resized)
  W = canvas.width;
  H = canvas.height;

  // if recording canvas exists but size changed, keep it large enough (simple approach: ignore resize mid-record)

  // floating behaviour removed — ball maintenant simulée seulement si simulating === true
  if (!isDragging && !final.active && simulating) {
    // integrate
    ball.vy += gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.vx *= friction;
    ball.vy *= friction;

    // update record with current position if recording
    if (recording) recordPoint(ball.x, ball.y);

    // collisions with walls
    // left
    if (ball.x - ball.r < 0) {
      ball.x = ball.r;
      ball.vx = -ball.vx * restitution;
      // touching a non-bottom wall => abort the bottom sequence
      abortRecordingAndResetSequence();
      // son pour mur (gauche)
      playBoingWall();
    }
    // right
    if (ball.x + ball.r > W) {
      ball.x = W - ball.r;
      ball.vx = -ball.vx * restitution;
      // touching a non-bottom wall => abort the bottom sequence
      abortRecordingAndResetSequence();
      // son pour mur (droite)
      playBoingWall();
    }
    // top
    if (ball.y - ball.r < 0) {
      ball.y = ball.r;
      ball.vy = -ball.vy * restitution;
      // touching a non-bottom wall => abort the bottom sequence
      abortRecordingAndResetSequence();
      // son pour mur (haut)
      playBoingWall();
    }
    // bottom
    const touchingBottom = ball.y + ball.r >= H - 0.5;
    if (touchingBottom) {
      if (!lastTouchedBottom) {
        // bounce event
        // apply stronger bounce for bottom
        ball.y = H - ball.r;
        ball.vy = -Math.abs(ball.vy) * restitution * bottomBoost;
        // son pour bas
        playBoingBottom();

        bottomBounces++;
        lastTouchedBottom = true;

        // petit coup vers la droite au 1er rebond si la vitesse horizontale est très faible
        // (permet à la balle "tombée" sans impulsion de partir légèrement à droite)
        if (bottomBounces === 1) {
          const overallSpeed = Math.hypot(ball.vx, ball.vy);
          if (Math.abs(ball.vx) < 60 && overallSpeed < 250) {
            ball.vx += 120; // ajuster la valeur si tu veux plus/moins de poussée
          }
        }

        // start recording at first bottom bounce
        if (!recordStarted && bottomBounces === 1) {
          startRecording();
          // ensure first point recorded
          recordPoint(ball.x, ball.y);
        }

        // stop recording and create final trace at 3rd consecutive bottom bounce
        if (recording && bottomBounces >= 3) {
          // also record this bounce point
          recordPoint(ball.x, ball.y);
          stopRecordingAndCreateFinal();
          // trigger final animation
          final.active = true;
          final.animStart = performance.now();
        }
      } else {
        // keep on ground
        ball.y = H - ball.r;
        if (Math.abs(ball.vy) < 40) ball.vy = 0;
      }
    } else {
      // left/ right / top collisions already reset sequence.
      // leaving bottom area without touching bottom doesn't change bottomBounces,
      // but if any non-bottom collision occurs it will have already been reset.
      lastTouchedBottom = false;
    }

    // if ball almost stopped, reset to base and stop simulation (balle figée de nouveau)
    const speed = Math.hypot(ball.vx, ball.vy);
    if (
      speed < stopSpeed &&
      Math.abs(ball.y - (H - ball.r)) < 2 &&
      !isDragging
    ) {
      // small delay to let it settle
      ball.x = baseX();
      ball.y = baseY();
      ball.vx = 0;
      ball.vy = 0;
      bottomBounces = 0;
      simulating = false; // remise à l'état figé
      // clear recording state if aborted
      abortRecordingAndResetSequence();
    }
  }

  // trail recording (visual trail shown normally)
  const now = performance.now();
  // n'enregistrer la trainée visuelle que si on est en enregistrement (après 1er rebond bas)
  if (recording) {
    trail.push({ x: ball.x, y: ball.y, t: now });
  }
  while (trail.length && now - trail[0].t > 700) trail.shift();

  // render
  render();
}

function render() {
  // clear
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, W, H);

  // draw trail (less luminous)
  for (let i = 0; i < trail.length; i++) {
    const it = trail[i];
    const age = performance.now() - it.t;
    const a = 1 - age / 700;
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a * 0.18; // trail less luminous
    ctx.imageSmoothingEnabled = false;
    const scale = (ball.r * 2) / PIXEL;
    ctx.drawImage(
      pixelCanvas,
      it.x - ball.r,
      it.y - ball.r,
      PIXEL * scale,
      PIXEL * scale
    );
    ctx.restore();
  }

  // draw ball (on top)
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  const scale = (ball.r * 2) / PIXEL;
  ctx.drawImage(
    pixelCanvas,
    ball.x - ball.r,
    ball.y - ball.r,
    PIXEL * scale,
    PIXEL * scale
  );
  ctx.restore();

  // if a finalTraceCanvas exists and final not yet active, optionally show it at its original place (preview)
  if (finalTraceCanvas && !final.active) {
    // draw a faint preview where it was recorded
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(
      finalTraceCanvas.canvas,
      finalTraceCanvas.ox,
      finalTraceCanvas.oy
    );
    ctx.restore();
  }

  // final '3' animation: draw recorded trace (cropped image) and animate it to center while rotating
  if (final.active && finalTraceCanvas) {
    const now = performance.now();
    const t = Math.min(1, (now - final.animStart) / final.animDuration);
    // rotation unchanged (début 0 -> fin +PI/2)
    const rotation = (Math.PI / 2) * t;

    // position interpolation : depuis l'emplacement d'enregistrement vers le centre
    const sx0 = finalTraceCanvas.ox + finalTraceCanvas.w / 2;
    const sy0 = finalTraceCanvas.oy + finalTraceCanvas.h / 2;
    const sx = lerp(sx0, W / 2, t);
    const sy = lerp(sy0, H / 2, t);

    // NOTE: plus aucune mise à l'échelle — on dessine la trace telle qu'elle a été enregistrée
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rotation);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      finalTraceCanvas.canvas,
      -finalTraceCanvas.w / 2,
      -finalTraceCanvas.h / 2,
      finalTraceCanvas.w,
      finalTraceCanvas.h
    );
    ctx.restore();

    if (t === 1) {
      final.done = true; // keep displayed
      // lance l'auto-reset (modifiable via AUTO_RESET_DELAY)
      scheduleAutoReset();
    }
  }

  // if final active but no recorded image (edge case), fall back to text
  if (final.active && !finalTraceCanvas) {
    const now = performance.now();
    const t = Math.min(1, (now - final.animStart) / final.animDuration);
    // swap fallback rotation too: start 0, end +PI/2
    const rotation = (Math.PI / 2) * t;
    const sx = lerp(ball.x, W / 2, t);
    const sy = lerp(ball.y, H / 2, t);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rotation);
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.floor(
      Math.min(W, H) * 0.45
    )}px Helvetica, Arial, sans-serif`;
    ctx.fillText("3", 0, 0);
    ctx.restore();
    if (t === 1) {
      final.done = true;
      scheduleAutoReset();
    }
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// initial state
ball.x = baseX();
ball.y = baseY();
