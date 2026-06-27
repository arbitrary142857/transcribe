import { embedUrl } from "./youtube.js";

/**
 * Put the video in the band above the music.
 *
 * This is YouTube's own player, left as it comes: nothing is drawn over it,
 * nothing plays until it is asked to, its controls and its branding are its
 * own, and the frame is kept above the 200px each way that YouTube asks
 * embedders for — all of which their terms require of anyone showing it.
 *
 * Mounted once, for the life of the page. Every edit redraws the controls
 * around this, and rebuilding the player would send the video back to the
 * beginning each time — which, since the video is the thing being written
 * down, is the one thing an edit must never do.
 */
export function mountVideoPanel(
  element: HTMLElement,
  videoId: string,
): HTMLIFrameElement {
  element.replaceChildren();

  const frame = document.createElement("div");
  frame.className = "video-frame";

  const player = document.createElement("iframe");
  player.id = "video-player";
  player.src = embedUrl(videoId, window.location.origin);
  player.title = "YouTube video player";
  player.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  player.allowFullscreen = true;
  player.referrerPolicy = "strict-origin-when-cross-origin";

  frame.append(player);
  element.append(frame);
  return player;
}
