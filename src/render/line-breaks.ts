/**
 * Where the music wraps, and how wide each bar on a line comes out.
 *
 * Bars were once dealt out a fixed number to a line — four on a wide window,
 * two on a narrow one — which is right only when the piece divides by that
 * number. Nine bars came out four, four and one, and the last bar was then
 * justified across a whole system on its own, which is what gave the game
 * away: every line here is stretched to the same width, so a line with too
 * little on it does not end early, it spreads.
 *
 * So the count is not fixed. Each line takes as many bars as its own contents
 * allow, and the breaks are chosen so that no line is left far emptier than
 * the rest. What "emptier" means is measured, not guessed: VexFlow can say
 * what a bar's contents need before anything is drawn, and that is the number
 * everything here works from.
 *
 * The choice is a small dynamic program over the break points rather than a
 * greedy sweep. Greedy fills each line to the brim and pushes the shortfall to
 * the end, which is the failure being fixed; looking at the whole piece at
 * once spreads the shortfall evenly instead.
 *
 * No line is allowed past the page except one holding a single bar. That is
 * not fussiness: the score is drawn to the width of its hungriest line and
 * then scaled to fit, so one line overrunning shrinks every other line with
 * it. Left merely expensive rather than forbidden, the search would happily
 * buy a tidier set of breaks with a smaller score, which is a bad trade
 * nobody asked for.
 *
 * Nothing in here can fail to answer. Every function is total over every
 * number it might be handed, `NaN` and the infinities included, and the search
 * always has at least one move available from every position — a line of one
 * bar is always legal, even for a bar too wide for the page, because a bar too
 * wide for the page still has to be drawn somewhere.
 */

/**
 * The least room a bar may get, as a fraction of an equal share of its line.
 * Without it a bar holding one whole note collapses to a sliver next to a bar
 * of seven quintuplet sixteenths, though both last exactly as long.
 */
const MIN_BAR_SHARE = 0.95;

/**
 * Repetitions used to settle that floor. It converges geometrically while
 * `MIN_BAR_SHARE` is below 1, so this is far more than it needs.
 */
const FLOOR_PASSES = 40;

/**
 * Padding over the formatter's bare minimum, which packs notes until they
 * almost touch. Only binds when the music is too wide for the page; given more
 * room the bars are justified out to fill it anyway.
 */
const BAR_BREATHING = 1.08;

/**
 * The room a bar would like, rather than the room it can survive on.
 *
 * `BAR_BREATHING` is a floor: eight percent over notes that nearly touch. A
 * line that only clears *that* is not a line anybody wants to read, and taking
 * it as the test of whether bars fit is what put five crowded bars on the
 * second system of a nine-bar piece. Fitting and being worth looking at are
 * two different questions, and this is the second one.
 *
 * So the hard limit stays where it was — nothing may be drawn past the page —
 * and this is what the choice is actually made against.
 *
 * Twice the minimum, settled against the levels themselves rather than picked.
 * Below about 1.9 the crowded nine-bar pieces still came out four and five;
 * above about 2.1 evenly-written sixteen-bar pieces started breaking up into
 * uneven lines for no gain.
 */
const COMFORTABLE_BREATHING = 2;

/**
 * How much worse it is to be tighter than comfortable than to be looser.
 *
 * Both are a departure from the ideal and both are counted, but they are not
 * equally bad. A roomy line is stretched music, which is ordinary and reads
 * fine; a crowded one is the thing being complained about.
 *
 * Deliberately not higher. Doubling it does break up the last few lines that
 * are mildly over — around a tenth past comfortable — but it also starts
 * shuffling pieces whose bars are wildly uneven in width into uneven lines,
 * and that trade was judged the wrong way round: an even layout with one
 * slightly tight line beats a ragged one everywhere else.
 */
const CROWDING_COST = 20;

