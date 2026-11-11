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
// The opaque-origin frame exchanges only allowlisted reference-topic state.
const allowedTopics=new Set(['board','blink','button','knob','rgb','light','sensor','sound','piano','motor','heat','servo','stepper','plant','force','project']);
let previous='',queued=false;
document.documentElement.dataset.showonceBridge='ready';
addEventListener('error',event=>{ document.documentElement.dataset.referenceError=String(event.message || event.target?.src || 'Resource could not load').slice(0,160); },true);
function report(){
 queued=false;
 const active=document.querySelector('.lesson[aria-current="step"]');
 const candidate=active?.dataset.id || location.hash.slice(1);
 const topic=allowedTopics.has(candidate)?candidate:'board';
 const ready=!document.documentElement.classList.contains('is-loading');
 const webgl=!document.getElementById('stage')?.classList.contains('no-webgl');
 const data={type:'showonce:arduino-state',topic,ready,webgl};
 const signature=JSON.stringify(data);
 if(signature!==previous){previous=signature;parent.postMessage(data,'*');}
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(report);}}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-current']});
addEventListener('load',schedule);
addEventListener('message',event=>{
 if(event.source!==parent || event.data?.type!=='showonce:select-topic' || !allowedTopics.has(event.data.topic))return;
 const current=document.querySelector('.lesson[aria-current="step"]');
 if(current?.dataset.id!==event.data.topic)document.querySelector('.lesson[data-id="'+event.data.topic+'"]')?.click();
 schedule();
});
</script><style>
/* Designer attribution is accessible in the host About section. */
.credit { visibility: hidden !important; pointer-events: none !important; }
</style>`;

for (const file of manifest.files) {
  if (path.isAbsolute(file.path) || file.path.split("/").includes(".."))
    throw Error("Invalid snapshot path");
  let bytes = await readFile(path.join(source, "site", file.path));
  // Git for Windows may expand LF to CRLF before .gitattributes is available
  // in an existing checkout. Accept only that reversible transformation, then
  // restore the manifest's original bytes before preparing the reference.
  const normalizedTextBytes = /\.(html|css|js|txt|xml|json|svg|webmanifest)$/.test(file.path)
    ? Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    : bytes;
  if (
    normalizedTextBytes.length !== file.bytes ||
    createHash("sha256").update(normalizedTextBytes).digest("hex") !==
      file.sha256
  )
    throw Error(`Snapshot checksum failed: ${file.path}`);
  bytes = normalizedTextBytes;
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

// A self-contained page also works where opaque-origin frames cannot fetch modules.
// The sandbox stays intact; no parent credentials or network permissions are added.
const { build: bundleReference } = await import("vite");
const entryFile = path.join(dest, "assets/index-BodLthS6.js");
let entry = await readFile(entryFile, "utf8");
const preloadStart = entry.indexOf("o=function(e,o,s){");
const preloadEnd = entry.indexOf("},s=[", preloadStart);
if (preloadStart < 0 || preloadEnd < 0)
  throw Error("Unexpected preload helper; review offline packaging");
entry =
  entry.slice(0, preloadStart) +
  "o=function(loader){return Promise.resolve().then(loader)}" +
  entry.slice(preloadEnd + 1);
await writeFile(entryFile, entry);
const built = await bundleReference({
  configFile: false,
  publicDir: false,
  logLevel: "error",
  build: {
    write: false,
    emptyOutDir: false,
    modulePreload: false,
    minify: true,
    lib: { entry: entryFile, formats: ["es"] },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const output = Array.isArray(built) ? built[0].output : built.output;
const js = output.find((file) => file.type === "chunk")?.code;
if (!js) throw Error("No offline reference bundle");
let css = await readFile(path.join(dest, "assets/index-CeIbtN2h.css"), "utf8");
const fontRefs = [...css.matchAll(/url\((['"]?)([^)'"\s]+\.woff2)\1\)/g)];
for (const match of fontRefs) {
  const local = match[2].startsWith("/arduino-reference/")
    ? path.join(dest, match[2].slice("/arduino-reference/".length))
    : path.resolve(dest, "assets", match[2]);
  if (!local.startsWith(dest + path.sep)) throw Error("Invalid font reference");
  const data = (await readFile(local)).toString("base64");
  css = css.replaceAll(match[0], `url(data:font/woff2;base64,${data})`);
}
for (const file of manifest.files.filter((file) =>
  file.path.endsWith(".html"),
)) {
  const out = path.join(dest, file.path);
  let html = await readFile(out, "utf8");
  html = html.replace(
    /<link\b[^>]*rel="(?:preload|icon|apple-touch-icon|manifest)"[^>]*>/g,
    "",
  );
  html = html.replace(
    /<link\b[^>]*rel="stylesheet"[^>]*>/g,
    () => `<style>${css}</style>`,
  );
  html = html.replace(
    /<script\b[^>]*type="module"[^>]*src="[^"]+"[^>]*><\/script>/g,
    () =>
      `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`,
  );
  await writeFile(out, html);
}
console.log(
  "Bundled isolated reference pages with inline scripts and local fonts.",
);
