import streamDeck, {
	action,
	SingletonAction,
	type Action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyUpEvent,
	type SendToPluginEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { game } from "./game.js";
import { COLORS, dataUrl, type Look } from "./render.js";

type Settings = Record<string, string>;

/** La phase du clignotement (clignotants, warning) : change toutes les 0,4 s. */
let blink = true;
const blinkers = new EventTarget();
setInterval(() => {
	blink = !blink;
	blinkers.dispatchEvent(new Event("tick"));
}, 400);

/**
 * Une touche liée au jeu : elle se redessine à chaque nouvel état reçu (seulement si son
 * image change) et envoie des commandes au plugin Lua.
 */
abstract class GameAction extends SingletonAction<Settings> {
	#settings = new Map<string, Settings>();
	#drawn = new Map<string, string>();

	constructor() {
		super();
		game.on("update", () => this.redraw());
	}

	/** L'image de la touche pour ces réglages et l'état du jeu actuel. */
	abstract look(settings: Settings): Look;

	/** Les réglages d'une touche ont changé (`undefined` : la touche a disparu). */
	protected settingsChanged(_id: string, _settings: Settings | undefined): void {}

	override onWillAppear(ev: WillAppearEvent<Settings>): void {
		this.#settings.set(ev.action.id, ev.payload.settings);
		this.settingsChanged(ev.action.id, ev.payload.settings);
		this.#drawn.delete(ev.action.id);
		this.#draw(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.#settings.delete(ev.action.id);
		this.settingsChanged(ev.action.id, undefined);
		this.#drawn.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		this.#settings.set(ev.action.id, ev.payload.settings);
		this.settingsChanged(ev.action.id, ev.payload.settings);
		this.#draw(ev.action);
	}

	redraw(): void {
		for (const a of this.actions) this.#draw(a);
	}

	#draw(a: Action<Settings>): void {
		if (!a.isKey()) return;
		let look = this.look(this.#settings.get(a.id) ?? {});
		if (!game.online) look = { ...look, offline: true, on: false, value: look.value === undefined ? undefined : "—" };
		const image = dataUrl(look);
		if (this.#drawn.get(a.id) === image) return;
		this.#drawn.set(a.id, image);
		void a.setImage(image);
	}

	/** Envoie une commande ; la touche montre un ⚠ quand le jeu ne l'a pas exécutée. */
	async run(a: Action<Settings>, command: string): Promise<void> {
		const ok = await game.send(command);
		if (!ok && a.isKey()) {
			streamDeck.logger.warn(`Commande refusée ou sans réponse : ${command}`);
			await a.showAlert();
		}
	}
}

// --- Conduite -------------------------------------------------------------------------

@action({ UUID: "fr.yazouv.openomsi.door" })
export class DoorAction extends GameAction {
	look(s: Settings): Look {
		const n = Number(s.door ?? "0");
		const bus = game.bus;
		const open = n === 0 ? !!bus?.doors_open || !!bus?.doors?.some(Boolean) : !!bus?.doors?.[n - 1];
		return { icon: "door", label: n === 0 ? "Portes" : `Porte ${n}`, on: open, color: COLORS.green };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, `door ${Number(ev.payload.settings.door ?? "0")}`);
	}
}

/** Le DEV : CG_active (bus français) ; sur le C2, la libération des portes (bus_dooraft). */
@action({ UUID: "fr.yazouv.openomsi.dev" })
export class DevAction extends GameAction {
	look(): Look {
		return { icon: "unlock", label: "DEV", on: !!game.bus?.dev, color: COLORS.amber };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, "dev");
	}
}

/** Le frein d'arrêt (break valve, bremse_halte) : bus_dooraft, la touche − d'OMSI. */
@action({ UUID: "fr.yazouv.openomsi.stopbrake" })
export class StopBrakeAction extends GameAction {
	look(): Look {
		return { icon: "octagon", label: "Frein arrêt", on: !!game.bus?.stop_brake, color: COLORS.red };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, "stopbrake");
	}
}

const GEARS = {
	D: { label: "Marche", color: COLORS.green },
	N: { label: "Neutre", color: COLORS.blue },
	R: { label: "Arrière", color: COLORS.red },
} as const;

/** La boîte automatique : une touche par position, allumée quand elle est engagée. */
@action({ UUID: "fr.yazouv.openomsi.gear" })
export class GearAction extends GameAction {
	look(s: Settings): Look {
		const pos = (s.pos ?? "D") in GEARS ? (s.pos ?? "D") as keyof typeof GEARS : "D";
		const g = GEARS[pos];
		return { icon: "shifter", value: pos, label: g.label, on: game.bus?.selector === pos, color: g.color };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const pos = ev.payload.settings.pos ?? "D";
		return this.run(ev.action, `gear ${pos in GEARS ? pos : "D"}`);
	}
}

