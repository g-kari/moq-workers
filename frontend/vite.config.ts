import { defineConfig, Plugin } from "vite";

/** Cloudflare Rocket Loader が type="module" を書き換えるのを防ぐプラグイン */
function cfAsyncFalse(): Plugin {
  return {
    name: "cf-async-false",
    transformIndexHtml(html) {
      return html.replace(
        /<script type="module"/g,
        '<script data-cfasync="false" type="module"'
      );
    },
  };
}

export default defineConfig({
  plugins: [cfAsyncFalse()],
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        watch: "watch.html",
      },
    },
  },
});
