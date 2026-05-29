// Pretty-print the saved benchmark results (no API calls). Used for the demo GIF.
import { readFileSync } from "node:fs";
const { rows, agg } = JSON.parse(readFileSync(new URL("./results.json", import.meta.url)));
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m", C = "\x1b[36m";

const nPrompts = new Set(rows.map(r => r.prompt)).size;
console.log(`\n${B}Korean Text Rendering in Image Models${X} ${D}— ${agg.length} models x ${nPrompts} Hangul prompts${X}\n`);
console.log(`${D}where models slipped (target -> what was actually drawn):${X}`);
const misses = rows.filter(r => r.cer != null && r.cer > 0).sort((a, b) => b.cer - a.cer).slice(0, 7);
const exacts = rows.filter(r => r.cer === 0 && ["doublecons", "brand"].includes(r.prompt)).slice(0, 2);
for (const r of [...misses, ...exacts]) {
  const col = r.cer === 0 ? G : r.cer < 0.3 ? Y : R;
  const mark = r.cer === 0 ? "OK" : "X ";
  console.log(`  ${C}${r.model.padEnd(13)}${X} ${r.target}  ${D}->${X}  ${col}${(r.read || "(blank)").replace(/\n/g, " ")}${X}  ${col}CER ${r.cer.toFixed(2)} ${mark}${X}`);
}
console.log(`\n${B}Leaderboard${X} ${D}(lower CER is better)${X}`);
agg.forEach((a, i) => {
  const col = a.meanCer === 0 ? G : a.meanCer < 0.1 ? Y : R;
  const bar = "#".repeat(Math.round((a.exactRate) * 20)).padEnd(20, ".");
  console.log(`  ${B}${i+1}.${X} ${C}${a.model.padEnd(14)}${X} ${col}CER ${a.meanCer.toFixed(3)}${X}  ${G}${bar}${X} ${a.exact}/${a.n} exact`);
});
console.log(`\n${D}OCR: GPT-4o  -  CER ignores whitespace  -  reproduce: node run.mjs${X}\n`);
