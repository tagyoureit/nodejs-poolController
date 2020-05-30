// add source map support for .js to .ts files
require('source-map-support').install();

import { logger } from "./logger/Logger";
import { config } from "./config/Config";
import { conn } from "./controller/comms/Comms";
import { sys, ControllerType } from "./controller/Equipment";
import { state } from "./controller/State";
import { webApp } from "./web/Server";
import * as readline from 'readline';

export async function initAsync() {
    return Promise.resolve()
        .then(function() { config.init(); })
        .then(function() { logger.init(); })
        .then(function() { conn.init(); })
        //.then(function () { }) Add in any initialization for no controller board here but I think we have that covered with the standard SystemBoard object.
        .then(function() { state.init(); })
        .then(function() { sys.init(); })
        .then(function() { webApp.init(); });
}

export async function startPacketCapture(bResetLogs: boolean) {
    try {
        let log = config.getSection('log');
        log.app.captureForReplay = true;
        config.setSection('log', log);
        logger.startCaptureForReplay(bResetLogs);
        if (bResetLogs){
            sys.resetSystem();
        }
    }
    catch (err) {
        console.error(`Error starting replay: ${ err.message }`);
    }
}
export async function stopPacketCaptureAsync() {
    let log = config.getSection('log');
    log.app.captureForReplay = false;
    config.setSection('log', log);
    return logger.stopCaptureForReplayAsync();
}
export async function stopAsync(): Promise<void> {
    try {
        console.log('Shutting down open processes');
        await sys.board.virtualPumpControllers.stopAsync();
        await logger.stopAsync();
        await sys.stopAsync();
        await state.stopAsync();
        await conn.stopAsync();
    }
    catch (err) {
        console.error(`Error stopping processes: ${ err.message }`);
    }
    finally {
        process.exit();
    }
}
if (process.platform === 'win32') {
    let rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', function() { stopAsync(); });
}
else {
    process.on('SIGINT', function() { return stopAsync(); });
}
initAsync();