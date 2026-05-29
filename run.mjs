// Korean text-rendering benchmark.
// For each (prompt, model): generate an image (fal.ai), OCR the rendered text (GPT-4o),
// and score character error rate (CER) against the target Hangul string.
// Writes results.json + REPORT.md. Reproduce: FAL_API_KEY=… OPENAI_API_KEY=… node run.mjs
import { readFileSync, writeFileSync } from "node:fs";

const FAL = process.env.FAL_API_KEY, OAI = process.env.OPENAI_API_KEY;
if (!FAL || !OAI) { console.error("Set FAL_API_KEY and OPENAI_API_KEY"); process.exit(1); }

// Text-capable image models across the price range. sizeMode mirrors each endpoint's API.
const MODELS = [
  { id: "ideogram-v3",     endpoint: "fal-ai/ideogram/v3",                                  size: "ar" },
  { id: "recraft-v4",      endpoint: "fal-ai/recraft/v4/text-to-image",                     size: "ar" },
  { id: "recraft-v4-pro",  endpoint: "fal-ai/recraft/v4/pro/text-to-image",                 size: "ar" },
  { id: "gpt-image-1.5",   endpoint: "fal-ai/gpt-image-1.5",                                size: "ar" },
  { id: "gpt-image-2",     endpoint: "openai/gpt-image-2",                                  size: "ar" },
  { id: "seedream-5",      endpoint: "fal-ai/bytedance/seedream/v5/lite/text-to-image",     size: "px" },
  { id: "nano-banana-pro", endpoint: "fal-ai/nano-banana-pro",                              size: "ar" },
  { id: "imagen-4",        endpoint: "fal-ai/imagen4/preview",                              size: "ar" },
  { id: "flux-2-flash",    endpoint: "fal-ai/flux-2/flash",                                 size: "hd" },
];
const PROMPTS = JSON.parse(readFileSync(new URL("./prompts.json", import.meta.url)));
const tmpl = (t) => `A clean minimalist poster. Large bold Korean text that reads exactly "${t}", centered. Plain white background, black sans-serif lettering, high resolution, sharp legible type, no other text.`;

const norm = (s) => (s || "").replace(/\s+/g, "").trim(); // ignore whitespace for CER
function cer(pred, ref) {
  const a = [...norm(ref)], b = [...norm(pred)];
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return a.length ? d[a.length][b.length] / a.length : (b.length ? 1 : 0);
}

