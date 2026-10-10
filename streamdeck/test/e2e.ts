// Test de bout en bout sans le jeu : game/streamdeck.lua tourne dans fengari (Lua en JS)
// avec une fausse API omsi (test/fake-omsi.lua), mais avec un vrai UDP et un vrai dossier
// inbox ; en face, le vrai src/game.ts du plugin Stream Deck.
// node test/e2e.ts

import assert from "node:assert/strict";
import dgram from "node:dgram";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore - fengari n'a pas de types
import fengari from "fengari";

// Un autre port que le vrai plugin Stream Deck, qui tourne peut-être déjà.
process.env.OPENOMSI_SD_PORT = "47829";
const { game, PORT } = await import("../src/game.ts");

const { lua, lauxlib, lualib, to_luastring } = fengari;
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(mkdtempSync(join(tmpdir(), "oo-sd-")), "streamdeck.data");
mkdirSync(dataDir, { recursive: true });

// --- Le faux jeu --------------------------------------------------------------------
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const udp = dgram.createSocket("udp4");
const str = (i: number): string => lua.lua_tojsstring(L, i);
const def = (name: string, fn: () => number): void => {
	lua.lua_pushjsfunction(L, fn);
	lua.lua_setglobal(L, to_luastring(name));
};
const pushStr = (s: string | null): number => {
	if (s === null) lua.lua_pushnil(L);
	else lua.lua_pushstring(L, to_luastring(s));
	return 1;
};
def("__send", () => {
	udp.send(Buffer.from(str(2), "utf8"), PORT, "127.0.0.1");
	return 0;
});
def("__dir", () => pushStr(dataDir));
def("__mkdir", () => (mkdirSync(join(dataDir, str(1)), { recursive: true }), lua.lua_pushboolean(L, true), 1));
def("__list", () => {
	try {
		return pushStr(readdirSync(join(dataDir, str(1))).join("\n"));
	} catch {
		return pushStr(null);
	}
});
def("__read", () => {
	try {
		return pushStr(readFileSync(join(dataDir, str(1)), "utf8"));
	} catch {
		return pushStr(null);
	}
});
def("__write", () => (writeFileSync(join(dataDir, str(1)), str(2), "utf8"), lua.lua_pushboolean(L, true), 1));
def("__delete", () => (rmSync(join(dataDir, str(1))), lua.lua_pushboolean(L, true), 1));

function run(src: string, name: string): void {
	if (lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring(name)) !== 0 || lua.lua_pcall(L, 0, 0, 0) !== 0) {
		throw new Error(`Lua ${name} : ${str(-1)}`);
	}
}
function call(fn: string, ...args: (number | string)[]): string | undefined {
	lua.lua_getglobal(L, to_luastring(fn));
	for (const a of args) typeof a === "number" ? lua.lua_pushnumber(L, a) : lua.lua_pushstring(L, to_luastring(a));
	if (lua.lua_pcall(L, args.length, 1, 0) !== 0) throw new Error(`Lua ${fn} : ${str(-1)}`);
	const out = lua.lua_isstring(L, -1) ? str(-1) : undefined;
	lua.lua_pop(L, 1);
	return out;
}

run(readFileSync(join(here, "fake-omsi.lua"), "utf8"), "fake-omsi.lua");
run(readFileSync(join(here, "..", "..", "game", "streamdeck.lua"), "utf8"), "streamdeck.lua");

let ticking = true;
const ticker = setInterval(() => ticking && call("__tick", 0.05), 50);
call("__fire", "start");

// --- Le plugin Stream Deck ----------------------------------------------------------
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, ok: () => boolean, ms = 3000): Promise<void> {
	const end = Date.now() + ms;
	while (!ok()) {
		if (Date.now() > end) throw new Error(`Pas arrivé : ${what}`);
		await wait(20);
	}
}
const calls = (): string[] => (call("__calls") ?? "").split("\n").filter(Boolean);

let failures = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
		console.log(`  ok   ${name}`);
	} catch (err) {
		failures++;
		console.log(`  FAIL ${name}\n       ${(err as Error).message.split("\n").join("\n       ")}`);
	}
}

game.start();
console.log(`UDP ${PORT}, dossier ${dataDir}`);

