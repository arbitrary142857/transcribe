import { embedUrl } from "./youtube.js";

/**
 * Put the video in the side panel.
 *
 * This is YouTube's own player: nothing is drawn over it, nothing plays until
 * it is asked to, its branding is its own, and the frame is kept above the
 * 200px each way that YouTube asks embedders for. `controls: false` uses
 * their own parameter to leave the control bar out, for the modes where the
 * player is driven from the panel and cannot be pointed at anyway.
 *
 * Mounted once per mode, never per edit. Every edit redraws the controls
 * around this, and rebuilding the player would send the video back to the
 * beginning each time — which, since the video is the thing being written
 * down, is the one thing an edit must never do. The one deliberate rebuild is
 * the editor's mode switch, which needs the other kind of player and puts the
 * position back itself.
 */
export function mountVideoPanel(
  element: HTMLElement,
  videoId: string,
  { controls = true }: { controls?: boolean } = {},
): HTMLIFrameElement {
  element.replaceChildren();

  const frame = document.createElement("div");
  frame.className = "video-frame";

  const player = document.createElement("iframe");
  player.id = "video-player";
  player.src = embedUrl(videoId, window.location.origin, { controls });
  player.title = "YouTube video player";
  player.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  player.allowFullscreen = true;
  player.referrerPolicy = "strict-origin-when-cross-origin";

  frame.append(player);
  element.append(frame);
  return player;
}
