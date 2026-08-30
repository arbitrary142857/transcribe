/**
 * The controls that cut a list down, and where they live.
 *
 * On the catalog they live behind a funnel button, in a box of their own.
 * Four cuts laid out along the top of a page is four questions asked of
 * somebody who came to look at levels; behind one button it is a page of
 * levels with a way to narrow it, which is what it actually is. Nothing here
 * is remembered between visits — a filter is a question asked now — so the
 * box always opens on the whole catalog unless it was narrowed a moment ago.
 *
 * The two cuts about *you* — the levels you hearted, the levels you wrote —
 * are only offered to somebody signed in, because signed out they cut
 * nothing and a switch that does nothing is worse than no switch.
 *
 * Changes take effect as they are made rather than on a Done button: the box
 * has no commitment in it, and the list behind it is already redrawn by the
 * time it closes. The way out is the corner ×, Escape, or the backdrop.
 *
 * On the author's own page there is no box: the one cut is the three
 * statuses, and three switches take less room than the button to reveal them.
 */

import {
  PLAY_STATUSES,
  WHOLE_SCALE,
  WORK_STATUSES,
  type CatalogFilter,
  type Chosen,
  type WorkBucket,
} from "./level-filter.js";
import { createHeatRange } from "./heat-range.js";
import { funnelIcon, heartFillIcon } from "./icons.js";
import { openInfoModal } from "./modal.js";
import { createSwitch } from "./switch.js";

/**
 * "Show ♥ Levels Only", with the site's own heart in it.
 *
 * The heart is the card's heart — the filled weight, in the same pink — so
 * the switch and the figure it cuts the list by are visibly the same thing.
 * An emoji stood here first and was a different heart in every font.
 */
function heartedLabel(): HTMLElement {
  const words = document.createElement("span");

  const heart = document.createElement("span");
  heart.className = "switch-heart";
  heart.setAttribute("aria-hidden", "true");
  heart.innerHTML = heartFillIcon();

  words.append("Show ", heart, " Levels Only");
  return words;
}

/** A row of controls with no words of their own: each says its own piece. */
function switchRow(...controls: readonly Node[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "filter-row filter-row-bare";

  const held = document.createElement("div");
  held.className = "filter-row-controls";
  held.append(...controls);

  row.append(held);
  return row;
}

/**
 * The three switches that say which statuses to show, wherever they are
 * drawn: inside the catalog's box, and along the top of the author's page.
 */
function statusSwitches<K extends string>(
  statuses: readonly { value: K; label: string }[],
  chosen: Chosen<K>,
  onChange: (next: Chosen<K>) => void,
): HTMLElement[] {
  let held = { ...chosen };
  return statuses.map((status) =>
    createSwitch({
      label: status.label,
      title: `Show levels that are ${status.label}`,
      checked: held[status.value],
      onChange(on) {
        held = { ...held, [status.value]: on };
        onChange(held);
      },
    }).element,
  );
}

/**
 * The funnel, and the box it opens.
 *
 * The button wears the accent while anything is narrowed: a filter you forgot
 * you set is a catalog that looks emptier than it is, and the only clue used
 * to be the levels that were not there.
 */
export function createCatalogFilters(options: {
  /** Where the box opens from, and what the list is currently cut by. */
  filter: CatalogFilter;
  /** Whether the two cuts about the viewer's own doings are worth offering. */
  signedIn: boolean;
  /** Called as each switch moves; the list redraws behind the box. */
  onChange: (filter: CatalogFilter) => void;
}): { element: HTMLElement } {
  let filter = options.filter;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "filter-button";
  button.title = "Choose which levels to show";
  button.setAttribute("aria-label", "Filter levels");

  const glyph = document.createElement("span");
  glyph.className = "filter-button-icon";
  glyph.setAttribute("aria-hidden", "true");
  glyph.innerHTML = funnelIcon();

  const word = document.createElement("span");
  word.textContent = "Filter";

  button.append(glyph, word);

  function settle(next: CatalogFilter): void {
    filter = next;
    button.classList.toggle("is-narrowed", isNarrowed(filter));
    options.onChange(filter);
  }

  button.addEventListener("click", () => {
    openInfoModal({
      className: "filter-modal",
      fill() {
        const heading = document.createElement("h2");
        heading.className = "modal-title filter-modal-title";
        heading.textContent = "Filter Levels";

        // No words above either row: "Min Difficulty" and the status names
        // are their own labels, and a heading over each said the same thing
        // twice.
        const rows: HTMLElement[] = [
          switchRow(
            createHeatRange({
              value: filter.heat,
              onChange: (heat) => settle({ ...filter, heat }),
            }).element,
          ),
          switchRow(
            ...statusSwitches(PLAY_STATUSES, filter.statuses, (statuses) =>
              settle({ ...filter, statuses }),
            ),
          ),
        ];

        // Both cuts about the viewer's own doings, on one line: they are two
        // halves of the same question — which of everybody's levels are
        // yours in some way.
        if (options.signedIn) {
          rows.push(
            switchRow(
              createSwitch({
                label: heartedLabel(),
                spoken: "Show only levels you have hearted",
                checked: filter.heartedOnly,
                onChange: (on) => settle({ ...filter, heartedOnly: on }),
              }).element,
              createSwitch({
                label: "Show My Levels",
                checked: filter.showOwn,
                onChange: (on) => settle({ ...filter, showOwn: on }),
              }).element,
            ),
          );
        }

        return [heading, ...rows];
      },
    });
  });

  button.classList.toggle("is-narrowed", isNarrowed(filter));
  return { element: button };
}

/** Whether the box is cutting anything, for the mark on the button. */
function isNarrowed(filter: CatalogFilter): boolean {
  return (
    filter.heartedOnly ||
    !filter.showOwn ||
    !Object.values(filter.statuses).every(Boolean) ||
    filter.heat.min > WHOLE_SCALE.min ||
    filter.heat.max < WHOLE_SCALE.max
  );
}

/** The author's page: the three statuses, in the open. */
export function createWorkFilters(options: {
  statuses: Chosen<WorkBucket>;
  onChange: (statuses: Chosen<WorkBucket>) => void;
}): { element: HTMLElement } {
  const element = document.createElement("div");
  element.className = "work-filters";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "Which of your transcriptions to show");
  element.append(
    ...statusSwitches(WORK_STATUSES, options.statuses, options.onChange),
  );
  return { element };
}
