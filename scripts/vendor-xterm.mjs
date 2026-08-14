#!/usr/bin/env node
/**
 * Copy self-contained xterm UMD + CSS into public/vendor.
 * Run after `npm install`. No network after node_modules is populated.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nm = path.join(root, "node_modules");
const dest = path.join(root, "public", "vendor");

const files = [
  ["@xterm/xterm/css/xterm.css", "xterm.css"],
  ["@xterm/xterm/lib/xterm.js", "xterm.js"],
  ["@xterm/addon-fit/lib/addon-fit.js", "addon-fit.js"],
  ["@xterm/addon-web-links/lib/addon-web-links.js", "addon-web-links.js"],
  ["@xterm/addon-unicode11/lib/addon-unicode11.js", "addon-unicode11.js"],
];

fs.mkdirSync(dest, { recursive: true });

for (const [rel, outName] of files) {
  const src = path.join(nm, rel);
  if (!fs.existsSync(src)) {
    console.error(`[vendor:xterm] missing ${rel}`);
    console.error("  run: npm install");
    process.exit(1);
  }
  const out = path.join(dest, outName);
  fs.copyFileSync(src, out);
  console.log(`[vendor:xterm] ${outName} (${fs.statSync(out).size} bytes)`);
}

console.log(`[vendor:xterm] wrote ${dest}`);