async function withTimeout(fn, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fn(c.signal); } finally { clearTimeout(t); }
}
async function gen(m, prompt) {
  const body = { prompt, num_images: 1 };
  if (m.size === "ar") body.aspect_ratio = "1:1";
  else if (m.size === "px") body.image_size = { width: 1024, height: 1024 };
  else body.image_size = "square_hd";
  const r = await withTimeout((signal) => fetch(`https://fal.run/${m.endpoint}`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Key ${FAL}` },
    body: JSON.stringify(body),
  }), 150_000);
  const j = await r.json();
  if (!r.ok) throw new Error(`fal ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
  const url = j.images?.[0]?.url || j.image?.url || j.output?.url;
  if (!url) throw new Error("no image url");
  return url;
}

async function ocr(url) {
  const r = await withTimeout((signal) => fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OAI}` },
    body: JSON.stringify({ model: "gpt-4o", temperature: 0, max_tokens: 80, messages: [{ role: "user", content: [
      { type: "text", text: "Transcribe EXACTLY the main large text in this image, verbatim, Korean included. If unreadable or none, reply empty string. Reply ONLY JSON: {\"text\":\"...\"}" },
      { type: "image_url", image_url: { url, detail: "low" } },
    ] }] }),
  }), 90_000);
  const j = await r.json();
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const t = j.choices?.[0]?.message?.content || "";
  const mm = t.match(/\{[\s\S]*\}/);
  try { return JSON.parse(mm[0]).text ?? ""; } catch { return ""; }
}

async function pool(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); }
  }));
  return out;
}

// Resume: reuse successful cells from a prior results.json, only (re)run the rest.
const prior = {};
try {
  const old = JSON.parse(readFileSync(new URL("./results.json", import.meta.url)));
  for (const r of old.rows || []) if (r.cer != null) prior[`${r.model}|${r.prompt}`] = r;
} catch { /* first run */ }

const rows = [];
const tasks = [];
for (const m of MODELS) for (const p of PROMPTS) {
  const cached = prior[`${m.id}|${p.id}`];
  if (cached) { rows.push(cached); continue; }
  tasks.push(async () => {
    const prompt = tmpl(p.text);
    try {
      const url = await gen(m, prompt);
      const read = await ocr(url);
      const score = cer(read, p.text);
      const row = { model: m.id, prompt: p.id, target: p.text, read, cer: score, exact: score === 0, url };
      process.stdout.write(`  ${m.id.padEnd(15)} ${p.id.padEnd(11)} target=[${p.text}] read=[${(read||"").replace(/\n/g," ")}] CER=${score.toFixed(2)}${score === 0 ? " EXACT" : ""}\n`);
      return row;
    } catch (e) {
      process.stdout.write(`  ${m.id.padEnd(15)} ${p.id.padEnd(11)} FAILED: ${String(e.message).slice(0, 80)}\n`);
      return { model: m.id, prompt: p.id, target: p.text, read: null, cer: null, exact: false, url: null, error: String(e.message) };
    }
  });
}

console.log(`Korean text-rendering benchmark: ${MODELS.length} models x ${PROMPTS.length} prompts. reused ${rows.length}, running ${tasks.length}.\n`);
rows.push(...await pool(tasks, 4));

// Aggregate per model
const agg = MODELS.map((m) => {
  const rs = rows.filter((r) => r.model === m.id);
  const ok = rs.filter((r) => r.cer != null);
  const meanCer = ok.length ? ok.reduce((s, r) => s + r.cer, 0) / ok.length : null;
  const exact = ok.filter((r) => r.exact).length;
  return { model: m.id, n: ok.length, fails: rs.length - ok.length, meanCer, exactRate: ok.length ? exact / ok.length : 0, exact };
}).sort((a, b) => (a.meanCer ?? 9) - (b.meanCer ?? 9));

writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify({ rows, agg }, null, 2));

// REPORT.md
const pct = (x) => `${Math.round(x * 100)}%`;
const f2 = (x) => x == null ? "n/a" : x.toFixed(3);
let md = `# Korean Text Rendering in Image Models — Results\n\n`;
md += `> Generated by \`node run.mjs\`. ${MODELS.length} models x ${PROMPTS.length} Hangul prompts. OCR by GPT-4o, CER ignores whitespace.\n\n`;
md += `## Leaderboard (lower CER is better)\n\n| Rank | Model | Mean CER | Exact matches | n | fails |\n|---:|---|---:|---:|---:|---:|\n`;
agg.forEach((a, i) => { md += `| ${i+1} | ${a.model} | **${f2(a.meanCer)}** | ${a.exact}/${a.n} (${pct(a.exactRate)}) | ${a.n} | ${a.fails} |\n`; });
md += `\n## Per-prompt detail\n\n| Prompt | Target | ` + agg.map(a => a.model).join(" | ") + ` |\n|---|---|` + agg.map(() => "---").join("|") + `|\n`;
for (const p of PROMPTS) {
  md += `| ${p.id} | ${p.target} | ` + agg.map(a => {
    const r = rows.find(x => x.model === a.model && x.prompt === p.id);
    return r?.error ? "fail" : `${f2(r.cer)}${r.exact ? " ✓" : ""}`;
  }).join(" | ") + ` |\n`;
}
md += `\n## Method\n\n- Each model generates one image per prompt with an identical instruction (white poster, black sans-serif, the target Hangul as the only text).\n- The rendered text is transcribed by GPT-4o vision, then scored by character error rate (Levenshtein / target length), whitespace ignored.\n- CER 0 means a perfect render; exact-match rate is the share of perfect renders.\n\n## Honest limits\n\n- OCR is itself a model (GPT-4o) and can misread; CER is a proxy, not ground truth.\n- One image per cell, no seeds swept: small-n, treat as a snapshot not a verdict.\n- Endpoints and model versions move; rerun to refresh.\n`;
writeFileSync(new URL("./REPORT.md", import.meta.url), md);

console.log(`\n=== Leaderboard (mean CER, lower is better) ===`);
agg.forEach((a, i) => console.log(`  ${i+1}. ${a.model.padEnd(14)} CER ${f2(a.meanCer)}  exact ${a.exact}/${a.n} (${pct(a.exactRate)})${a.fails ? `  [${a.fails} fail]` : ""}`));
console.log(`\nWrote results.json + REPORT.md`);
