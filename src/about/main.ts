/**
 * The about page: questions in the markup, and only the nav to draw.
 *
 * The questions are hand-written `<details>` blocks that shut each other by
 * sharing a `name`, so there is nothing here to mount for them — see the note
 * at the top of `index.html` for how one is added.
 */

import { mountSiteNav } from "../ui/site-nav.js";

mountSiteNav(document.getElementById("site-nav")!);
