import { EventEmitter } from "eventemitter3";
import { log } from "./log.js";
import { initialise as initialiseMessaging } from "./messaging.js";
import { initialise as initialiseStorage } from "./storage.js";
import { initialise as initialiseConfig } from "./config.js";
import { initialise as initialiseI18n } from "../../shared/i18n/trans.js";
import { getLanguage } from "../../shared/library/i18n.js";

enum Initialisation {
    Complete = "complete",
    Idle = "idle",
    Running = "running"
}

const __initEE = new EventEmitter();
let __initialisation: Initialisation = Initialisation.Idle;

export async function initialise(): Promise<void> {
    if (__initialisation !== Initialisation.Idle) return;
    __initialisation = Initialisation.Running;
    log("initialising");
    initialiseMessaging();
    await initialiseStorage();
    await initialiseConfig();
    await initialiseI18n(getLanguage());
    log("initialisation complete");
    __initialisation = Initialisation.Complete;
    __initEE.emit("initialised");
}

export async function waitForInitialisation(): Promise<void> {
    return new Promise<void>((resolve) => {
        if (__initialisation === Initialisation.Complete) return resolve();
        __initEE.once("initialised", resolve);
    });
}