/**
 * What an unavoidable overrun costs, once it has been accepted.
 *
 * Overrunning is not a local matter here. Every line is drawn to the width of
 * the hungriest one, so a single line that will not fit widens the whole score
 * and the page shrinks all of it to compensate — every other line loses size
 * for it. That is why an overrun is never taken merely to tidy a break, and
 * why the only line allowed to overrun is one holding a single bar, where
 * there is nothing left to try.
 *
 * This is what ranks those forced cases against each other: past the page, the
 * less far past it the better.
 */
const OVERRUN_COST = 8;

/**
 * How many bars a line would rather hold, and how much it minds not doing so.
 *
 * Four is what engraved music mostly settles on and what this page drew before
 * any of it was measured, so it is the resting answer rather than an accident
 * of whatever the arithmetic happens to favour. Without it, sparse music drifts
 * as wide as the cap allows — twelve near-empty bars come out six and six,
 * because slack alone is always happier with fewer, fuller lines.
 *
 * A preference, not a rule. It is outweighed whenever the music genuinely
 * needs more room or less, and it can never force a line past the page: that
 * is settled before this is even looked at.
 *
 * The deviation is counted as a fraction of the preferred count, so it is the
 * same kind of number as the slack it is added to — both dimensionless, both
 * squared, neither able to swamp the other by accident of units.
 */
const PREFERRED_BARS = 4;
/**
 * Enough to settle what the fit does not care about, and no more.
 *
 * It was once much heavier, to stop sixteen thinly-written bars coming out six
 * and five and five. That was papering over the real fault: the fit was being
 * judged against notes that nearly touch, so every count looked equally
 * possible and only this could tell them apart. Measured against the room a
 * bar actually wants, the counts separate on their own and this can go back to
 * being what it should be — a nudge, outvoted by any real crowding.
 */
const PREFERENCE_WEIGHT = 2;

/** A width that can be reasoned about, whatever arrived. */
const clean = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/**
 * The room each bar on a line gets, evened out.
 *
 * Every bar here lasts the same length of time, so they should come out close
 * to the same width, with content only stretching a bar that genuinely needs
 * the room.
 *
 * A floor rather than an average: a bar that already needs more than its share
 * keeps exactly the room its contents ask for, so propping up the sparse bars
 * never squeezes the crowded ones. The floor is a fraction of an equal share
 * of the room actually handed out, which depends on the floor — raising the
 * thin bars raises the total, which raises the floor again. Settle it by
 * repetition rather than against the raw minimums, where one crowded bar drags
 * the whole line's share up and leaves its sparse neighbours looking starved
 * beside it.
 */
export function settledWeights(minWidths: readonly number[]): number[] {
  const mins = minWidths.map(clean);
  if (mins.length === 0) return [];

  let weights = mins;
  for (let pass = 0; pass < FLOOR_PASSES; pass++) {
    const share = weights.reduce((total, w) => total + w, 0) / weights.length;
    weights = mins.map((m) => Math.max(m, MIN_BAR_SHARE * share));
  }
  return weights;
}

/**
 * How wide this line has to be for every bar to hold its contents.
 *
 * Solved from the share each bar is about to be given, so a bar that evening
 * out shrinks is still guaranteed at least its minimum.
 *
 * `breathing` says how much room over the bare minimum to ask for, which is
 * two different questions with two different answers: what a line needs to be
 * drawable at all, and what it needs to be worth reading.
 */
export function lineRequirement(
  minWidths: readonly number[],
  lead: number,
  breathing: number = BAR_BREATHING,
): number {
  const head = clean(lead);
  if (minWidths.length === 0) return head;

  const mins = minWidths.map(clean);
  const weights = settledWeights(mins);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return head;

  const tightest = Math.max(
    ...mins.map((min, position) => (min * totalWeight) / weights[position]!),
  );
  const room = Number.isFinite(breathing) && breathing > 0 ? breathing : 1;
  return head + tightest * room;
}

export type LinePage = {
  /** The whole width one line may occupy, the lead included. */
  readonly usable: number;
  /** What the first line spends before any bar is drawn: clef, key, meter. */
  readonly firstLead: number;
  /** And every line after it, which restates all but the meter. */
  readonly otherLead: number;
  /** Never put more bars than this on one line, however sparse they are. */
  readonly maxPerLine: number;
};