const SIDES = {
	left: { icon: "left", label: "Gauche" },
	right: { icon: "right", label: "Droite" },
	hazard: { icon: "hazard", label: "Warning" },
} as const;

@action({ UUID: "fr.yazouv.openomsi.indicator" })
export class IndicatorAction extends GameAction {
	constructor() {
		super();
		blinkers.addEventListener("tick", () => this.redraw());
	}
	look(s: Settings): Look {
		const side = (s.side ?? "left") as keyof typeof SIDES;
		const current = game.bus?.indicator ?? "off";
		const active = current === side || (current === "hazard" && side !== "hazard");
		const { icon, label } = SIDES[side] ?? SIDES.left;
		return { icon, label, on: active && blink, color: side === "hazard" ? COLORS.red : COLORS.amber };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, `indicator ${ev.payload.settings.side ?? "left"}`);
	}
}

const LIGHTS = {
	side: { action: "kw_standlicht_toggle", label: "Veilleuses", level: 1, color: COLORS.green },
	dipped: { action: "kw_scheinwerfer_toggle", label: "Croisement", level: 2, color: COLORS.green },
	high: { action: "kw_fernlicht_toggle", label: "Route", level: 3, color: COLORS.blue },
} as const;

@action({ UUID: "fr.yazouv.openomsi.lights" })
export class LightsAction extends GameAction {
	look(s: Settings): Look {
		const l = LIGHTS[(s.mode ?? "dipped") as keyof typeof LIGHTS] ?? LIGHTS.dipped;
		return { icon: "lights", label: l.label, on: (game.bus?.headlights ?? 0) >= l.level, color: l.color };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const l = LIGHTS[(ev.payload.settings.mode ?? "dipped") as keyof typeof LIGHTS] ?? LIGHTS.dipped;
		return this.run(ev.action, `action ${l.action}`);
	}
}

@action({ UUID: "fr.yazouv.openomsi.handbrake" })
export class HandbrakeAction extends GameAction {
	look(): Look {
		return { icon: "handbrake", label: "Frein park.", on: !!game.bus?.handbrake, color: COLORS.red };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, "handbrake");
	}
}

@action({ UUID: "fr.yazouv.openomsi.engine" })
export class EngineAction extends GameAction {
	look(): Look {
		const bus = game.bus;
		const label = bus?.engine ? "Moteur" : bus?.electrics ? "Contact" : "Moteur";
		return { icon: "power", label, on: !!bus?.engine, color: COLORS.green };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, "engine");
	}
}

@action({ UUID: "fr.yazouv.openomsi.horn" })
export class HornAction extends GameAction {
	look(): Look {
		return { icon: "horn", label: "Klaxon", on: !!game.bus?.horn };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, "horn 1");
	}
	override onKeyUp(ev: KeyUpEvent<Settings>): Promise<void> {
		return this.run(ev.action, "horn 0");
	}
}

@action({ UUID: "fr.yazouv.openomsi.interior" })
export class InteriorLightAction extends GameAction {
	look(): Look {
		return { icon: "bulb", label: "Éclairage", on: (game.bus?.interior_light ?? 0) > 0.05, color: COLORS.amber };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, "interior");
	}
}

// --- Jeu ------------------------------------------------------------------------------

/** Les vues de omsi.camera.set_view, et leur nom dans l'état du jeu. */
const VIEWS = {
	driver: { label: "Conducteur", state: "driver" },
	pax: { label: "Passager", state: "pax" },
	outside: { label: "Extérieur", state: "outside" },
	map: { label: "Caméra libre", state: "free" },
	ego: { label: "À pied", state: "foot" },
} as const;

@action({ UUID: "fr.yazouv.openomsi.view" })
export class ViewAction extends GameAction {
	look(s: Settings): Look {
		const v = VIEWS[(s.view ?? "driver") as keyof typeof VIEWS] ?? VIEWS.driver;
		return { icon: "eye", label: v.label, on: game.state?.view === v.state, color: COLORS.blue };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const view = ev.payload.settings.view ?? "driver";
		return this.run(ev.action, `view ${view in VIEWS ? view : "driver"}`);
	}
}

@action({ UUID: "fr.yazouv.openomsi.pause" })
export class PauseAction extends GameAction {
	look(): Look {
		return { icon: "pause", label: "Pause", on: !!game.state?.paused };
	}
	override onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		return this.run(ev.action, "pause");
	}
}

