import streamDeck from "@elgato/streamdeck";
import {
	CustomAction,
	DevAction,
	DoorAction,
	StopBrakeAction,
	EngineAction,
	GearAction,
	HandbrakeAction,
	HornAction,
	IndicatorAction,
	InfoAction,
	InteriorLightAction,
	LightsAction,
	PauseAction,
	ViewAction,
} from "./actions.js";
import { game } from "./game.js";

streamDeck.logger.setLevel("info");

for (const a of [
	new DoorAction(),
	new DevAction(),
	new StopBrakeAction(),
	new IndicatorAction(),
	new LightsAction(),
	new HandbrakeAction(),
	new EngineAction(),
	new GearAction(),
	new HornAction(),
	new InteriorLightAction(),
	new ViewAction(),
	new PauseAction(),
	new CustomAction(),
	new InfoAction(),
]) {
	streamDeck.actions.registerAction(a);
}

game.start();
streamDeck.connect();
