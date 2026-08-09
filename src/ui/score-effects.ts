/**
 * What the score does when a check comes back.
 *
 * Two effects, deliberately small. A note that has just been found bursts; a
 * note that is wrong shakes its head. Neither carries information the colour
 * does not already carry — they are there to make the moment land, and the
 * page is still readable with both switched off, which is exactly what happens
 * under `prefers-reduced-motion`.
 *
 * They are built differently, and the difference is forced rather than chosen.
 *
 * The **shake** moves the note itself, so it has to be the note itself:
 * `StaveNote.draw()` wraps each note in an svg group carrying its id, so
 * `getSVGElement()` hands one back and a css class does the rest.
 *
 * The **burst** cannot be, because the score has every child replaced on each
 * redraw — which happens on every mouse move, to paint hover — so anything put
 * inside the svg is swept away within a frame. It goes in a layer over the
 * score instead, beside the playhead, which is there for the same reason.
 */

import type { MelodyRenderResult } from "../render/render-melody.js";
import {
  measureScore,
  NO_SCORE,
  wantsLessMotion,
  type ScoreMetrics,
} from "./score-overlay.js";

/** Dots per burst. Enough to read as a burst, few enough to cost nothing. */
const PARTICLE_COUNT = 6;

/**
 * How long hover repaints are held off after an effect starts.
 *
 * Long enough to cover both animations. Without it, moving the pointer onto
 * the stave mid-shake redraws the score, replaces the group the animation was
 * running on, and cuts the effect off — most likely exactly when someone leans
 * in to look at what went wrong.
 */
export const EFFECT_MS = 500;

export type ScoreEffects = {
  /** Take on the score as it now stands, after a redraw. */
  onScore(rendered: MelodyRenderResult): void;
  /** Shake these events, and burst over those. Both are event indices. */
  play(effects: { shake: Iterable<number>; burst: Iterable<number> }): void;
  destroy(): void;
};

export function createScoreEffects(container: HTMLElement): ScoreEffects {
  const layer = document.createElement("div");
  layer.className = "score-effects";
  container.append(layer);

  let rendered: MelodyRenderResult | undefined;
  let metrics: ScoreMetrics = NO_SCORE;

  function burstAt(index: number): void {
    const anchor = rendered?.anchors[index];
    const note = rendered?.notes[index];
    if (!anchor || !note) return;

    // The middle of the *notehead*, which is not the middle of the note: the
    // hit region takes in the stem, so centring on it put the burst somewhere
    // up the stalk rather than on the head that just turned green. These two
    // are the notehead's own extremes, and for a single note they are equal.
    const { yTop, yBottom } = note.getNoteHeadBounds();
    if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) return;

    const { scale, offsetX, offsetY } = metrics;
    const x = offsetX + anchor.x * scale;
    const y = offsetY + ((yTop + yBottom) / 2) * scale;

    const burst = document.createElement("div");
    burst.className = "note-burst";
    burst.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    for (let dot = 0; dot < PARTICLE_COUNT; dot++) {
      const particle = document.createElement("span");
      particle.style.setProperty(
        "--angle",
        `${(360 / PARTICLE_COUNT) * dot}deg`,
      );
      burst.append(particle);
    }

    // The dots all share one duration, so the first `animationend` to bubble up
    // is the moment the whole burst is spent.
    burst.addEventListener("animationend", () => burst.remove(), {
      once: true,
    });
    layer.append(burst);
  }

  return {
    onScore(next) {
      rendered = next;
      metrics = measureScore(container, next.svg);
    },

    play({ shake, burst }) {
      if (wantsLessMotion()) return;

      for (const index of shake) {
        const group = rendered?.notes[index]?.getSVGElement();
        if (!group) continue;
        group.classList.add("is-shaking");
        group.addEventListener(
          "animationend",
          () => group.classList.remove("is-shaking"),
          { once: true },
        );
      }

      for (const index of burst) {
        burstAt(index);
      }
    },

    destroy() {
      layer.remove();
    },
  };
}
