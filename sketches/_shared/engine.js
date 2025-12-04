import { createAudio } from "./engine/audio.js";
import { createRenderer } from "./engine/renderer.js";
import { createInput } from "./engine/input.js";
import { createLoop } from "./engine/loop.js";
import { createIframeClient } from "./engine/iframeClient.js";
import * as math from "./engine/math.js";

export function createEngine() {
  const pixelRatio = window.devicePixelRatio;

  const renderer = createRenderer(pixelRatio);
  document.body.appendChild(renderer.canvas);
  renderer.resize();

  const audio = createAudio();
  const input = createInput(pixelRatio);

  const iframeClient = createIframeClient();

  let activeLoop;
  function run(updateFunction) {
    if (activeLoop !== undefined) {
      throw "Loop already started";
    }

    activeLoop = createLoop((dt) => {
      if (iframeClient.getState() === iframeClient.STATE.WAITING) return;

      renderer.resize();
      renderer.ctx.reset();

      updateFunction(dt);
      input.update();
    });
  }

  let finished = false;

  function finish() {
    console.log("Finish called");

    if (activeLoop) {
      activeLoop.stop();
      activeLoop = undefined;
    }

    if (!finished) {
      iframeClient.sendFinishSignal();
      finished = true;
    }
  }

  return {
    renderer,
    audio,
    input,
    finish,
    run,
    math,
    pixelRatio,
  };
}