/**
 * How many bars go on each line, in order.
 *
 * The returned counts always sum to the number of bars given, are never zero,
 * and never exceed the cap. That is the whole contract the layout needs, and
 * it holds for every input — see the note at the top of this file.
 */
export function chooseLines(
  minWidths: readonly number[],
  page: LinePage,
): number[] {
  const count = minWidths.length;
  if (count === 0) return [];

  const mins = minWidths.map(clean);
  // At least one bar per line, or there is no move that makes progress and no
  // layout at all. A cap that is not a whole number, or not a number, means
  // nobody has an opinion, so the search is left unbounded but for the music.
  const cap = Number.isFinite(page.maxPerLine)
    ? Math.max(1, Math.floor(page.maxPerLine))
    : count;
  // Slack is measured against the page, so the page must have a width. A
  // window reporting nothing yet still has to produce a layout, and the cap is
  // then the only thing shaping it.
  const usable = clean(page.usable) || 1;

  const leadFor = (start: number) =>
    start === 0 ? page.firstLead : page.otherLead;

  /**
   * What one line of bars `[start, end)` costs.
   *
   * Slack squared, as a fraction of the page, so that one line left half empty
   * is worse than two left a quarter empty — which is exactly the preference
   * that stops a piece ending on a lone stretched bar. Measured as a fraction
   * rather than in pixels so the arithmetic stays small and cannot run away to
   * infinity on absurd input.
   *
   * Plus what it costs to hold other than four bars, which is what keeps four
   * the resting answer where the music does not argue for something else.
   *
   * The last line is charged for its slack like every other. In prose a short
   * last line is correct and goes unpunished; here every line is justified to
   * the same width, so a short last line does not end early, it spreads.
   */
  const costOf = (start: number, end: number): number => {
    const bars = mins.slice(start, end);
    const lead = leadFor(start);
    const drift = (end - start - PREFERRED_BARS) / PREFERRED_BARS;
    const wanted = PREFERENCE_WEIGHT * drift * drift;

    // First, can it be drawn at all? Past the page is refused outright unless
    // the line is a single bar, which is the one case where refusing would
    // leave the bar nowhere to go — and which is what keeps a move available
    // from every position, so the search always finishes with an answer.
    const need = lineRequirement(bars, lead, BAR_BREATHING);
    if (need > usable) {
      const over = (usable - need) / usable;
      return end - start === 1
        ? OVERRUN_COST * over * over + wanted
        : Infinity;
    }

    // Then, is it worth reading? Measured against the room the bars want
    // rather than the room they can survive on, so that a line which merely
    // squeaks onto the page is not mistaken for a line that fits.
    const want = lineRequirement(bars, lead, COMFORTABLE_BREATHING);
    const off = (want - usable) / usable;
    // Crowded, which is the fault being fixed; or roomy, which is ordinary
    // stretched music and costs its own square.
    return off > 0
      ? CROWDING_COST * off * off + wanted
      : off * off + wanted;
  };

  // Worked backwards: `best[i]` is the cost of laying out bar `i` onwards, and
  // `take[i]` how many bars its first line should hold to achieve that.
  const best = new Array<number>(count + 1).fill(0);
  const take = new Array<number>(count + 1).fill(1);

  for (let start = count - 1; start >= 0; start--) {
    let bestCost = Infinity;
    let bestTake = 1;
    const furthest = Math.min(count, start + cap);
    for (let end = start + 1; end <= furthest; end++) {
      const cost = costOf(start, end) + best[end]!;
      // Strictly better, so an earlier break wins a tie and the answer is the
      // same every time it is asked.
      if (cost < bestCost) {
        bestCost = cost;
        bestTake = end - start;
      }
    }
    // `end = start + 1` is always among the candidates, so `bestTake` is always
    // a real move of at least one bar and the walk below always terminates.
    best[start] = bestCost;
    take[start] = bestTake;
  }

  const lines: number[] = [];
  for (let at = 0; at < count; ) {
    const step = Math.min(take[at]!, count - at);
    lines.push(step);
    at += step;
  }
  return lines;
}
