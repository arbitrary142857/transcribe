/**
 * The difficulty cut, offered as a range: from one figure to another, both
 * ends in halves, both drawn as plain selects.
 *
 * Two selects rather than anything cleverer because the scale has only ten
 * stops: a slider at this size is fiddlier than a list of ten numbers, and a
 * select is the one control every keyboard and screen reader already knows.
 * Swapped ends are the rule's problem (`filterByHeat` puts them in order),
 * so the control never refuses a choice.
 */

import { HEAT_STOPS, type HeatRange } from "./level-filter.js";

export function createHeatRange(options: {
  value: HeatRange;
  onChange: (next: HeatRange) => void;
}): { element: HTMLElement } {
  const element = document.createElement("span");
  element.className = "heat-range";

  const label = document.createElement("span");
  label.className = "heat-range-label";
  label.textContent = "Difficulty";

  let chosen = { ...options.value };

  const pick = (which: "min" | "max", name: string): HTMLSelectElement => {
    const select = document.createElement("select");
    select.className = "heat-range-pick";
    select.setAttribute("aria-label", name);
    for (const stars of HEAT_STOPS) {
      const option = document.createElement("option");
      option.value = String(stars);
      option.textContent = String(stars);
      select.append(option);
    }
    select.value = String(chosen[which]);
    select.addEventListener("change", () => {
      chosen = { ...chosen, [which]: Number(select.value) };
      options.onChange(chosen);
    });
    return select;
  };

  const from = pick("min", "Easiest level shown");
  const to = pick("max", "Hottest level shown");

  const dash = document.createElement("span");
  dash.setAttribute("aria-hidden", "true");
  dash.textContent = "–";

  element.append(label, from, dash, to);
  return { element };
}
