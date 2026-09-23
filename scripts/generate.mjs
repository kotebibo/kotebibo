/**
 * Renders assets/header.svg — the animated card at the top of the profile.
 *
 * GitHub strips <script> and sanitises CSS in READMEs, but it does render SVGs
 * embedded via <img> and it does run their SMIL animations. So everything here
 * is a single self-contained SVG: no third-party badge service, no tracking
 * pixel, nothing that breaks when someone else's free tier expires.
 *
 *   node scripts/generate.mjs          # uses cached contribution data
 *   GITHUB_TOKEN=... node scripts/generate.mjs   # refreshes it
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const LOGIN = "kotebibo";

/**
 * The contribution grid is off — for now.
 *
 * The calendar reports 41 contributions for the year while the commit search
 * reports 647 authored in the same window. The gap is the "Include private
 * contributions on my profile" setting: the work is here and correctly
 * attributed, GitHub just isn't displaying it. A grid showing 41 would say
 * "doesn't ship", which is the opposite of true, so the card carries a track
 * record instead.
 *
 * Turn the setting on at github.com/settings/profile, then flip this to true —
 * the fetch, the cache and the renderer are all still wired up.
 */
const SHOW_MESH = false;

const C = {
  bg: "#08090c",
  ink: "#dfe3ea",
  dim: "#8a909c",
  faint: "#767d8a",
  rule: "#1c1f26",
  ruleStrong: "#2c313b",
  accent: "#4d9fff",
};

const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ *
 * Live data
 * ------------------------------------------------------------------ */

const CACHE = "assets/contributions.json";

async function contributions() {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": LOGIN,
        },
        body: JSON.stringify({
          query: `query($login:String!){
            user(login:$login){
              contributionsCollection{
                contributionCalendar{
                  totalContributions
                  weeks{ contributionDays{ contributionCount date } }
                }
              }
            }
          }`,
          variables: { login: LOGIN },
        }),
      });
      const json = await res.json();
      const cal = json?.data?.user?.contributionsCollection?.contributionCalendar;
      if (cal?.weeks?.length) {
        writeFileSync(CACHE, JSON.stringify(cal), "utf8");
        console.log(`fetched ${cal.totalContributions} contributions`);
        return cal;
      }
      console.warn("graphql returned no calendar:", JSON.stringify(json).slice(0, 300));
    } catch (err) {
      console.warn("contribution fetch failed:", err.message);
    }
  }
  // Falling back to the committed snapshot keeps a bad API day from rewriting
  // the card with an empty grid.
  if (existsSync(CACHE)) {
    console.log("using cached contributions");
    return JSON.parse(readFileSync(CACHE, "utf8"));
  }
  console.log("no contribution data — rendering an empty grid");
  return { totalContributions: 0, weeks: [] };
}

