// Le lien avec openOMSI, par le plugin Lua plugins/streamdeck.lua :
// - le jeu envoie son état en JSON par UDP sur 127.0.0.1:47820 ;
// - les commandes partent en fichiers "<id>.cmd" dans le dossier inbox du plugin Lua, et
//   le jeu répond { ack: id, ok } par le même canal.

import streamDeck from "@elgato/streamdeck";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Le port du plugin Lua ; OPENOMSI_SD_PORT le change (les tests, à côté du vrai plugin). */
export const PORT = Number(process.env.OPENOMSI_SD_PORT) || 47820;
/** Sans nouvelles du jeu depuis ce temps, les touches passent hors ligne. */
const SILENCE_MS = 3000;
const ACK_TIMEOUT_MS = 2000;

export type Bus = {
	speed?: number;
	gear?: number;
	engine?: boolean;
	rpm?: number;
	electrics?: boolean;
	doors_open?: boolean;
	/** Chaque porte ouverte ou non (absent quand le plugin Lua ne peut pas les répartir). */
	doors?: boolean[];
	/** Le DEV (déverrouillage / libération des portes) est actif. */
	dev?: boolean;
	/** La position de la boîte automatique. */
	selector?: "D" | "N" | "R";
	/** Les variables de script suivies (watch.txt). */
	vars?: Record<string, number>;
	indicator?: "off" | "left" | "right" | "hazard";
	headlights?: number;
	handbrake?: boolean;
	horn?: boolean;
	stop_request?: boolean;
	fuel?: number;
	passengers?: number;
	interior_light?: number;
	kneeling?: boolean;
	stop_brake?: boolean;
	limit?: number;
	model?: string;
	destination?: string;
};

export type Duty = {
	line?: string;
	tour?: string;
	delay?: number;
	next_stop?: string;
	next_stop_distance?: number;
	at_stop?: boolean;
	terminus?: string;
};

export type GameState = {
	v: number;
	dir: string;
	paused?: boolean;
	view?: string;
	clock?: number;
	bus?: Bus;
	duty?: Duty;
};

class Game extends EventEmitter {
	state: GameState | null = null;
	#lastSeen = 0;
	#online = false;
	#seq = 0;
	#pending = new Map<string, (ok: boolean) => void>();
	/** Les variables que chaque touche veut suivre, et ce qui est écrit dans watch.txt. */
	#watch = new Map<string, string>();
	#watchWritten = "";

	/** Le jeu a répondu il y a peu. */
	get online(): boolean {
		return this.#online;
	}

	/** Le bus du joueur, quand le jeu tourne et que le joueur conduit. */
	get bus(): Bus | undefined {
		return this.#online ? this.state?.bus : undefined;
	}

	start(): void {
		const socket = dgram.createSocket({ type: "udp4", reuseAddr: false });
		socket.on("message", (data) => this.#receive(data));
		socket.on("error", (err) => streamDeck.logger.error(`UDP ${PORT} : ${err.message}`));
		socket.bind(PORT, "127.0.0.1", () => streamDeck.logger.info(`À l'écoute d'openOMSI sur 127.0.0.1:${PORT}`));

		setInterval(() => {
			const online = Date.now() - this.#lastSeen < SILENCE_MS;
			if (online !== this.#online) {
				this.#online = online;
				this.emit("update");
			}
		}, 500);
	}

	#receive(data: Buffer): void {
		let msg: any;
		try {
			msg = JSON.parse(data.toString("utf8"));
		} catch {
			return;
		}
		if (!msg || typeof msg !== "object") return;
		if (typeof msg.ack === "string") {
			this.#pending.get(msg.ack)?.(msg.ok === true);
			return;
		}
		if (typeof msg.dir !== "string") return;
		this.state = msg as GameState;
		this.#lastSeen = Date.now();
		this.#online = true;
		this.emit("update");
		void this.#writeWatch();
	}

	/** Une touche suit une variable de script (ou plus aucune avec `undefined`). */
	watch(key: string, variable: string | undefined): void {
		if (variable) this.#watch.set(key, variable);
		else this.#watch.delete(key);
		void this.#writeWatch();
	}

	/** watch.txt : les variables à suivre, une par ligne, réécrit seulement quand il change. */
	async #writeWatch(): Promise<void> {
		const dir = this.#dataDir();
		if (!dir) return;
		const text = [...new Set(this.#watch.values())].sort().join("\n");
		const key = `${dir}|${text}`;
		if (key === this.#watchWritten) return;
		this.#watchWritten = key;
		try {
			await fs.writeFile(path.join(dir, "watch.txt"), text, "utf8");
		} catch (err) {
			this.#watchWritten = "";
			streamDeck.logger.error(`watch.txt non écrit : ${(err as Error).message}`);
		}
	}

	/** Les triggers du bus actuel (triggers.txt du plugin Lua), sans les "_off". */
	async triggers(): Promise<string[]> {
		const dir = this.#dataDir();
		if (!dir) return [];
		try {
			const text = await fs.readFile(path.join(dir, "triggers.txt"), "utf8");
			return text.split(/\r?\n/).filter(Boolean);
		} catch {
			return [];
		}
	}

	/** Le dossier de données du plugin Lua, s'il a bien l'air d'en être un. */
	#dataDir(): string | null {
		const dir = this.state?.dir;
		if (!dir || !path.isAbsolute(dir)) return null;
		const base = path.basename(dir);
		if (base !== "streamdeck.data" && base !== "data") return null;
		return dir;
	}

	#inbox(): string | null {
		const dir = this.#dataDir();
		return dir && path.join(dir, "inbox");
	}

	/**
	 * Envoie une commande au jeu (« door 1 », « horn 1 »...) et attend sa réponse :
	 * `true` quand le jeu l'a exécutée.
	 */
	async send(command: string): Promise<boolean> {
		const inbox = this.#inbox();
		if (!this.#online || !inbox) return false;

		const id = `${Date.now()}-${String(this.#seq++ % 10000).padStart(4, "0")}`;
		const answer = new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => done(false), ACK_TIMEOUT_MS);
			const done = (ok: boolean): void => {
				clearTimeout(timer);
				this.#pending.delete(id);
				resolve(ok);
			};
			this.#pending.set(id, done);
		});

		try {
			// Écrit à côté puis renomme : le jeu ne lit jamais un fichier à moitié écrit.
			const tmp = path.join(inbox, `${id}.tmp`);
			await fs.mkdir(inbox, { recursive: true });
			await fs.writeFile(tmp, `${id} ${command}`, "utf8");
			await fs.rename(tmp, path.join(inbox, `${id}.cmd`));
		} catch (err) {
			streamDeck.logger.error(`Commande « ${command} » non écrite : ${(err as Error).message}`);
			this.#pending.get(id)?.(false);
		}
		return answer;
	}
}

export const game = new Game();
