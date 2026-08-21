/**
 * My transcriptions: one author's drafts and published levels.
 *
 * The same list as the front page, drawn from `/api/mine` instead, with the
 * pencil, the move between draft and published, and the trash on every card —
 * since every card here is the viewer's own.
 */

import { createLevelList } from "../ui/level-list.js";
import { mountSiteNav } from "../ui/site-nav.js";

const { viewer } = mountSiteNav(document.getElementById("site-nav")!);

void createLevelList({
  elements: {
    list: document.getElementById("levels")!,
    note: document.getElementById("levels-note")!,
    controls: document.getElementById("levels-controls")!,
  },
  storage: window.localStorage,
  viewer,
  page: "mine",
}).load();
