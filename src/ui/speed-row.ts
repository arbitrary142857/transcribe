/**
 * The speed control, one build for both pages.
 *
 * The slider walks the speeds the player offers rather than a range of its
 * own: YouTube rounds anything else to the nearest speed it knows, so a
 * free-running slider would promise a speed it could not play. The dots under
 * the track say exactly that — this is a row of stops, not a dial — one dot
 * per speed the video actually has.
 */
export type SpeedRow = {
  readonly element: HTMLElement;
  update(rates: readonly number[], rate: number, ready: boolean): void;
};

export function createSpeedRow(onRate: (rate: number) => void): SpeedRow {
  const element = document.createElement("div");
  element.className = "playback-speed";

  const label = document.createElement("span");
  label.className = "playback-label";
  label.textContent = "Speed";

  const track = document.createElement("div");
  track.className = "playback-speed-track";

  const dots = document.createElement("div");
  dots.className = "playback-speed-dots";
  dots.setAttribute("aria-hidden", "true");

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.step = "1";
  slider.className = "playback-speed-slider";
  slider.setAttribute("aria-label", "Playback speed");

  const value = document.createElement("span");
  value.className = "playback-speed-value";

  let rates: readonly number[] = [1];
  slider.addEventListener("input", () => {
    const rate = rates[Number(slider.value)];
    if (rate !== undefined) onRate(rate);
  });

  track.append(dots, slider);
  element.append(label, track, value);

  return {
    element,
    update(nextRates, rate, ready) {
      const changed =
        nextRates.length !== rates.length ||
        nextRates.some((candidate, i) => candidate !== rates[i]);
      rates = nextRates.length > 0 ? nextRates : [1];

      if (changed || dots.childElementCount !== rates.length) {
        dots.replaceChildren(
          ...rates.map((stop) => {
            const dot = document.createElement("span");
            // Full speed is the stop that means "as written", so it is the one
            // marked: bigger and ringed, the home position on the track.
            dot.className =
              stop === 1 ? "playback-speed-dot is-unit" : "playback-speed-dot";
            return dot;
          }),
        );
      }

      slider.max = String(rates.length - 1);
      const index = rates.indexOf(rate);
      slider.value = String(index >= 0 ? index : rates.indexOf(1));
      slider.disabled = !ready;
      value.textContent = `${rate}×`;
    },
  };
}
