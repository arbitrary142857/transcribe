import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

/** The repo root. `root` below is `src`, so paths out here need spelling. */
const from = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: "src",

  // Runs the Worker in workerd beside the page, with the D1 binding attached,
  // so `npm run dev` is the whole thing rather than a page talking to nothing.
  //
  // Both paths are spelled out because both would otherwise be looked for
  // relative to `root` above — that is, inside `src`. The state one matters
  // most: left to itself the plugin keeps its local database under `src`,
  // while `wrangler d1 migrations apply --local` writes to the one beside
  // wrangler.jsonc. Two databases, and the migrated one is not the one the
  // dev server reads.
  plugins: [
    cloudflare({
      configPath: from("./wrangler.jsonc"),
      persistState: { path: from("./.wrangler/state") },
    }),
  ],

  server: {
    port: 5173,
    open: true,
  },

  build: {
    // Kept out of `dist/`, which the `tsc` build and `npm run demo` already
    // own. The Vite plugin treats this as the root of the output: the page
    // lands under `client/` inside it with the Worker bundle beside them, and
    // the plugin writes the asset directory into a generated wrangler.json —
    // which is why wrangler.jsonc does not name one.
    outDir: "../dist-web",
    emptyOutDir: true,
  },

  environments: {
    client: {
      build: {
        // Each entry becomes a page: `/`, `/edit`, `/play`, `/mine`,
        // `/account`, `/privacy`, and the 404 the asset host reaches for when
        // a path names no file. Vite finds
        // only `index.html` by itself, so the rest are named.
        //
        // Named under `client` rather than at the top level, and that is not
        // tidiness: the Cloudflare plugin builds the Worker as a second
        // environment, and a top-level `input` is handed to that one as well,
        // where four HTML files are not something a Worker can be made of.
        rollupOptions: {
          input: {
            home: from("./src/index.html"),
            edit: from("./src/edit/index.html"),
            play: from("./src/play/index.html"),
            mine: from("./src/mine/index.html"),
            account: from("./src/account/index.html"),
            about: from("./src/about/index.html"),
            privacy: from("./src/privacy/index.html"),
            notFound: from("./src/404.html"),
          },
        },
      },
    },
  },
});
