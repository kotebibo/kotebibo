/**
 * One-off: turn a headshot into an ASCII portrait.
 *
 * Run locally when the photo changes; the result is committed as
 * assets/portrait.txt so the daily workflow never needs image tooling.
 *
 *   node scripts/portrait.mjs <image> [--cols 43] [--rows 34]
 *
 * Decoding goes through ffmpeg to raw grayscale, so there are no npm deps.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const SRC = args[0];
if (!SRC) {
  console.error("usage: node scripts/portrait.mjs <image> [--cols N] [--rows N] [--crop w:h:x:y]");
  process.exit(1);
}
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};

const COLS = Number(flag("cols", 43));
const ROWS = Number(flag("rows", 34));
const CROP = flag("crop", null);

// dark -> light. The page background is near-black, so denser glyphs read as
// brighter parts of the face.
const RAMP = " .`':,^-~=+*oaknm#%8@";

const raw = join(tmpdir(), `portrait-${COLS}x${ROWS}.gray`);
const filters = [];
if (CROP) filters.push(`crop=${CROP}`);
filters.push(`scale=${COLS}:${ROWS}:flags=area`, "format=gray");

execFileSync(
  "ffmpeg",
  ["-y", "-v", "error", "-i", SRC, "-vf", filters.join(","), "-f", "rawvideo", "-pix_fmt", "gray", raw],
  { stdio: ["ignore", "ignore", "inherit"] }
);

const px = new Uint8Array(readFileSync(raw));
unlinkSync(raw);
if (px.length !== COLS * ROWS) {
  console.error(`expected ${COLS * ROWS} bytes, got ${px.length}`);
  process.exit(1);
}

const at = (x, y) => px[y * COLS + x];

/**
 * Studio shots sit on a blown-out white sweep. Thresholding alone would also
 * erase the brightest parts of the face, so the background is found by flooding
 * inward from the border and only bright pixels connected to the edge are cut.
 */
const BG_MIN = 205;
const isBg = new Uint8Array(COLS * ROWS);
const queue = [];
for (let x = 0; x < COLS; x++) {
  for (const y of [0, ROWS - 1]) if (at(x, y) >= BG_MIN) queue.push([x, y]);
}
for (let y = 0; y < ROWS; y++) {
  for (const x of [0, COLS - 1]) if (at(x, y) >= BG_MIN) queue.push([x, y]);
}
while (queue.length) {
  const [x, y] = queue.pop();
  const i = y * COLS + x;
  if (isBg[i]) continue;
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
  if (at(x, y) < BG_MIN) continue;
  isBg[i] = 1;
  queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// stretch the surviving subject range across the full ramp
let lo = 255;
let hi = 0;
for (let i = 0; i < px.length; i++) {
  if (isBg[i]) continue;
  if (px[i] < lo) lo = px[i];
  if (px[i] > hi) hi = px[i];
}
const span = Math.max(1, hi - lo);

let out = "";
let filled = 0;
for (let y = 0; y < ROWS; y++) {
  let line = "";
  for (let x = 0; x < COLS; x++) {
    const i = y * COLS + x;
    if (isBg[i]) {
      line += " ";
      continue;
    }
    const t = Math.min(1, Math.max(0, (px[i] - lo) / span));
    const ch = RAMP[Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1)))];
    if (ch !== " ") filled++;
    line += ch;
  }
  out += line.replace(/\s+$/, "") + "\n";
}

writeFileSync("assets/portrait.txt", out, "utf8");
console.log(out);
console.log(
  `${COLS}x${ROWS}  subject range ${lo}-${hi}  ` +
    `background cut ${isBg.reduce((a, b) => a + b, 0)}/${px.length} cells  ` +
    `ink ${((filled / px.length) * 100).toFixed(0)}%`
);
