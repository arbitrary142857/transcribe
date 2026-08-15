import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  embedUrl,
  readYouTubeLink,
  worthSwapping,
  THUMBNAIL_SIZE,
} from "../dist/ui/youtube.js";

const ID = "dQw4w9WgXcQ";

/** The id a link was read as, or `undefined` if it was not read as one. */
const idIn = (link: string) => readYouTubeLink(link).videoId;

describe("readYouTubeLink()", () => {
  it("reads a watch link", () => {
    assert.equal(idIn(`https://www.youtube.com/watch?v=${ID}`), ID);
  });

  it("reads a share link", () => {
    assert.equal(idIn(`https://youtu.be/${ID}`), ID);
  });

  it("reads the player's own addresses", () => {
    for (const path of ["embed", "e", "v", "shorts", "live"]) {
      assert.equal(idIn(`https://www.youtube.com/${path}/${ID}`), ID, path);
    }
  });

  it("reads any of YouTube's hosts", () => {
    for (const host of [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "www.youtube-nocookie.com",
    ]) {
      assert.equal(idIn(`https://${host}/watch?v=${ID}`), ID, host);
    }
  });

  it("takes a link without its scheme", () => {
    assert.equal(idIn(`youtube.com/watch?v=${ID}`), ID);
    assert.equal(idIn(`youtu.be/${ID}`), ID);
  });

  it("takes a link with space around it", () => {
    assert.equal(idIn(`  https://youtu.be/${ID}  `), ID);
  });

  it("takes http as readily as https", () => {
    assert.equal(idIn(`http://www.youtube.com/watch?v=${ID}`), ID);
  });

  it("keeps the video out of everything else the link carries", () => {
    const links = [
      `https://www.youtube.com/watch?v=${ID}&t=1m30s`,
      `https://youtu.be/${ID}?t=90&si=aBcDeFgHiJkLmNoP`,
      `https://www.youtube.com/watch?v=${ID}&list=PL1234567890&index=4`,
      `https://www.youtube.com/embed/${ID}?start=90&rel=0`,
      `https://www.youtube.com/watch?app=desktop&v=${ID}&feature=share`,
    ];
    for (const link of links) {
      assert.deepEqual(readYouTubeLink(link), { videoId: ID }, link);
    }
  });

  it("refuses what is not a link at all", () => {
    for (const text of ["", "   ", "not a link", "https://", "mailto:a@b.c"]) {
      assert.equal(idIn(text), undefined, JSON.stringify(text));
    }
  });

  it("refuses another site, however much it looks the part", () => {
    for (const link of [
      `https://vimeo.com/watch?v=${ID}`,
      // The name is in there, but the site serving it is not YouTube's.
      `https://youtube.com.example.net/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
    ]) {
      assert.equal(idIn(link), undefined, link);
    }
  });

  it("refuses a YouTube link that is not to one video", () => {
    for (const link of [
      "https://www.youtube.com/playlist?list=PL1234567890",
      "https://www.youtube.com/@someone",
      "https://www.youtube.com/embed/videoseries?list=PL1234567890",
      "https://www.youtube.com/",
      // Eleven characters is the whole of an id; ten or twelve is not one.
      "https://www.youtube.com/watch?v=dQw4w9WgXc",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQQ",
      "https://www.youtube.com/watch",
    ]) {
      assert.equal(idIn(link), undefined, link);
    }
  });

  it("says which of the two mistakes was made", () => {
    assert.match(readYouTubeLink("https://vimeo.com/1234").problem!, /not a YouTube/);
    assert.match(
      readYouTubeLink("https://www.youtube.com/@someone").problem!,
      /not to a single video/,
    );
  });
});

describe("embedUrl()", () => {
  it("addresses YouTube's own player", () => {
    const url = new URL(embedUrl(ID));
    assert.equal(url.origin, "https://www.youtube.com");
    assert.equal(url.pathname, `/embed/${ID}`);
  });

  it("asks to play in place, so a phone does not take the screen", () => {
    assert.equal(new URL(embedUrl(ID)).searchParams.get("playsinline"), "1");
  });

  it("never asks the player to start on its own", () => {
    assert.equal(new URL(embedUrl(ID)).searchParams.get("autoplay"), null);
  });

  it("opens the player up to being spoken to", () => {
    assert.equal(new URL(embedUrl(ID)).searchParams.get("enablejsapi"), "1");
  });

  it("names the page holding it, when it is told what that is", () => {
    const url = new URL(embedUrl(ID, "https://example.com"));
    assert.equal(url.searchParams.get("origin"), "https://example.com");
  });

  it("leaves the origin out rather than inventing one", () => {
    assert.equal(new URL(embedUrl(ID)).searchParams.get("origin"), null);
  });
});

describe("worthSwapping()", () => {
  it("takes a still bigger than the one already on the card", () => {
    // 1280 for the two 16:9 sizes, then the 4:3 pair cropped back to shape.
    assert.equal(worthSwapping(1280), true);
    assert.equal(worthSwapping(640), true);
    assert.equal(worthSwapping(480), true);
  });

  it("refuses the grey square YouTube answers a missing size with", () => {
    // 120×90, and served with a 200 rather than a 404, so nothing else tells
    // it apart from a picture.
    assert.equal(worthSwapping(120), false);
  });

  it("refuses one no bigger than what is showing", () => {
    assert.equal(worthSwapping(THUMBNAIL_SIZE.width), false);
  });
});
