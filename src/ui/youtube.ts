/**
 * What a pasted link turned out to be: a video, or a reason it was not one.
 *
 * The reason travels with the reading because the box that takes the link is
 * the only place it can usefully be said, and "invalid" on its own does not
 * tell anybody which of several different mistakes they made.
 */
export type LinkReading =
  | { readonly videoId: string; readonly problem?: undefined }
  | { readonly videoId?: undefined; readonly problem: string };

const NO_LINK = "Paste the link to the video you are writing from.";
const NOT_YOUTUBE = "That is not a YouTube link.";
const NOT_A_VIDEO = "That YouTube link is not to a single video.";

/** Every id is eleven of these characters, and nothing that is not is an id. */
const VIDEO_ID = /^[\w-]{11}$/;

/**
 * The player's own paths. All of them carry the id in the same place, so
 * `/embed/`, `/shorts/` and the rest need no separate handling.
 */
const ID_PATHS = new Set(["embed", "e", "v", "shorts", "live"]);

/**
 * The one thing that stands where an id stands and is not one.
 *
 * `/embed/videoseries?list=…` is how a playlist is embedded, and it is eleven
 * characters of the id alphabet, so nothing about its shape gives it away.
 */
const PLAYLIST_EMBED = "videoseries";

const YOUTUBE_HOSTS = ["youtube.com", "youtube-nocookie.com", "youtu.be"];

/** A host, or any subdomain of it — `www.`, `m.` and `music.` are all it. */
const isHost = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

const asVideoId = (candidate: string | undefined | null) =>
  candidate && VIDEO_ID.test(candidate) ? candidate : undefined;