/** Un bouton du bus (trigger de script) ou une action de keyboard.cfg, au choix du joueur. */
@action({ UUID: "fr.yazouv.openomsi.custom" })
export class CustomAction extends GameAction {
	/** Le nom tapé à la main, sinon celui choisi dans la liste des triggers du bus. */
	#name(s: Settings): string {
		return (s.name ?? "").trim() || (s.pick ?? "").trim();
	}

	look(s: Settings): Look {
		const name = this.#name(s);
		const variable = (s.var ?? "").trim();
		const value = variable ? game.bus?.vars?.[variable] : undefined;
		return { icon: "bolt", label: (s.label ?? "").trim() || name || "À régler", on: !!value, color: COLORS.amber };
	}

	protected override settingsChanged(id: string, s: Settings | undefined): void {
		game.watch(id, s && (s.var ?? "").trim() ? s.var.trim() : undefined);
	}

	#command(s: Settings, down?: boolean): string | null {
		const name = this.#name(s);
		if (!name || /s/.test(name)) return null;
		const kind = s.kind === "game" || s.kind === "action" ? s.kind : "trigger";
		if (down === undefined || kind === "game") return `${kind} ${name}`;
		return `${kind} ${name} ${down ? 1 : 0}`;
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const s = ev.payload.settings;
		const cmd = this.#command(s, s.mode === "hold" ? true : undefined);
		if (cmd) await this.run(ev.action, cmd);
		else await ev.action.showAlert();
	}

	override async onKeyUp(ev: KeyUpEvent<Settings>): Promise<void> {
		const s = ev.payload.settings;
		if (s.mode !== "hold" || s.kind === "game") return;
		const cmd = this.#command(s, false);
		if (cmd) await this.run(ev.action, cmd);
	}

	/** La liste des triggers du bus pour la page de réglages (datasource "triggers"). */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event !== "triggers") return;
		const names = await game.triggers();
		const doors = names.filter((n) => /door|tuer|cg_|dev|freigabe|kneel/i.test(n));
		const items = names.length
			? [
					{ label: "Portes, DEV, kneeling", children: doors.map((n) => ({ label: n, value: n })) },
					{ label: "Tous les boutons du bus", children: names.map((n) => ({ label: n, value: n })) },
				]
			: [{ label: game.online ? "Monte dans un bus puis actualise" : "Lance openOMSI puis actualise", value: "", disabled: true }];
		await streamDeck.ui.sendToPropertyInspector({ event: "triggers", items });
	}
}

// --- Affichage ------------------------------------------------------------------------

function clock(seconds?: number): string | undefined {
	if (seconds === undefined) return undefined;
	const m = Math.floor(seconds / 60) % (24 * 60);
	return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function delay(seconds: number): string {
	const s = Math.round(Math.abs(seconds));
	return `${seconds >= 0 ? "+" : "-"}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

@action({ UUID: "fr.yazouv.openomsi.info" })
export class InfoAction extends GameAction {
	look(s: Settings): Look {
		const st = game.state;
		const bus = game.bus;
		const duty = game.online ? st?.duty : undefined;
		const none = "—";
		switch (s.field ?? "speed") {
			case "limit":
				return { icon: "bus", value: bus?.limit ? `${Math.round(bus.limit)}` : none, label: "Limite" };
			case "delay": {
				if (duty?.delay === undefined) return { icon: "info", value: none, label: "Retard" };
				const late = duty.delay >= 60;
				const early = duty.delay <= -60;
				return {
					icon: "info",
					value: delay(duty.delay),
					label: duty.delay < 0 ? "Avance" : "Retard",
					on: late || early,
					color: late ? COLORS.red : COLORS.blue,
				};
			}
			case "next_stop":
				return { icon: "bell", value: duty?.next_stop ?? none, label: duty?.at_stop ? "À l'arrêt" : "Prochain", on: !!duty?.at_stop, color: COLORS.green };
			case "clock":
				return { icon: "info", value: clock(st?.clock) ?? none, label: "Heure" };
			case "line":
				return { icon: "bus", value: duty?.line ? `${duty.line}/${duty.tour ?? ""}` : none, label: duty?.terminus ?? "Ligne" };
			case "passengers":
				return { icon: "bus", value: bus?.passengers !== undefined ? `${bus.passengers}` : none, label: "Passagers" };
			case "gear": {
				const g = bus?.gear;
				return { icon: "bus", value: g === undefined ? none : g < 0 ? "R" : g === 0 ? "N" : `${g}`, label: "Rapport" };
			}
			case "fuel":
				return { icon: "bus", value: bus?.fuel !== undefined ? `${Math.round(bus.fuel)} L` : none, label: "Carburant" };
			case "stop_request":
				return { icon: "bell", label: "Arrêt dem.", on: !!bus?.stop_request, color: COLORS.amber };
			default:
				return { icon: "bus", value: bus?.speed !== undefined ? `${Math.round(Math.abs(bus.speed))}` : none, label: "km/h" };
		}
	}
}
