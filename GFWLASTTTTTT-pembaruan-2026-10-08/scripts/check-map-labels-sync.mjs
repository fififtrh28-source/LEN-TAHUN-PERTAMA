// M-051: memastikan SEA_LABELS / CITY_LABELS di dashboard.html sama dengan assets/js/onx-map-labels.js.
// Jalankan: npm run check:labels
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEA_LABELS, CITY_LABELS } from "../assets/js/onx-map-labels.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(repoRoot, "dashboard.html"), "utf8");

function extract(name) {
  const match = html.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
  if (!match) throw new Error(`${name} tidak ditemukan di dashboard.html`);
  return Function(`"use strict"; return ${match[1]};`)();
}

let ok = true;
for (const [name, moduleList] of [["SEA_LABELS", SEA_LABELS], ["CITY_LABELS", CITY_LABELS]]) {
  const dashboardList = extract(name);
  const fromModule = new Set(moduleList.map((item) => JSON.stringify(item)));
  const fromDashboard = new Set(dashboardList.map((item) => JSON.stringify(item)));
  const onlyModule = [...fromModule].filter((item) => !fromDashboard.has(item));
  const onlyDashboard = [...fromDashboard].filter((item) => !fromModule.has(item));
  if (onlyModule.length || onlyDashboard.length) {
    ok = false;
    console.error(`${name} tidak sinkron.`);
    if (onlyModule.length) console.error(`  Hanya di onx-map-labels.js: ${onlyModule.join(" ")}`);
    if (onlyDashboard.length) console.error(`  Hanya di dashboard.html: ${onlyDashboard.join(" ")}`);
  }
}
if (!ok) process.exit(1);
console.log("SEA_LABELS dan CITY_LABELS sinkron antara dashboard.html dan onx-map-labels.js.");