/**
 * The difficulty cut, offered as a range: two named ends on one line, both in
 * halves, both drawn as plain selects.
 *
 * Selects rather than anything cleverer because the scale has only ten stops:
 * a slider at this size is fiddlier than a list of ten numbers, and a select
 * is the one control every keyboard and screen reader already knows. Swapped
 * ends are the rule's problem (`filterByHeat` puts them in order), so the
 * control never refuses a choice.
 *
 * Each end says its own name — "Min Difficulty", "Max Difficulty" — rather
 * than being two boxes joined by "to". A word each is what makes them
 * readable in either order, and it is what a screen reader was being given
 * privately by `aria-label` anyway.
 */

import { HEAT_STOPS, type HeatRange } from "./level-filter.js";

export function createHeatRange(options: {
  value: HeatRange;
  onChange: (next: HeatRange) => void;
}): { element: HTMLElement } {
  const element = document.createElement("span");
  element.className = "heat-range";

  let chosen = { ...options.value };

  /** One end: its name, and the ten stops it may take. */
  const end = (which: "min" | "max", name: string): HTMLElement => {
    const held = document.createElement("span");
    held.className = "heat-range-end";

    const words = document.createElement("span");
    words.className = "heat-range-label";
    words.textContent = `${name}:`;

    const select = document.createElement("select");
    select.className = "heat-range-pick";
    select.setAttribute("aria-label", name);
    for (const stars of HEAT_STOPS) {
      const option = document.createElement("option");
      option.value = String(stars);
      // One decimal always — "0.5", "3.0" — so the ten figures are the same
      // width in the list and read as points on one scale rather than as a
      // mix of whole numbers and halves. The same shape `displayedDifficulty`
      // prints on a card.
      //
      // A pepper beside the figure, so the number is read as a heat and not
      // as a bar count. The emoji rather than the card's drawn pepper because
      // an <option> holds text and nothing else — no markup, no svg.
      option.textContent = `${stars.toFixed(1)} 🌶️`;
      select.append(option);
    }
    select.value = String(chosen[which]);
    select.addEventListener("change", () => {
      chosen = { ...chosen, [which]: Number(select.value) };
      options.onChange(chosen);
    });

    held.append(words, select);
    return held;
  };

  element.append(end("min", "Min Difficulty"), end("max", "Max Difficulty"));
  return { element };
}
