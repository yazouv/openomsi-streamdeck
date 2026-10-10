// Produit les images du manifest (icônes de la liste des actions, touches par défaut,
// icône du plugin) à partir des mêmes dessins que les touches en jeu.
// node scripts/make-images.ts (Node 22.18+ lit le TypeScript directement)

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLORS, ICONS, svg, type IconName, type Look } from "../src/render.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "fr.yazouv.openomsi.sdPlugin", "imgs");

function write(path: string, data: string | Buffer): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, data);
}

/** Un glyphe blanc sur fond transparent (liste des actions, catégorie). */
function glyph(icon: IconName, size: number): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${ICONS[icon]}" fill="#FFFFFF"/></svg>`;
}

const actions: Record<string, Look> = {
	door: { icon: "door", label: "Portes" },
	dev: { icon: "unlock", label: "DEV" },
	stopbrake: { icon: "octagon", label: "Frein arrêt" },
	indicator: { icon: "left", label: "Gauche" },
	lights: { icon: "lights", label: "Croisement" },
	handbrake: { icon: "handbrake", label: "Frein park." },
	engine: { icon: "power", label: "Moteur" },
	gear: { icon: "shifter", value: "D", label: "Marche" },
	horn: { icon: "horn", label: "Klaxon" },
	interior: { icon: "bulb", label: "Éclairage" },
	view: { icon: "eye", label: "Conducteur" },
	pause: { icon: "pause", label: "Pause" },
	custom: { icon: "bolt", label: "Action" },
	info: { icon: "bus", value: "42", label: "km/h" },
};

for (const [id, look] of Object.entries(actions)) {
	write(join(root, "actions", id, "icon.svg"), glyph(look.icon, 20));
	write(join(root, "actions", id, "key.svg"), svg(look));
}

write(join(root, "plugin", "category.svg"), glyph("bus", 28));

const pluginIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<rect width="256" height="256" rx="56" fill="${COLORS.orange}"/>
<g transform="translate(40 40) scale(7.33)"><path d="${ICONS.bus}" fill="#FFFFFF"/></g></svg>`;
for (const [name, width] of [["icon.png", 256], ["icon@2x.png", 512]] as const) {
	const png = new Resvg(pluginIcon, { fitTo: { mode: "width", value: width } }).render().asPng();
	write(join(root, "plugin", name), png);
}

console.log(`Images écrites dans ${root}`);