await test("le jeu est vu en ligne avec son état", async () => {
	await until("en ligne", () => game.online);
	assert.equal(game.bus?.speed, 31.6);
	assert.equal(game.bus?.headlights, 2);
	assert.equal(game.bus?.stop_request, true);
	assert.equal(game.bus?.limit, 50);
	assert.deepEqual(game.bus?.doors, [false, false, false]);
	assert.equal(game.bus?.dev, false);
	assert.equal(game.state?.duty?.line, "136");
	assert.equal(game.state?.duty?.next_stop, "Rathaus Spandau");
	assert.equal(game.state?.dir, dataDir);
});

await test("C2 : portes 1, 2, 3 sur leurs vrais triggers, la 4 n'existe pas", async () => {
	calls();
	assert.equal(await game.send("door 1"), true);
	assert.equal(await game.send("door 2"), true);
	assert.equal(await game.send("door 3"), true);
	assert.equal(await game.send("door 4"), false);
	assert.deepEqual(calls(), ["trigger bus_doorfront0", "trigger bus_doorfront1", "trigger c2_cp_bt_tuer_3"]);
	await until("trois portes ouvertes", () => game.bus?.doors?.join() === "true,true,true");
	assert.equal(await game.send("door 2"), true);
	await until("porte 2 refermée", () => game.bus?.doors?.join() === "true,false,true");
	assert.equal(await game.send("door 1"), true);
	assert.equal(await game.send("door 3"), true);
	await until("toutes fermées", () => game.bus?.doors_open === false);
	calls();
});

await test("C2 : toutes les portes passent par le jeu", async () => {
	assert.equal(await game.send("door 0"), true);
	assert.deepEqual(calls(), ["toggle_door 0"]);
	await until("ouvertes", () => game.bus?.doors_open === true);
	assert.equal(await game.send("door 0"), true);
	await until("fermées", () => game.bus?.doors_open === false);
	calls();
});

await test("C2 : DEV = libération des portes (bus_dooraft), allumé par C2_CP_BT_Tuerfreigabe", async () => {
	assert.equal(await game.send("dev"), true);
	assert.deepEqual(calls(), ["trigger bus_dooraft"]);
	await until("DEV actif", () => game.bus?.dev === true);
	assert.equal(await game.send("dev"), true);
	await until("DEV coupé", () => game.bus?.dev === false);
	calls();
});

