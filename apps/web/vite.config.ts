import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Intègre la feuille de style dans index.html : une requête bloquante de moins avant le premier affichage. */
function inlineCss(): Plugin {
  return {
    name: "inline-css",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset") return;
      let source = String(html.source);
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "asset" || !name.endsWith(".css")) continue;
        const tag = new RegExp(`<link[^>]+href="/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`);
        if (!tag.test(source)) continue;
        source = source.replace(tag, `<style>${String(chunk.source)}</style>`);
        delete bundle[name];
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineCss()],
  build: { target: "es2022", sourcemap: false },
});
