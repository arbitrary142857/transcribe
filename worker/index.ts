/**
 * The Worker itself: where a request first lands, and the only place the real
 * Cloudflare bindings are touched.
 *
 * Static assets are served before this runs, so a request that gets here is
 * one no file answered. That leaves two kinds. Anything under /api is the
 * API's, and everything else is a path that looked like a page and was not --
 * handed back to the asset server, which has a 404 page for exactly that.
 *
 * `Env` and `ExportedHandler` come from worker-configuration.d.ts, which
 * `npm run cf-typegen` writes out of wrangler.jsonc. Rerun it after changing
 * a binding there.
 */

import { googleSignInOf, type TokenFetch } from "./auth.js";
import { rateLimitsOf } from "./limits.js";
import { api, type Database } from "./routes.js";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      // The real D1 binding, fitted to the shape routes.ts describes. This
      // line is the check that the shape is honest: if D1 ever stops matching
      // it -- `prepare`, `bind`, the three ways to run, and `batch` -- the
      // Worker stops compiling rather than the tests going on passing against
      // a stand-in that no longer resembles anything.
      const database: Database = env.DB;

      // The real fetch, fitted to the shape auth.ts describes, for the same
      // reason. GOOGLE_CLIENT_ID is a var in wrangler.jsonc; the secret is
      // `wrangler secret put` for the deployed Worker and .dev.vars locally.
      // Either one absent means sign-in answers with a sentence.
      const exchange: TokenFetch = (url, init) => fetch(url, init);
      const google = googleSignInOf(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        exchange,
      );

      // The six rate-limit bindings from wrangler.jsonc, fitted to the shape
      // limits.ts describes -- the same check the other two get: if a binding
      // ever stops having `limit`, the Worker stops compiling rather than the
      // tests going on passing against a stand-in that no longer resembles it.
      //
      // All six or none. An environment missing one limits nothing rather
      // than answering 500 to whichever class it was, which is the bargain
      // `google` is offered above; see `rateLimitsOf`.
      const limits = rateLimitsOf({
        check: env.RL_CHECK,
        auth: env.RL_AUTH,
        heavy: env.RL_HEAVY,
        list: env.RL_LIST,
        write: env.RL_WRITE,
        read: env.RL_READ,
      });

      return api.fetch(request, { DB: database, google, limits }, ctx);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