await test("C2 : la liste des triggers pour le Stream Deck, sans les _off", async () => {
	const t = await game.triggers();
	assert.ok(t.includes("c2_cp_bt_tuer_3") && t.includes("bus_dooraft") && t.includes("c2_cp_bt_kneeling"));
	assert.ok(!t.some((n) => n.endsWith("_off")));
	assert.deepEqual(t, [...t].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
});

await test("une variable suivie allume la touche (watch.txt)", async () => {
	game.watch("touche-1", "C2_CP_AZ_Tuer_1");
	await until("variable reçue", () => game.bus?.vars?.C2_CP_AZ_Tuer_1 === 0, 4000);
	call("__set_var", "C2_CP_AZ_Tuer_1", "1");
	await until("variable à 1", () => game.bus?.vars?.C2_CP_AZ_Tuer_1 === 1);
	game.watch("touche-1", undefined);
	await until("plus suivie", () => game.bus?.vars === undefined, 4000);
});

await test("un trigger que le bus n'a pas est refusé", async () => {
	assert.equal(await game.send("trigger CG_active"), false);
	assert.equal(await game.send("trigger C2_CP_BT_Kneeling"), true);
	assert.deepEqual(calls(), ["trigger C2_CP_BT_Kneeling"]);
});

await test("C2 : boîte auto D, R, N par automatic_*, position lue dans C2_Getriebe_Gangvorwahl", async () => {
	await until("N au départ", () => game.bus?.selector === "N");
	for (const pos of ["D", "R", "N"] as const) {
		assert.equal(await game.send(`gear ${pos}`), true);
		await until(pos, () => game.bus?.selector === pos);
	}
	assert.deepEqual(calls(), ["trigger automatic_D", "trigger automatic_R", "trigger automatic_N"]);
	assert.equal(await game.send("gear P"), false);
});

await test("C2 : pas de frein d'arrêt à part (bus_dooraft y est la libération des portes)", async () => {
	assert.equal(await game.send("stopbrake"), false);
	assert.deepEqual(calls(), []);
});

await test("Heuliez GX427 : DEV = CG_active (pas le frein d'arrêt), frein d'arrêt = bus_dooraft", async () => {
	call("__set_bus", "gx427");
	call("__fire", "vehicle", "GX427");
	await until("nouveau bus", () => game.bus?.dev === false && game.bus?.doors?.length === 3);
	calls();
	assert.equal(await game.send("door 3"), true);
	assert.equal(await game.send("dev"), true);
	assert.deepEqual(calls(), ["trigger bus_doorfront2", "trigger CG_active"]);
	await until("DEV actif", () => game.bus?.dev === true);
	assert.equal(game.bus?.stop_brake, false, "le DEV ne touche pas au frein d'arrêt");
	assert.equal(await game.send("stopbrake"), true);
	assert.deepEqual(calls(), ["trigger bus_dooraft"]);
	await until("frein d'arrêt serré", () => game.bus?.stop_brake === true);
	assert.ok((await game.triggers()).includes("cg_active"));
	calls();
	assert.equal(await game.send("gear D"), true);
	await until("D (antrieb_getr_gangvorwahl = 4)", () => game.bus?.selector === "D");
	assert.equal(await game.send("gear N"), true);
	await until("N", () => game.bus?.selector === "N");
	assert.deepEqual(calls(), ["trigger automatic_D", "trigger automatic_N"]);
	call("__set_bus", "c2");
	call("__fire", "vehicle", "C2");
	await until("retour au C2", () => game.bus?.dev === false);
});

await test("clignotant gauche, puis un 2e appui l'éteint", async () => {
	assert.equal(await game.send("indicator left"), true);
	await until("gauche", () => game.bus?.indicator === "left");
	assert.equal(await game.send("indicator left"), true);
	await until("éteint", () => game.bus?.indicator === "off");
	assert.deepEqual(calls(), ["set_indicator left", "set_indicator off"]);
});

await test("klaxon tenu puis relâché", async () => {
	assert.equal(await game.send("horn 1"), true);
	await until("klaxon", () => game.bus?.horn === true);
	assert.equal(await game.send("horn 0"), true);
	assert.deepEqual(calls(), ["sound_horn true", "sound_horn false"]);
});

await test("frein de parking, moteur, éclairage, vue, pause", async () => {
	for (const c of ["handbrake", "engine", "interior", "view outside", "pause"]) assert.equal(await game.send(c), true, c);
	assert.deepEqual(calls(), ["toggle_handbrake", "start_up", "set_interior_light true", "view outside", "game sim_pause"]);
	await until("vue", () => game.state?.view === "outside" && game.bus?.handbrake === true);
});

await test("phares et action personnalisée (appui et tenue)", async () => {
	assert.equal(await game.send("action kw_fernlicht_toggle"), true);
	assert.equal(await game.send("action ticket_give 1"), true);
	assert.equal(await game.send("action ticket_give 0"), true);
	assert.equal(await game.send("trigger horn 1"), true);
	assert.equal(await game.send("game view_set_schedule"), true);
	assert.deepEqual(calls(), [
		"action kw_fernlicht_toggle nil",
		"action ticket_give true",
		"action ticket_give false",
		"press horn",
		"game view_set_schedule",
	]);
});

await test("refus : action inconnue, commande inconnue, vue inconnue", async () => {
	assert.equal(await game.send("action unknown_action"), false);
	assert.equal(await game.send("bogus"), false);
	assert.equal(await game.send("view moon"), false);
	assert.equal(await game.send("indicator up"), false);
});

await test("plusieurs commandes d'un coup, dans l'ordre", async () => {
	calls();
	const r = await Promise.all([game.send("door 1"), game.send("door 1"), game.send("handbrake")]);
	assert.deepEqual(r, [true, true, true]);
	assert.deepEqual(calls(), ["trigger bus_doorfront0", "trigger bus_doorfront0", "toggle_handbrake"]);
});

await test("la boîte de commandes est vide après coup", async () => {
	assert.deepEqual(readdirSync(join(dataDir, "inbox")), []);
});

await test("jeu muet : hors ligne après 3 s, et les commandes échouent tout de suite", async () => {
	ticking = false;
	await until("hors ligne", () => !game.online, 5000);
	const t = Date.now();
	assert.equal(await game.send("door 1"), false);
	assert.ok(Date.now() - t < 100);
});

clearInterval(ticker);
udp.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est bon.");
process.exit(failures ? 1 : 0);
