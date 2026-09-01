/* Export the country records to data/countries.json.
 *
 * The records live as JS constants in src/data_c*.js because the prototype is a
 * single standalone HTML file. Anything outside the browser - the slide
 * generator today, the API tomorrow - needs them as plain data.
 *
 *   node tools/export_countries.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PARTS = ["data_c1.js", "data_c2.js", "data_c3.js", "data_c4.js"];

let src = "";
PARTS.forEach(f => { src += fs.readFileSync(path.join(ROOT, "src", "reg", "nis2", f), "utf8") + "\n"; });

const box = {};
eval(src + "\nbox.all = [...COUNTRIES_1, ...COUNTRIES_2, ...COUNTRIES_3, ...COUNTRIES_4];");

const out = path.join(ROOT, "data", "countries.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  generatedOn: new Date().toISOString().slice(0, 10),
  count: box.all.length,
  countries: box.all
}, null, 2) + "\n", "utf8");

console.log(`${box.all.length} countries -> ${path.relative(ROOT, out)}`);
