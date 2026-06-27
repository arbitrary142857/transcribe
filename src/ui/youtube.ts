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
 */
export function embedUrl(videoId: string, origin?: string): string {
  const url = new URL(`https://www.youtube.com/embed/${videoId}`);
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("enablejsapi", "1");
  if (origin) {
    url.searchParams.set("origin", origin);
  }
  return url.toString();
}
