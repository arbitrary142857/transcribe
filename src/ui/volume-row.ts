/**
 * How loud the video speaks, one build for both panels.
 *
 * The player's own volume control is out of reach wherever the panel drives
 * it — and out of sight entirely where the embed is drawn without its
 * controls — so this is the way to it. There is no volume event in the iframe
 * API, so the slider is the setting rather than a reading of one: it is
 * written from the state only while nobody is holding it, and what it last
 * said is what the video is doing.
 */
export type VolumeRow = {
  readonly element: HTMLElement;
  update(volume: number, ready: boolean): void;
};

export function createVolumeRow(onVolume: (volume: number) => void): VolumeRow {
  const element = document.createElement("div");
  element.className = "playback-volume";

  const label = document.createElement("span");
  label.className = "playback-label";
  label.textContent = "Volume";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.className = "playback-volume-slider";
  slider.setAttribute("aria-label", "Video volume");

  const value = document.createElement("span");
  // The speed row's readout, so the two rows' figures line up in one column.
  value.className = "playback-speed-value";

  slider.addEventListener("input", () => {
    onVolume(Number(slider.value));
    value.textContent = `${slider.value}%`;
  });

  element.append(label, slider, value);

  return {
    element,
    update(volume, ready) {
      // Only while nobody is holding it: writing under a drag throws the thumb.
      if (document.activeElement !== slider) {
        slider.value = String(Math.round(volume));
      }
      value.textContent = `${Math.round(volume)}%`;
      slider.disabled = !ready;
    },
  };
}
