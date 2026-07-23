/**
 * EPISTEME — menu image regeneration via the Leonardo AI Production API.
 *
 * Usage:  node scripts/generate-menu-images.js
 *
 * Reads LEONARDO_API_KEY from .env.local (never hardcoded, never committed).
 * Parses the dish list from src/data/menu.ts and the English names and
 * descriptions from src/i18n/dictionaries.ts, submits one generation per
 * dish, polls until complete, downloads the image, and saves it with Sharp
 * over the dish's EXISTING filename in public/images/menu/ — so no
 * component code needs to change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Tuning ──────────────────────────────────────────────────────────────────
// Set to Infinity (or remove the .slice below) for the full 45-dish run.
const TEST_LIMIT = 2;

// Leonardo Phoenix 1.0 — swap the id here to use another model (e.g. Lucid
// Realism); any invalid id is reported verbatim by the [LEONARDO_ERROR] log.
const MODEL_ID = 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3';

// Generated at 5:4 (the aspect ratio of the current 250x200 originals), but
// saved at 1200x960: the Phase 7 audit flagged the originals as undersized
// for the ~850px-wide featured cards, so we upgrade resolution while keeping
// aspect + filename identical. Set 250/200 here to match originals exactly.
const GEN_WIDTH = 1120;   // Leonardo dimensions must be multiples of 8
const GEN_HEIGHT = 896;
const OUT_WIDTH = 1200;
const OUT_HEIGHT = 960;

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 180000;
// ────────────────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const API_BASE = 'https://cloud.leonardo.ai/api/rest/v1';

/** Minimal .env.local loader — no dotenv dependency needed. */
function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

/** Dishes with images, in menu order, from src/data/menu.ts (item() calls). */
function readDishes() {
  const src = fs.readFileSync(path.join(ROOT, 'src/data/menu.ts'), 'utf8');
  const dishes = [];
  const itemRe = /item\('([^']+)',\s*'[^']+',\s*'[^']+',\s*'([^']+\.png)'/g;
  let m;
  while ((m = itemRe.exec(src)) !== null) {
    dishes.push({ id: m[1], image: m[2] });
  }
  return dishes;
}

/** English name + description per dish id, from the en block of dictionaries.ts. */
function readEnglishTexts() {
  const src = fs.readFileSync(path.join(ROOT, 'src/i18n/dictionaries.ts'), 'utf8');
  const enStart = src.indexOf('const en: Dictionary');
  const esStart = src.indexOf('const es: Dictionary');
  const enBlock = src.slice(enStart, esStart);
  return (id) => {
    const re = new RegExp(
      `'?${id.replace(/[-]/g, '\\-')}'?:\\s*\\{\\s*name:\\s*'([^']*)',\\s*desc:\\s*'([^']*)'`,
    );
    const match = enBlock.match(re);
    return match ? { name: match[1], desc: match[2] } : null;
  };
}

function buildPrompt(name, desc) {
  return (
    `Ultra high-end fine dining plating of ${name} — ${desc} ` +
    'Luxurious elegant presentation on fine china, professional food photography, ' +
    '8k quality, Michelin-star restaurant style, warm sophisticated lighting, ' +
    'shot from above, studio photography, masterpiece'
  );
}

async function leonardo(pathname, options = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.LEONARDO_API_KEY}`,
      ...(options.headers ?? {}),
    },
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`[LEONARDO_ERROR] ${options.method ?? 'GET'} ${pathname} → HTTP ${res.status}:`, bodyText);
    throw new Error(`Leonardo API error ${res.status}`);
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    console.error(`[LEONARDO_ERROR] non-JSON response from ${pathname}:`, bodyText.slice(0, 500));
    throw new Error('Leonardo response parse failure');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateDish(dish, texts) {
  const en = texts(dish.id);
  if (!en) throw new Error(`no English texts found for dish id "${dish.id}"`);
  const prompt = buildPrompt(en.name, en.desc);
  console.log(`\n── ${en.name} (${dish.id}) ──`);
  console.log(`   prompt: ${prompt.slice(0, 110)}…`);

  // 1) submit
  const submit = await leonardo('/generations', {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      modelId: MODEL_ID,
      width: GEN_WIDTH,
      height: GEN_HEIGHT,
      num_images: 1,
      alchemy: true,
    }),
  });
  const jobId = submit?.sdGenerationJob?.generationId;
  if (!jobId) {
    console.error('[LEONARDO_ERROR] no generationId in submit response:', JSON.stringify(submit).slice(0, 500));
    throw new Error('missing generationId');
  }
  console.log(`   job id: ${jobId}`);

  // 2) poll
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let imageUrl = null;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const status = await leonardo(`/generations/${jobId}`);
    const gen = status?.generations_by_pk;
    console.log(`   poll: ${gen?.status ?? 'UNKNOWN'}`);
    if (gen?.status === 'COMPLETE') {
      imageUrl = gen?.generated_images?.[0]?.url ?? null;
      break;
    }
    if (gen?.status === 'FAILED') {
      console.error('[LEONARDO_ERROR] generation FAILED:', JSON.stringify(gen).slice(0, 500));
      throw new Error('generation failed');
    }
  }
  if (!imageUrl) throw new Error('generation timed out or returned no image URL');

  // 3) download + optimize + save over the existing filename
  console.log(`   downloading: ${imageUrl.slice(0, 80)}…`);
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`image download failed: HTTP ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  const outPath = path.join(ROOT, 'public/images/menu', dish.image);
  await sharp(buffer)
    .resize(OUT_WIDTH, OUT_HEIGHT, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);
  console.log(`   saved: ${path.relative(ROOT, outPath)} (${OUT_WIDTH}x${OUT_HEIGHT})`);
  return outPath;
}

async function main() {
  loadEnvLocal();
  if (!process.env.LEONARDO_API_KEY) {
    console.error('[LEONARDO_ERROR] LEONARDO_API_KEY is not set — put it in .env.local');
    process.exit(1);
  }

  const dishes = readDishes().slice(0, TEST_LIMIT);
  const texts = readEnglishTexts();
  console.log(`Regenerating ${dishes.length} dish image(s): ${dishes.map((d) => d.id).join(', ')}`);

  let failures = 0;
  for (const dish of dishes) {
    try {
      await generateDish(dish, texts);
    } catch (err) {
      failures++;
      console.error(`[LEONARDO_ERROR] ${dish.id} failed:`, err.message);
    }
  }
  console.log(`\nDone: ${dishes.length - failures}/${dishes.length} succeeded.`);
  process.exit(failures ? 1 : 0);
}

main();
