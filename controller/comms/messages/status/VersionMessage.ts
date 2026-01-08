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
    private static pendingConfigRefreshTimer?: NodeJS.Timeout;
    private static pendingConfigRefreshSource?: string;

    /**
     * Shared method to trigger a config refresh with debouncing.
     * Prevents duplicate requests when multiple triggers fire in quick succession.
     */
    private static triggerConfigRefresh(source: string): void {
        const now = Date.now();
        const elapsed = now - this.lastConfigRefreshTime;
        if (elapsed < this.CONFIG_REFRESH_DEBOUNCE_MS) {
            // Throttle-with-trailing: don't lose rapid toggle updates; schedule one refresh at end of window.
            const remainingMs = Math.max(0, this.CONFIG_REFRESH_DEBOUNCE_MS - elapsed);
            this.pendingConfigRefreshSource = source;
            if (!this.pendingConfigRefreshTimer) {
                this.pendingConfigRefreshTimer = setTimeout(() => {
                    this.pendingConfigRefreshTimer = undefined;
                    const src = this.pendingConfigRefreshSource ? `${this.pendingConfigRefreshSource} (trailing)` : 'Trailing';
                    this.pendingConfigRefreshSource = undefined;
                    this.triggerConfigRefresh(src);
                }, remainingMs);
            }
            logger.silly(`v3.004+ ${source}: Skipping immediate config refresh (debounced, last was ${elapsed}ms ago)`);
            return;
        }
        this.lastConfigRefreshTime = now;

        (sys.board as any).needsConfigChanges = true;
        // Invalidate cached options version so queueChanges() will request category 0.
        // OCP doesn't increment options version when heat mode/setpoints change,
        // so we force a refresh by clearing our cached version.
        sys.configVersion.options = 0;
        // v3.004+: OCP does NOT reliably increment systemState when features toggle (esp. rapid OFF/ON sequences).
        // Force a systemState refresh so queueChanges() will request category 15 (systemState), option [0] => Action 222 [15,0].
        sys.configVersion.systemState = 0;
        logger.silly(`v3.004+ ${source}: Sending Action 228`);
        Outbound.create({
            dest: 16, action: 228, payload: [0], retries: 2,
            // v3.004+: require 164 addressed to us (not to Wireless).
            response: Response.create({ dest: Message.pluginAddress, action: 164 })
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
     * v3.004+ ACK Trigger (single entrypoint):
     * When OCP ACKs a Wireless/other device's Action 168 or 184, trigger a debounced config refresh.
     *
     * Intended call-site: `Messages.ts` should gate on ACK payload[0] (168/184) and then call this method once.
     */
    public static processActionAck(msg: Inbound): void {
        // Gate: only v3.004+
        if (!sys.equipment.isIntellicenterV3) {
            msg.isProcessed = true;
            return;
        }
        // Gate: only when ACK originates from OCP (src=16) to some other device (not us, not OCP).
        if (msg.source !== 16 || msg.dest === Message.pluginAddress || msg.dest === 16) {
            msg.isProcessed = true;
            return;
        }
        // Gate: only ACKing Action 168 or 184 (caller should gate, but keep defensive checks here too).
        const ackedAction = msg.payload.length > 0 ? msg.payload[0] : undefined;
        if (ackedAction !== 168 && ackedAction !== 184) {
            msg.isProcessed = true;
            return;
        }

        const label =
            ackedAction === 168
                ? `ACK(168) Trigger (device ${msg.dest})`
                : `ACK(184) Trigger (device ${msg.dest})`;
        this.triggerConfigRefresh(label);
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