function streak(weeks) {
  const days = weeks.flatMap((w) => w.contributionDays).sort((a, b) => a.date.localeCompare(b.date));
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    // today may legitimately be empty; don't let that zero the streak
    if (days[i].contributionCount > 0) n++;
    else if (i !== days.length - 1) break;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

const CH_W = 5.42;
const LINE_H = 9;

function portrait(x, y) {
  if (!existsSync("assets/portrait.txt")) return "";
  const rows = readFileSync("assets/portrait.txt", "utf8").replace(/\n$/, "").split("\n");
  return rows
    .map((row, i) => {
      if (!row.trim()) return "";
      // textLength pins each row's advance width, so the grid stays square even
      // where the viewer has no real monospace font.
      const w = (row.length * CH_W).toFixed(1);
      const delay = (0.35 + i * 0.022).toFixed(3);
      return (
        `<text x="${x}" y="${(y + i * LINE_H).toFixed(1)}" textLength="${w}" lengthAdjust="spacing" ` +
        `xml:space="preserve" font-family="${MONO}" font-size="9" fill="${C.ink}" opacity="0">` +
        `${esc(row)}` +
        `<animate attributeName="opacity" from="0" to="0.82" dur="0.5s" begin="${delay}s" fill="freeze"/>` +
        `</text>`
      );
    })
    .join("");
}

/** A line that types itself, revealed by an expanding clip with a caret riding the edge. */
function typed(x, y, text, size, fill, begin, id) {
  const w = text.length * (size * 0.602);
  const dur = Math.max(0.9, text.length * 0.045);
  return (
    `<defs><clipPath id="${id}">` +
    `<rect x="${x}" y="${y - size}" width="0" height="${size * 1.6}">` +
    `<animate attributeName="width" from="0" to="${w.toFixed(1)}" dur="${dur}s" begin="${begin}s" fill="freeze"/>` +
    `</rect></clipPath></defs>` +
    `<text x="${x}" y="${y}" clip-path="url(#${id})" xml:space="preserve" font-family="${MONO}" ` +
    `font-size="${size}" fill="${fill}">${esc(text)}</text>` +
    `<rect x="${x}" y="${(y - size * 0.82).toFixed(1)}" width="${(size * 0.58).toFixed(1)}" ` +
    `height="${(size * 0.95).toFixed(1)}" fill="${C.accent}" opacity="0">` +
    `<animate attributeName="x" from="${x}" to="${(x + w).toFixed(1)}" dur="${dur}s" begin="${begin}s" fill="freeze"/>` +
    `<animate attributeName="opacity" values="0;1" dur="0.01s" begin="${begin}s" fill="freeze"/>` +
    `<animate attributeName="opacity" values="1;1;0;0" dur="1.1s" begin="${begin + dur}s" repeatCount="indefinite"/>` +
    `</rect>`
  );
}

function label(x, y, text, fill = C.faint, size = 9.5, weight = 500, spacing = "2.2") {
  return (
    `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" font-weight="${weight}" ` +
    `letter-spacing="${spacing}" fill="${fill}">${esc(text)}</text>`
  );
}

function body(x, y, text, fill = C.dim, size = 11.5, weight = 400) {
  return (
    `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" font-weight="${weight}" ` +
    `fill="${fill}">${esc(text)}</text>`
  );
}

function mesh(x, y, weeks) {
  const CELL = 9;
  const GAP = 2.4;
  const levels = [0.07, 0.3, 0.52, 0.76, 1];
  const last = weeks.slice(-53);
  let out = "";
  last.forEach((week, wi) => {
    week.contributionDays.forEach((day, di) => {
      const n = day.contributionCount;
      const lvl = n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 12 ? 3 : 4;
      const cx = x + wi * (CELL + GAP);
      const cy = y + di * (CELL + GAP);
      const begin = (1.6 + wi * 0.016).toFixed(3);
      out +=
        `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${CELL}" height="${CELL}" ` +
        `fill="${lvl === 0 ? C.ruleStrong : C.accent}" opacity="0">` +
        `<animate attributeName="opacity" from="0" to="${levels[lvl]}" dur="0.45s" begin="${begin}s" fill="freeze"/>` +
        `</rect>`;
    });
  });
  return { svg: out, width: last.length * (CELL + GAP) - GAP, height: 7 * (CELL + GAP) - GAP };
}

/** Milestones, evenly spaced. Real dates carry the chronology, not the x axis. */
const TRACK = [
  ["2023", "BTU", "CS bachelor's"],
  ["MAY 2025", "DATAMIND", "Intern · audit logs"],
  ["SEP 2025", "GEOSAFETY", "RouteHub · led ~70%"],
  ["JUL 2026", "MERCATO", "Hackathon 3rd place"],
  ["AUG 2026", "SIEVEWORKS", "3 weeks · on devnet"],
];

function timeline(x, y, width) {
  const step = width / (TRACK.length - 1);
  let out = "";

  // the rail draws itself left to right
  out +=
    `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="${C.ruleStrong}" stroke-width="1" ` +
    `stroke-dasharray="${width}" stroke-dashoffset="${width}">` +
    `<animate attributeName="stroke-dashoffset" from="${width}" to="0" dur="1.1s" begin="1.5s" fill="freeze"/>` +
    `</line>`;

  TRACK.forEach(([when, what, note], i) => {
    const cx = x + i * step;
    const begin = (1.7 + i * 0.16).toFixed(2);
    const current = i === 2;
    // first hugs the left edge, last hugs the right, the rest centre on their
    // node — otherwise the final two labels run into each other
    const anchor = i === 0 ? "start" : i === TRACK.length - 1 ? "end" : "middle";
    const tx = cx;

    out +=
      `<rect x="${(cx - 3.5).toFixed(1)}" y="${y - 3.5}" width="7" height="7" ` +
      `fill="${current ? C.accent : C.bg}" stroke="${current ? C.accent : C.ruleStrong}" opacity="0">` +
      `<animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="${begin}s" fill="freeze"/>` +
      `</rect>`;

    const g =
      `<text x="${tx}" y="${y + 20}" text-anchor="${anchor}" font-family="${MONO}" font-size="8.5" ` +
      `font-weight="500" letter-spacing="1.6" fill="${C.faint}">${esc(when)}</text>` +
      `<text x="${tx}" y="${y + 36}" text-anchor="${anchor}" font-family="${MONO}" font-size="11.5" ` +
      `font-weight="700" letter-spacing="0.3" fill="${current ? C.accent : C.ink}">${esc(what)}</text>` +
      `<text x="${tx}" y="${y + 51}" text-anchor="${anchor}" font-family="${MONO}" font-size="9.5" ` +
      `fill="${C.dim}">${esc(note)}</text>`;

    out += `<g opacity="0">${g}<animate attributeName="opacity" from="0" to="1" dur="0.45s" begin="${begin}s" fill="freeze"/></g>`;
  });

  return { svg: out, height: 58 };
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

const FACTS = [
  ["NOW", "RouteHub — field-operations platform @ GeoSafety"],
  ["BUILDING", "SieveWorks — verifiable distributed compute on Solana"],
  ["STACK", "TypeScript · PostgreSQL · Rust/Anchor · WebAssembly"],
  ["LOCAL", "Tbilisi, Georgia · GMT+4"],
];

const BLURB = [
  "I own systems end to end: schema, migrations, auth,",
  "payments, CI and deployment. Led a production multi-tenant",
  "platform for a year; ship solo products in weeks.",
];

const METRICS = [
  ["700+", "COMMITS LED"],
  ["483", "RLS POLICIES"],
  ["1,200+", "TESTS IN CI"],
  ["150+", "MIGRATIONS"],
];

async function main() {
  mkdirSync("assets", { recursive: true });
  const cal = await contributions();
  const days = streak(cal.weeks ?? []);

  const W = 880;
  const PAD = 26;
  const BAR = 30;

  const PORTRAIT_X = PAD + 4;
  const PORTRAIT_Y = BAR + 34;
  const PORTRAIT_H = 34 * LINE_H;

  const COL = PORTRAIT_X + 43 * CH_W + 34;

  const bodyBottom = Math.max(PORTRAIT_Y + PORTRAIT_H, BAR + 300);
  const METRIC_Y = bodyBottom + 26;
  const METRIC_H = 54;
  const MESH_Y = METRIC_Y + METRIC_H + (SHOW_MESH ? 30 : 42);
  const m = SHOW_MESH
    ? mesh(PAD + 4, MESH_Y, cal.weeks ?? [])
    : timeline(PAD + 6, MESH_Y, W - PAD * 2 - 12);
  const H = Math.round(MESH_Y + m.height + 34);

  const today = new Date().toISOString().slice(0, 10);

  let s = "";

  // frame + title bar
  s += `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="${C.bg}" stroke="${C.rule}"/>`;
  s += `<line x1="0" y1="${BAR}" x2="${W}" y2="${BAR}" stroke="${C.rule}"/>`;
  s += label(PAD, BAR - 11, `${LOGIN}@tbilisi:~`, C.faint, 9.5, 500, "1.6");
  s += `<text x="${W - PAD}" y="${BAR - 11}" text-anchor="end" font-family="${MONO}" font-size="9.5" font-weight="500" letter-spacing="1.6" fill="${C.faint}">BUILD ${today}</text>`;

  // portrait
  s += portrait(PORTRAIT_X, PORTRAIT_Y + 10);

  // name
  let y = PORTRAIT_Y + 34;
  s += `<text x="${COL}" y="${y}" font-family="${MONO}" font-size="34" font-weight="700" letter-spacing="-1.2" fill="${C.ink}">KONSTANTINE</text>`;
  y += 38;
  s += `<text x="${COL}" y="${y}" font-family="${MONO}" font-size="34" font-weight="700" letter-spacing="-1.2" fill="${C.accent}">BIBILAURI</text>`;

  y += 22;
  s += `<line x1="${COL}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${C.rule}"/>`;

  y += 26;
  // ASCII arrow, not "→": a wide glyph throws off the monospace advance the
  // caret position is computed from, and parks the cursor past the text
  s += typed(COL, y, "> full-stack engineer · schema -> deploy", 12.5, C.ink, 0.9, "t1");

  // facts
  y += 30;
  for (const [k, v] of FACTS) {
    s += label(COL, y, k, C.faint, 9, 500, "1.8");
    s += body(COL + 86, y, v, C.dim, 11.5);
    y += 21;
  }

  // prose — balances the column against the portrait's height
  y += 8;
  s += `<line x1="${COL}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${C.rule}"/>`;
  y += 22;
  for (const line of BLURB) {
    s += body(COL, y, line, C.dim, 11, 400);
    y += 17;
  }

  // metrics strip
  s += `<line x1="${PAD}" y1="${METRIC_Y}" x2="${W - PAD}" y2="${METRIC_Y}" stroke="${C.rule}"/>`;
  s += `<line x1="${PAD}" y1="${METRIC_Y + METRIC_H}" x2="${W - PAD}" y2="${METRIC_Y + METRIC_H}" stroke="${C.rule}"/>`;
  const cellW = (W - PAD * 2) / METRICS.length;
  METRICS.forEach(([value, name], i) => {
    const mx = PAD + i * cellW + 16;
    if (i > 0) {
      s += `<line x1="${PAD + i * cellW}" y1="${METRIC_Y}" x2="${PAD + i * cellW}" y2="${METRIC_Y + METRIC_H}" stroke="${C.rule}"/>`;
    }
    s += `<text x="${mx}" y="${METRIC_Y + 26}" font-family="${MONO}" font-size="19" font-weight="700" fill="${C.accent}">${esc(value)}</text>`;
    s += label(mx, METRIC_Y + 42, name, C.faint, 8.5, 500, "1.6");
  });

  // track record (or the contribution grid, when it is worth showing)
  const heading = SHOW_MESH ? "CONTRIBUTIONS · 52 WEEKS" : "TRACK RECORD";
  const right = SHOW_MESH
    ? `${cal.totalContributions ?? 0} TOTAL${days > 1 ? `  ·  ${days} DAY STREAK` : ""}`
    : "OPEN TO WORK";
  s += label(PAD + 6, MESH_Y - 22, heading, C.faint, 8.5, 500, "2");
  s += `<text x="${W - PAD - 6}" y="${MESH_Y - 22}" text-anchor="end" font-family="${MONO}" font-size="8.5" font-weight="500" letter-spacing="2" fill="${C.accent}">${esc(right)}</text>`;
  s += m.svg;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `role="img" aria-label="Konstantine Bibilauri — full-stack engineer, Tbilisi">` +
    `<title>Konstantine Bibilauri — full-stack engineer, Tbilisi</title>` +
    s +
    `</svg>`;

  writeFileSync("assets/header.svg", svg, "utf8");
  console.log(`wrote assets/header.svg  ${W}x${H}  ${(svg.length / 1024).toFixed(1)}KB`);
}

main();
