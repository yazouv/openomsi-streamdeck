// Vérifie que package.json et le manifest ont la même version (1.3.0 et 1.3.0.0) et, avec
// un tag en argument (v1.3.0), que le tag est cette version.
// node scripts/check-version.mjs [vX.Y.Z]

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const manifest = JSON.parse(readFileSync(new URL("../fr.yazouv.openomsi.sdPlugin/manifest.json", import.meta.url), "utf8")).Version;
const tag = process.argv[2];

const errors = [];
if (manifest !== `${pkg}.0`) errors.push(`manifest.json ${manifest} ≠ package.json ${pkg} (attendu ${pkg}.0)`);
if (tag !== undefined && tag !== `v${pkg}`) errors.push(`tag ${tag} ≠ v${pkg}`);

if (errors.length) {
	for (const e of errors) console.error(`::error::${e}`);
	process.exit(1);
}
console.log(`Version ${pkg}${tag ? ` (tag ${tag})` : ""} : ok`);
