/**
 * The demos down the home page: two screen recordings and a screenshot.
 *
 * The two videos are the weight of the page — about 17 MB between them, next
 * to a few kilobytes of everything else — so none of it is fetched when the
 * page opens. Each carries its address in `data-demo` rather than `src`, and
 * this hands it over when the demo is nearly in view. Below the fold that
 * costs nothing; a visitor who never scrolls never downloads a frame.
 *
 * They are screen recordings with no audio track at all, which is what makes
 * them safe to start on their own: a browser refuses to autoplay sound, and
 * there is none to refuse. So they run like the animated pictures they are —
 * muted, looping, no controls, nothing to press.
 *
 * Nothing to press is the reason `prefers-reduced-motion` matters here. On
 * every other animation in this app the answer is to arrive rather than
 * travel, and a paused video makes the same promise: the still is the demo,
 * held. See `planDemo` for why a still needs asking for by name.
 */

/** What to load, and whether to set it running once it is loaded. */
export type DemoPlan = {
  /** The address to hand the element, with a frame named when one is wanted. */
  src: string;
  /** Whether to start it, or leave its first frame standing. */
  play: boolean;
};

/**
 * The address for a demo, and what to do with it.
 *
 * The fragment on the still is not decoration. These videos carry no poster
 * image — a poster is a fourth file to make and keep true to a recording that
 * will be redone — and they are not loaded until they are scrolled to, so a
 * video that is never played has nothing to paint and the box is simply
 * empty. `#t=` names an instant, and a browser given one fetches that much of
 * the file and draws that frame without being played. Not quite zero: a plain
 * `#t=0` is the whole video's start rather than a seek, and is ignored.
 *
 * The address that plays is left alone, because the fragment would be obeyed
 * there too — the demo would begin a frame in, and loop back to that frame
 * rather than to its beginning.
 */
export function planDemo(source: string, reduceMotion: boolean): DemoPlan {
  return reduceMotion
    ? { src: `${source}#t=0.001`, play: false }
    : { src: source, play: true };
}

/**
 * Give each demo its file as it comes into view, and start it.
 *
 * A margin of a screen's height, so the fetch begins while the demo is still
 * below the fold and the box is filled by the time it is looked at. Once a
 * demo is loaded it is dropped from the observer: the address is handed over
 * once, and the looping is the element's own business after that.
 *
 * The whole thing rests on an IntersectionObserver, so where there is none
 * every demo is simply loaded at once — the old behaviour, and a correct
 * page.
 */
export function mountHomeDemos(root: ParentNode = document): void {
  const videos = [...root.querySelectorAll<HTMLVideoElement>("video[data-demo]")];
  if (videos.length === 0) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (typeof IntersectionObserver === "undefined") {
    for (const video of videos) load(video, reduceMotion);
    return;
  }

  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        watcher.unobserve(entry.target);
        load(entry.target as HTMLVideoElement, reduceMotion);
      }
    },
    { rootMargin: "100% 0px" },
  );

  for (const video of videos) watcher.observe(video);
}

function load(video: HTMLVideoElement, reduceMotion: boolean): void {
  const source = video.dataset.demo;
  if (source === undefined) return;

  const plan = planDemo(source, reduceMotion);

  // The attribute is in the markup as well, and both are needed: the property
  // is what an autoplay policy reads, and a video that is not muted to its
  // satisfaction is a video whose play() is refused.
  video.muted = true;
  // `none` is what kept it off the wire until now; the element needs leave to
  // fetch what it was just given.
  video.preload = reduceMotion ? "metadata" : "auto";
  video.src = plan.src;

  if (!plan.play) return;

  // A refused play leaves a still, which is the reduced-motion page and is a
  // perfectly good one — so the failure is worth nothing louder than this.
  void video.play().catch(() => {});
}
