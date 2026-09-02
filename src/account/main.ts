/**
 * The account's own page.
 *
 * Nothing here is drawn until /api/me has said who is looking: the page is
 * about one person, and drawing it for nobody would be drawing the wrong
 * page. Signed out, it says so and offers the way in, back to here.
 */

import { createLocalProgressStore } from "../puzzle/progress.js";
import { createAccountPage } from "../ui/account-page.js";
import { browserFetch, required, showTrouble } from "../ui/page-boot.js";
import { mountSiteNav } from "../ui/site-nav.js";

const { viewer } = mountSiteNav(required("site-nav"));
const host = required("account");

try {
  const user = await viewer;
  if (user === undefined) {
    showTrouble(host, "Sign in to see your account.", {
      heading: "Account Settings",
      signIn: "/account",
    });
  } else {
    createAccountPage({
      host,
      user,
      fetch: browserFetch,
      local: createLocalProgressStore(window.localStorage),
      onRenamed(renamed) {
        // The corner's answer came from before the change; say the new name
        // there directly rather than ask /api/me again.
        const corner = document.querySelector(".session-name");
        if (corner !== null) corner.textContent = renamed.username ?? renamed.email;
      },
    });
  }
} catch (error) {
  host.textContent = error instanceof Error ? error.message : String(error);
  console.error(error);
}
