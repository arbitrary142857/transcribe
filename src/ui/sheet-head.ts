/**
 * The masthead of the sheet: what the piece is called, what it is from, and
 * who wrote it down.
 *
 * Laid out the way printed music lays it out — the title centred and large,
 * the subtitle centred and smaller under it, the attribution against the
 * right margin above the first stave — because that is where a reader's eye
 * already goes looking for those three things.
 *
 * It sits inside the scrolling sheet rather than in a bar above it, which
 * means it scrolls away as the music does. That is the point: it is the head
 * of the page, not a status line about the page. What has to stay in reach —
 * the way to change any of it — lives in the side panel.
 *
 * Built once and mutated. In the editor every keystroke in the details box
 * arrives here, and rebuilding a heading forty times while somebody types
 * their title would be forty layouts of the whole sheet.
 */

export type SheetHeadState = {
  title: string;
  /** Nothing at all when there is none: no line, and no space where one would be. */
  subtitle: string | undefined;
  /**
   * Who to credit, already resolved to a name — the editor asks the account,
   * a puzzle asks the level — or nothing when there is nobody to credit and
   * the line should not appear.
   */
  credit: string | undefined;
};

export type SheetHead = {
  update(state: SheetHeadState): void;
};

export type SheetHeadOptions = {
  /**
   * Open the level's own box. Given only by the play page, and drawn as a
   * small `i` riding the title like a footnote mark — the editor has the
   * Details box for the same facts and needs no second door to them.
   */
  onAbout?: () => void;
};

/** What the title reads when there is not one yet. */
const UNTITLED = "Untitled";

export function createSheetHead(
  element: HTMLElement,
  options: SheetHeadOptions = {},
): SheetHead {
  element.replaceChildren();

  const title = document.createElement("h1");
  title.className = "sheet-title";

  /**
   * The title's own box, which is what the page centres.
   *
   * The `i` that rides it hangs off this rather than following it in the line,
   * so that it cannot shove the words off centre. A title should sit in the
   * middle of its page whether or not there is a box behind it to open.
   *
   * A green tick used to ride here too, on a level you had finished. It was
   * one mark too many on a heading that is the piece's name: the clock says
   * you finished, in green, and so does the button.
   */
  const line = document.createElement("span");
  line.className = "sheet-title-line";

  const titleText = document.createElement("span");
  titleText.className = "sheet-title-text";
  line.append(titleText);

  const marks = document.createElement("span");
  marks.className = "sheet-title-marks";

  if (options.onAbout) {
    const info = document.createElement("button");
    info.type = "button";
    info.className = "sheet-info";
    info.textContent = "i";
    info.title = "About";
    info.setAttribute("aria-label", "About");
    info.addEventListener("click", options.onAbout);
    marks.append(info);
  }

  line.append(marks);
  title.append(line);

  const subtitle = document.createElement("p");
  subtitle.className = "sheet-subtitle";

  const credit = document.createElement("p");
  credit.className = "sheet-credit";

  element.append(title, subtitle, credit);

  return {
    update(state) {
      const named = state.title.trim();
      titleText.textContent = named === "" ? UNTITLED : named;
      // Untitled is a fact rather than a warning, so it is only greyed. The
      // reason Save is unavailable is written under Save.
      titleText.classList.toggle("is-untitled", named === "");

      const under = state.subtitle?.trim() ?? "";
      subtitle.textContent = under;
      // Hidden rather than emptied: an empty paragraph still takes its line,
      // and a piece with no subtitle should have its stave that much higher.
      subtitle.hidden = under === "";

      credit.textContent =
        state.credit === undefined ? "" : `Transcribed by ${state.credit}`;
      credit.hidden = state.credit === undefined;
    },
  };
}
