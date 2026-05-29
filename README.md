# Korean Text Rendering in Image Models — Benchmark

How accurately do text-to-image models draw **Korean (Hangul)** text? Most rendering benchmarks are English-centric and skip the writing systems where models actually struggle. This one measures it directly, reproducibly, with a single command.

![demo](docs/demo.gif)

## Leaderboard

5 text-capable models × 8 Hangul prompts. Each model draws the target text on a plain poster; the rendered text is transcribed by GPT-4o and scored by **character error rate (CER)**, lower is better. Whitespace is ignored.

| Rank | Model | Mean CER | Exact matches |
|---:|---|---:|---:|
| 1 | recraft-v4 | **0.000** | 8 / 8 (100%) |
| 2 | seedream-5 | **0.000** | 8 / 8 (100%) |
| 3 | gpt-image-1.5 | 0.031 | 7 / 8 (88%) |
| 4 | ideogram-v3 | 0.050 | 7 / 8 (88%) |
| 5 | flux-2-flash | 0.125 | 6 / 8 (75%) |

Snapshot from 2026-05-29 via the fal.ai endpoints. Full per-prompt table in [REPORT.md](./REPORT.md), raw rows (including image URLs) in [results.json](./results.json).

## What breaks

The simple greetings are basically solved everywhere. Models slip on:

- **Complex jamo.** `닭갈비` (the cluster ㄺ) tripped ideogram into `덩갈비멋집` (CER 0.40).
- **Longer / less common strings.** `주식회사 아이오브` came out of flux-2-flash as `주성휘브` (CER 0.75).
- **Digits mixed with Hangul.** `9월 14일 토요일` became `9월 14일 토세언` on flux (CER 0.25).

Two models (recraft-v4, seedream-5) rendered every prompt perfectly, including the hard ones.

## Reproduce

No dependencies beyond Node 18+ (uses global `fetch`).

```bash
export FAL_API_KEY=...      # image generation (fal.ai)
export OPENAI_API_KEY=...   # OCR (GPT-4o)
node run.mjs                # writes results.json + REPORT.md
node summary.mjs            # pretty-prints the saved results (used for the GIF)
```

Edit [`prompts.json`](./prompts.json) to add targets, or the `MODELS` list in [`run.mjs`](./run.mjs) to test more models. One run is ~40 generations (a few dollars of API).

## Method

- One image per (model, prompt) with an identical instruction: white poster, black sans-serif, the target Hangul as the only text. This isolates text rendering from style.
- GPT-4o transcribes the largest visible text; CER = Levenshtein(read, target) / |target|, whitespace stripped. CER 0 = perfect; exact-match rate = share of perfect renders.

## Honest limits

- **OCR is itself a model.** GPT-4o can misread, so CER is a proxy, not ground truth.
- **Small n.** One image per cell, no seeds or aspect ratios swept. Treat this as a snapshot, not a verdict; rerun for your own prompts.
- **Endpoints move.** Model versions and fal.ai paths change over time; the numbers are dated.

## Context

Part of IOV LABS research on verifiable quality for generative media: using cheap automatic checkers (OCR/CER here) as a gate and a routing signal. Korean text rendering was flagged as an open field in that note, this repo is the first measurement.

## Citation

A `CITATION.cff` is included, GitHub shows a "Cite this repository" button. 

## License

Code: [MIT](./LICENSE). The writeup and results may be reused under CC BY 4.0 with attribution.
