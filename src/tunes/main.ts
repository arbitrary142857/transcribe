/**
 * The tune list at /tunes: what is published, for everybody.
 *
 * All of the drawing and the doing is in `createLevelList`, shared with the
 * page that lists one author's own; this page only says which page it is.
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
  page: "tunes",
}).load();
