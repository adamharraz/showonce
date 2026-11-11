import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const source = new URL("../vendor/proto-lab/", import.meta.url);
const destination = new URL("../public/proto-lab/", import.meta.url);
const bundle = await build({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  publicDir: false,
  resolve: {
    alias: [
      { find: /^three$/, replacement: "three-proto-lab" },
      { find: /^three\/addons\//, replacement: "three-proto-lab/addons/" },
    ],
  },
  logLevel: "error",
  build: {
    write: false,
    lib: {
      entry: fileURLToPath(new URL("src/main.js", source)),
      name: "ProtoLab",
      formats: ["iife"],
    },
  },
});
const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((result) => result.output);
const script = outputs.find((item) => item.type === "chunk")?.code;
if (!script || outputs.length !== 1) throw new Error("Expected one self-contained Proto Lab bundle");

const [html, css] = await Promise.all([
  readFile(new URL("index.html", source), "utf8"),
  readFile(new URL("styles.css", source), "utf8"),
]);
const page = html
  .replace('<link rel="stylesheet" href="./styles.css" />', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`);

await mkdir(destination, { recursive: true });
await Promise.all([
  writeFile(new URL("index.html", destination), page),
  copyFile(new URL("LICENSE", source), new URL("LICENSE.txt", destination)),
  copyFile(new URL("../node_modules/three-proto-lab/LICENSE", import.meta.url), new URL("THREE-LICENSE.txt", destination)),
]);
