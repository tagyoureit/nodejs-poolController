import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { webApp } from "../../web/Server";
import { logger } from "../../logger/Logger";
import { INixieControlPanel } from "./NixieEquipment";
import { NixieChemControllerCollection } from "./chemistry/ChemController";

import { sys, PoolSystem } from "../../controller/Equipment";

/************************************************************************
 * Nixie:  Nixie is a control panel that controls devices as a master. It
 * can extend an existing *Touch or Center control panel.  Or it can run
 * standalone as a master controller.  The NixieControlPanel will always
 * be instantiated to control equipment when that equipment is not
 * supported or controlled by a traditional OCP.
 * 
 * Equipment: Equipment identified as ncp (Nixie Control Panel) will be
 * managed by the Nixie controller.  It works hand-in-glove with the REM
 * (Relay Equipment Manager) to provide low level hardware support.
 * 
 * RS485: RS485 occurs directly within nixie through the standard RS485
 * bus identified for njspc and does not route through REM.  This is an
 * important distinction to provide robust hardware level communication.
 * Items Controlled on this channel include: Pumps, Chlorinators, and
 * IntelliChem controllers.  When and if IntelliValve functions become
 * available these too will be performed through the njspc RS485 bus.
 * 
 * Configuration and State Management:
 * Nixie uses the underlying njspc configuration structures.  The intent
 * is not to replace these rather the intention is to extend them with
 * low level control.  For this reason, only when a Nixie is the only
 * master controller on the pool do commands get routed through NixieBoard.
 * this mode is identified at startup. When a particular piece of equipment 
 * is identified to be controlled by Nixie as a master then the command 
 * will eventually be marshalled to the NixieControlPanel.  Any connected
 * OCP will get first crack at it.
 * 
 * LifeCycle: The Nixie controller does not persist data outside of
 * the PoolConfig.json and PoolState.json files.  It is initialized
 * at startup and torn down when the application is stopped. 
 * */
export class NixieControlPanel implements INixieControlPanel {
    // Only equipment controlled by Nixie is represented on the controller.  If interaction with
    // other equipment is required this should be sent back through the original controller.
    // Command sequence is <OCP>Board -> SystemBoard -> NixieController whenever the master is not identified as Nixie.
    chemControllers: NixieChemControllerCollection = new NixieChemControllerCollection(this);
    public async initAsync(equipment: PoolSystem) {
        try {
            logger.info(`Initializing Nixie Controller`);
            await this.chemControllers.initAsync(equipment.chemControllers);
            logger.info(`Nixie Controller Initialized`)
        }
        catch (err) { return Promise.reject(err); }
    }
    public async readLogFile(logFile: string): Promise<string[]> {
        try {
            let logPath = path.join(process.cwd(), '/logs');
            if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
            logPath += (`/${logFile}`);
            let lines = [];
            if (fs.existsSync(logPath)) {
                let buff = fs.readFileSync(logPath);
                lines = buff.toString().split('\n');
            }
            return lines;
        } catch (err) { logger.error(err); }
    }
    public async logData(logFile: string, data: any) {
        try {
            let logPath = path.join(process.cwd(), '/logs');
            if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
            logPath += (`/${logFile}`);
            let lines = [];
            if (fs.existsSync(logPath)) {
                let buff = fs.readFileSync(logPath);
                lines = buff.toString().split('\n');
            }
            if (typeof data === 'object')
                lines.unshift(JSON.stringify(data));
            else
                lines.unshift(data.toString());
            fs.writeFileSync(logPath, lines.join('\n'));
        } catch (err) { logger.error(err); }
    }
    public async getREMServers() {
        try {
            let srv = [];
            let servers = webApp.findServersByType('rem');
            for (let i = 0; i < servers.length; i++) {
                let server = servers[i];
                // Sometimes I hate type safety.
                let devices = typeof server['getDevices'] === 'function' ? await server['getDevices']() : [];
                srv.push({
                    uuid: servers[i].uuid,
                    name: servers[i].name,
                    type: servers[i].type,
                    isRunning: servers[i].isRunning,
                    isConnected: servers[i].isConnected,
                    devices: devices
                });
            }
            return srv;
        } catch (err) { logger.error(err); }
    }
}

export let ncp = new NixieControlPanel();