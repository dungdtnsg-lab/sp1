import { existsSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const www = "www";
const src = join(www, "index.native.html");
const dest = join(www, "index.html");
if (existsSync(src)) renameSync(src, dest);
if (!existsSync(dest)) {
  console.error("[native-www] missing www/index.html");
  process.exit(1);
}
let html = readFileSync(dest, "utf8");
html = html.replaceAll("/index.native.html", "/index.html");
writeFileSync(dest, html);
console.log("[native-www] ready", dest);
