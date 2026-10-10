// Dessin des touches en SVG (144 × 144). Pas d'import : scripts/make-images.ts charge ce
// fichier tel quel pour produire les images du manifest.

/** Icônes 24 × 24 (Material Icons, licence Apache 2.0). */
export const ICONS = {
	bus: "M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z",
	door: "M5 3h14v16h2v2H3v-2h2V3zm2 2v14h4V5H7zm6 0v14h4V5h-4zm-3 6h-1v2h1v-2zm5 0h-1v2h1v-2z",
	left: "M2 12l9-8v5h11v6H11v5z",
	right: "M22 12l-9-8v5H2v6h11v5z",
	hazard: "M12 2L1 21h22L12 2zm0 4.5L19.5 19h-15L12 6.5zm0 3.5l-4.5 7.5h9L12 10z",
	lights: "M10 5C6.1 5 3 8.1 3 12s3.1 7 7 7h1V5h-1zm3 1v2h8V6h-8zm0 5v2h8v-2h-8zm0 5v2h8v-2h-8z",
	handbrake: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-3 3v10h2v-3h2a3.5 3.5 0 000-7H9zm2 2h2a1.5 1.5 0 010 3h-2V9z",
	power: "M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z",
	horn: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
	bulb: "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z",
	bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
	eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
	pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
	bolt: "M7 2v11h3v9l7-12h-4l4-8z",
	octagon: "M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27L15.73 3zM19 14.9L14.9 19H9.1L5 14.9V9.1L9.1 5h5.8L19 9.1v5.8zM11 7h2v7h-2zm0 8h2v2h-2z",
	unlock: "M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z",
	info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
};

export type IconName = keyof typeof ICONS;

/** Couleurs : l'orange d'openOMSI, l'ambre des clignotants, le vert des portes. */
export const COLORS = {
	orange: "#F47F30",
	amber: "#FFB300",
	green: "#3DDC84",
	red: "#FF5252",
	blue: "#4FC3F7",
	text: "#E8EAED",
	muted: "#80868B",
	bg: "#1B1E23",
};

export type Look = {
	icon: IconName;
	/** Texte en bas de la touche. */
	label?: string;
	/** Une valeur en gros au milieu (à la place de la grande icône). */
	value?: string;
	/** Allumée : fond teinté et icône en couleur. */
	on?: boolean;
	/** Couleur quand la touche est allumée. */
	color?: string;
	/** Le jeu ne répond pas : touche grisée. */
	offline?: boolean;
};

const escape = (s: string): string =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Raccourcit un texte trop long pour la touche. */
function fit(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/** Coupe un texte long en deux lignes, au mot le plus proche du milieu. */
function wrap(s: string, max: number): string[] {
	if (s.length <= max) return [s];
	let cut = -1;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === " " && (cut < 0 || Math.abs(i - s.length / 2) < Math.abs(cut - s.length / 2))) cut = i;
	}
	if (cut < 0) return [fit(s, max)];
	return [fit(s.slice(0, cut), max), fit(s.slice(cut + 1), max)];
}

/** La taille de police : `big` jusqu'à `room` caractères, plus petite au-delà. */
function fontFor(s: string, big: number, room: number): number {
	return Math.max(18, Math.min(big, Math.floor((big * room) / Math.max(1, s.length))));
}

export function svg(look: Look): string {
	const color = look.color ?? COLORS.orange;
	const on = !!look.on && !look.offline;
	const fg = look.offline ? COLORS.muted : on ? color : COLORS.text;
	const bg = on ? `<rect x="3" y="3" width="138" height="138" rx="18" fill="${color}" opacity="0.22"/>` : "";
	const ring = on ? `<rect x="3" y="3" width="138" height="138" rx="18" fill="none" stroke="${color}" stroke-width="6"/>` : "";
	const font = `font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"`;
	const label = look.label ? fit(look.label, 12) : "";

	let body: string;
	if (look.value !== undefined) {
		const lines = wrap(look.value, 11);
		const size = lines.length > 1 ? Math.min(...lines.map((l) => fontFor(l, 22, 9))) : fontFor(lines[0], 46, 5);
		const top = lines.length > 1 ? 82 : 92 + size / 4;
		body =
			`<g transform="translate(56 12) scale(1.33)"><path d="${ICONS[look.icon]}" fill="${fg}" opacity="0.9"/></g>` +
			lines
				.map((l, i) => `<text x="72" y="${top + i * (size + 4)}" ${font} font-size="${size}" font-weight="700" fill="${fg}" text-anchor="middle">${escape(l)}</text>`)
				.join("");
	} else {
		const y = label ? 16 : 30;
		body = `<g transform="translate(36 ${y}) scale(3)"><path d="${ICONS[look.icon]}" fill="${fg}"/></g>`;
	}
	const text = label
		? `<text x="72" y="132" ${font} font-size="${fontFor(label, 24, 9)}" font-weight="600" fill="${look.offline ? COLORS.muted : COLORS.text}" text-anchor="middle">${escape(label)}</text>`
		: "";
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="${COLORS.bg}"/>${bg}${ring}${body}${text}</svg>`
	);
}

export function dataUrl(look: Look): string {
	return "data:image/svg+xml;base64," + Buffer.from(svg(look)).toString("base64");
}
