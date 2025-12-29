/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import { Inbound, Message, Outbound, Response } from "../Messages";
import { sys, ConfigVersion } from "../../../Equipment";
import { logger } from "../../../../logger/Logger";

export class VersionMessage {
    // Debounce config refresh requests to avoid duplicate requests from overlapping triggers
    private static lastConfigRefreshTime: number = 0;
    private static readonly CONFIG_REFRESH_DEBOUNCE_MS = 2000;  // 2 seconds

    /**
     * Shared method to trigger a config refresh with debouncing.
     * Prevents duplicate requests when multiple triggers fire in quick succession.
     */
    private static triggerConfigRefresh(source: string): void {
        const now = Date.now();
        if (now - this.lastConfigRefreshTime < this.CONFIG_REFRESH_DEBOUNCE_MS) {
            logger.silly(`v3.004+ ${source}: Skipping config refresh (debounced, last was ${now - this.lastConfigRefreshTime}ms ago)`);
            return;
        }
        this.lastConfigRefreshTime = now;

        (sys.board as any).needsConfigChanges = true;
        // Invalidate cached options version so queueChanges() will request category 0.
        // OCP doesn't increment options version when heat mode/setpoints change,
        // so we force a refresh by clearing our cached version.
        sys.configVersion.options = 0;
        logger.silly(`v3.004+ ${source}: Sending Action 228`);
        Outbound.create({
            dest: 16, action: 228, payload: [0], retries: 2,
            response: Response.create({ action: 164 })
        }).sendAsync();
    }

    /**
     * v3.004+ Piggyback: When another device sends Action 228 to OCP,
     * send our own to catch config changes. See .plan/202-intellicenter-bodies-temps.md
     */
    public static processVersionRequest(msg: Inbound): void {
        if (sys.equipment.isIntellicenterV3 &&
            msg.source !== Message.pluginAddress &&  // Not from us
            msg.dest === 16) {                        // Directed to OCP
            this.triggerConfigRefresh('Piggyback');
        }
        msg.isProcessed = true;
    }

    /**
     * v3.004+ ACK Trigger: When OCP ACKs a Wireless device's Action 168,
     * trigger a config refresh. OCP doesn't send Action 228 after Wireless changes,
     * so we must detect the ACK and request config ourselves.
     * See AGENTS.md for protocol details.
     */
    public static processAction168Ack(msg: Inbound): void {
        // Only for v3.004+ when OCP (src=16) ACKs a non-njsPC device's 168
        if (sys.equipment.isIntellicenterV3 &&
            msg.source === 16 &&                          // From OCP
            msg.dest !== Message.pluginAddress &&         // Not to us
            msg.dest !== 16 &&                            // Not to OCP itself
            msg.payload.length > 0 &&
            msg.payload[0] === 168) {                     // ACKing Action 168
            this.triggerConfigRefresh(`ACK Trigger (device ${msg.dest})`);
        }
        msg.isProcessed = true;
    }

    public static process(msg: Inbound): void {
        var ver: ConfigVersion = new ConfigVersion({});
        ver.options = msg.extractPayloadInt(6);
        ver.circuits = msg.extractPayloadInt(8);
        ver.features = msg.extractPayloadInt(10);
        ver.schedules = msg.extractPayloadInt(12);
        ver.pumps = msg.extractPayloadInt(14);
        ver.remotes = msg.extractPayloadInt(16);
        ver.circuitGroups = msg.extractPayloadInt(18);
        ver.chlorinators = msg.extractPayloadInt(20);
        ver.intellichem = msg.extractPayloadInt(22);
        ver.valves = msg.extractPayloadInt(24);
        ver.heaters = msg.extractPayloadInt(26);
        ver.security = msg.extractPayloadInt(28);
        ver.general = msg.extractPayloadInt(30);
        ver.equipment = msg.extractPayloadInt(32);
        ver.covers = msg.extractPayloadInt(34);
        ver.systemState = msg.extractPayloadInt(36);
        sys.processVersionChanges(ver);
        msg.isProcessed = true;
    }
}