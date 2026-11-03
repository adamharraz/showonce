// Adapt the supplied public deployment deterministically; originals stay intact.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "vendor/learn-arduino");
const dest = path.join(root, "public/arduino-reference");
const prefix = "/arduino-reference";
const manifest = JSON.parse(
  await readFile(path.join(source, "download-manifest.json"), "utf8"),
);
await rm(dest, { recursive: true, force: true });
const bridge = `<script>
// Only readiness is shared. No credentials, media, assessment or progress bridge.
const notify = () => { if (!document.documentElement.classList.contains('is-loading')) { parent.postMessage({type:'showonce:arduino-ready'}, '*'); observer.disconnect(); } };
const observer = new MutationObserver(notify);
observer.observe(document.documentElement, {attributes:true, attributeFilter:['class']});
addEventListener('load', notify);
</script><style>
/* Credit is presented in the host's About section, outside the workspace. */
.credit { visibility: hidden !important; pointer-events: none !important; }
</style>`;
for (const file of manifest.files) {
  if (path.isAbsolute(file.path) || file.path.split("/").includes(".."))
    throw Error("Invalid snapshot path");
  let bytes = await readFile(path.join(source, "site", file.path));
  if (
    bytes.length !== file.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  )
    throw Error(`Snapshot checksum failed: ${file.path}`);
  if (/\.(html|css|js)$/.test(file.path)) {
    let text = bytes.toString("utf8");
    if (file.path.endsWith(".html")) {
      text = text.replace(/((?:href|src)=["'])\/(?!\/)/g, `$1${prefix}/`);
      text = text.replace("</head>", `${bridge}</head>`);
    }
    if (file.path.endsWith(".css"))
      text = text.replace(/url\((['"]?)\/assets\//g, `url($1${prefix}/assets/`);
    // Vite preload helper and language routing are the only absolute JS paths.
    if (file.path === "assets/index-BodLthS6.js") {
      if (
        !text.includes("return`/`+e") ||
        !text.includes("function g(e){return(e===")
      )
        throw Error("Unexpected entry bundle; review adaptation");
      text = text.replace("return`/`+e", `return\`${prefix}/\`+e`);
      text = text.replaceAll(
        "location.pathname",
        "location.pathname.replace(/^\\/arduino-reference/,``)",
      );
      text = text.replace(
        "function g(e){return(e===",
        `function g(e){return\`${prefix}\`+(e===`,
      );
    }
    if (file.path === "assets/stage-q31hSPBm.js") {
      if (!text.includes("floorCredit:!0"))
        throw Error("Unexpected stage bundle; review credit relocation");
      // Use the renderer's own option; the author is credited in the host About view.
      text = text.replace("floorCredit:!0", "floorCredit:!1");
    }
    bytes = Buffer.from(text);
  }
  const out = path.join(dest, file.path);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, bytes);
}
console.log(
  `Prepared ${manifest.files.length} verified Arduino reference files.`,
);