function toUrl(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

function videoId(url: URL): string | undefined {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (isHost(host, "youtu.be")) {
    return asVideoId(segments[0]);
  }
  if (segments[0] === "watch") {
    return asVideoId(url.searchParams.get("v"));
  }
  if (
    segments.length === 2 &&
    ID_PATHS.has(segments[0]!) &&
    segments[1] !== PLAYLIST_EMBED
  ) {
    return asVideoId(segments[1]);
  }
  return undefined;
}

/**
 * Read a pasted link as a video.
 *
 * Links reach this box from address bars, share sheets, chat messages and the
 * app's own embed code, so all of those forms are accepted — with or without a
 * scheme, from any of YouTube's hosts, and carrying whatever timestamp,
 * playlist and tracking parameters they picked up on the way. Only the id is
 * kept. A link that says which second to begin at, or which playlist the video
 * was reached through, still names one video, and that video is the whole of
 * what this page has any use for.
 */
export function readYouTubeLink(text: string): LinkReading {
  const trimmed = text.trim();
  if (!trimmed) {
    return { problem: NO_LINK };
  }

  // A link read off a page or out of a message usually loses its scheme, and
  // `new URL` will not look at one without it.
  const url = toUrl(
    /^[a-z][\w+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
  );
  const host = url?.hostname.toLowerCase();
  if (!url || !host || !YOUTUBE_HOSTS.some((domain) => isHost(host, domain))) {
    return { problem: NOT_YOUTUBE };
  }

  const id = videoId(url);
  return id ? { videoId: id } : { problem: NOT_A_VIDEO };
}

/**
 * The address of YouTube's own player, showing this video.
 *
 * `playsinline` keeps an iPhone from taking over the screen the moment the
 * video is started, which would put the score out of sight — the one place it
 * must not go while somebody is writing from it.
 *
 * `enablejsapi` is what lets the page speak to the player at all. The player is
 * served from youtube.com, so nothing here can reach into it; every request
 * travels as a message between the two frames, and without this flag the player
 * is not listening. Leaving it off fails quietly rather than loudly — the player
 * still appears and still plays, and every call the page makes does nothing.
 *
 * `origin` names the page holding the player, so it can tell those messages from
 * anyone else's. It is passed in rather than read from `location` here because
 * this function is also called where there is no browser to read it from.
 *
 * `controls: false` asks the player to draw no control bar — YouTube's own
 * documented parameter, for the places the player is driven from the panel
 * beside it and its own chrome only flashes distraction. Where the player is
 * scrubbed by hand — the setup page, the editor's timing mode — the controls
 * stay, which is the default.
 */
export function embedUrl(
  videoId: string,
  origin?: string,
  { controls = true }: { controls?: boolean } = {},
): string {
  const url = new URL(`https://www.youtube.com/embed/${videoId}`);
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("enablejsapi", "1");
  if (!controls) {
    url.searchParams.set("controls", "0");
  }
  if (origin) {
    url.searchParams.set("origin", origin);
  }
  return url.toString();
}

/**
 * The still image YouTube keeps for a video.
 *
 * `mqdefault` is 320×180 — exactly 16:9, and the one size that exists for every
 * video ever uploaded. So it is what a card asks for first: the picture is there
 * immediately, at the right shape, and nothing shifts.
 *
 * It is also not enough on its own. A card is drawn 370px wide across three
 * columns and nearly 600px in one, and a screen at two device pixels to the
 * CSS pixel paints that over 740–1180 real ones — a 320px file blown up two to
 * nearly four times. `sharpenThumbnail` goes and finds something bigger.
 *
 * Worth being honest about: this is a direct read of YouTube's image host, not
 * the Data API, which is the route their API terms actually sanction for
 * thumbnails. It is what everyone does and it has never been enforced against,
 * but it is not the sanctioned path. The player itself remains their own embed
 * under the rules `video-panel.ts` sets out. If this ever needs to go, it is
 * one call site: the picture on a level card, and nothing else.
 */
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** The shape that image comes at, for reserving its box. */
export const THUMBNAIL_SIZE = { width: 320, height: 180 } as const;

/**
 * The bigger stills, best first.
 *
 * The first two are 1280×720 and 16:9, so either drops straight into the box.
 * Neither is guaranteed: `maxresdefault` exists only where the video was
 * uploaded at 720p or better, and `hq720` is undocumented but present rather
 * more often. A video uploaded below 720p has neither, and used to fall all the
 * way back to the 320×180 — a quarter of the picture the card is drawn at, and
 * an eighth of it on a retina screen.
 *
 * The last two are the 4:3 sizes, and they are here because the black bars they
 * carry cost nothing to remove: a 16:9 frame sits centred in a 4:3 still, so
 * `object-fit: cover` on a 16:9 box crops exactly the bars and nothing else —
 * 640×480 becomes a true 640×360, 480×360 a true 480×270. The one thing lost is
 * the promise `contain` used to make, that no picture is ever cut: a video
 * genuinely shot in 4:3 has no bars to take, and is trimmed instead.
 */
const SHARPER = [
  "maxresdefault",
  "hq720",
  "sddefault",
  "hqdefault",
] as const;

/**
 * Whether a still that arrived is worth putting on the card.
 *
 * Wider than the one already showing, which says both of the things that need
 * saying. A missing size sometimes answers 404 and sometimes answers 200 with a
 * 120×90 grey square, and swapping that in would replace a real thumbnail with
 * a blank one; and a size no bigger than `mqdefault` is not worth a second
 * request either way.
 */
export function worthSwapping(width: number): boolean {
  return width > THUMBNAIL_SIZE.width;
}

/**
 * Quietly replace a card's picture with a sharper one, if there is one.
 *
 * Loaded off to one side and swapped in only once it has arrived whole, rather
 * than set as the `src` and hoped for. Pointing the element straight at a size
 * that may not exist would fire its `error` handler — which is how the card
 * decides the video is gone — and a level would lose its picture for having
 * been uploaded in 2009.
 */
export function sharpenThumbnail(
  image: HTMLImageElement,
  videoId: string,
  sizes: readonly string[] = SHARPER,
): void {
  const [size, ...rest] = sizes;
  if (size === undefined) return;

  const probe = new Image();
  probe.referrerPolicy = "no-referrer";
  probe.decoding = "async";
  probe.addEventListener("load", () => {
    if (worthSwapping(probe.naturalWidth)) {
      image.src = probe.src;
    } else {
      sharpenThumbnail(image, videoId, rest);
    }
  });
  probe.addEventListener("error", () => {
    sharpenThumbnail(image, videoId, rest);
  });
  probe.src = `https://i.ytimg.com/vi/${videoId}/${size}.jpg`;
}
