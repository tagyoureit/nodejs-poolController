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
import { Direction, Inbound, Outbound, Protocol } from '../../comms/messages/Messages';
import { PumpStateMessage } from '../../comms/messages/status/PumpStateMessage';
import { conn } from '../../comms/Comms';
import { sys } from '../../Equipment';
import { logger } from '../../../logger/Logger';

// Actions whose response carries live rpm/watts/driveState that
// PumpStateMessage.process consumes for state.pumps[].  Loopback of pure ACKs
// (4 remote/local, 6 power) would be noise — state.pumps doesn't read them.
const LOOPBACK_ACTIONS = new Set<number>([7]);

export interface VirtualPumpOptions {
    address: number;
    portId?: number;
    enabled?: boolean;
    autoDisabled?: boolean;
    autoDisabledAt?: string | null;
    autoDisabledReason?: string | null;
    wattModel?: string;
}

/**
 * Base class for virtual pumps.  Handles shared actions 4 (remote/local),
 * 6 (power), 7 (status request) and the pump-type-agnostic pieces of the
 * 15-byte status payload.  Subclasses implement:
 *   - processSpeedCommand() for set-speed commands (action 1 / 9 / 10)
 *   - supportedActions list
 *   - computeWatts()
 *   - pump type string ('vs' / 'vf' / 'vsf' / …)
 */
export abstract class VirtualPump {
    public readonly address: number;
    public portId: number;
    public wattModel: string;

    private _enabled: boolean;
    private _autoDisabled: boolean;
    private _autoDisabledAt: string | null;
    private _autoDisabledReason: string | null;

    // Runtime state — not persisted.
    protected _running = false;
    protected _remote = false;
    protected _targetRpm = 0;
    protected _targetFlow = 0;
    protected _feature = 0;
    protected _enabledAt: number = Date.now();
    protected _lastPacketAt: number | null = null;
    protected _packetCount = 0;

    // Sliding window of inbound-packet timestamps whose source matched our
    // address.  Populated by the manager's observe(); used to detect
    // collisions with a real pump.  Kept small (last 8).
    private _recentEchoes: number[] = [];

    constructor(opts: VirtualPumpOptions) {
        this.address = opts.address;
        this.portId = opts.portId ?? 0;
        this.wattModel = opts.wattModel || 'cheap';
        // Fail-off default: a missing `enabled` field must NOT light up a
        // virtual pump that could collide with real hardware.  Only an
        // explicit `enabled: true` enables; anything else is disabled.
        this._enabled = opts.enabled === true;
        this._autoDisabled = opts.autoDisabled === true;
        this._autoDisabledAt = opts.autoDisabledAt ?? null;
        this._autoDisabledReason = opts.autoDisabledReason ?? null;
    }

    public abstract get type(): string;
    protected abstract supportedActions: Set<number>;
    protected abstract processSpeedCommand(msg: Inbound, response: Outbound): boolean;
    protected abstract computeWatts(): number;

    public get enabled(): boolean { return this._enabled; }
    public get autoDisabled(): boolean { return this._autoDisabled; }
    public get autoDisabledAt(): string | null { return this._autoDisabledAt; }
    public get autoDisabledReason(): string | null { return this._autoDisabledReason; }
    public get isEffective(): boolean { return this._enabled && !this._autoDisabled; }
    public get recentEchoes(): number[] { return this._recentEchoes; }

    public supportsAction(action: number): boolean {
        return this.supportedActions.has(action);
    }

    public pushRecentInboundEcho(ts: number): void {
        this._recentEchoes.push(ts);
        if (this._recentEchoes.length > 8) this._recentEchoes.splice(0, this._recentEchoes.length - 8);
    }

    public setAutoDisabled(v: boolean, reason?: string): void {
        const wasEffective = this.isEffective;
        this._autoDisabled = v;
        this._autoDisabledAt = v ? new Date().toISOString() : null;
        this._autoDisabledReason = v ? (reason || 'Collision detected on bus') : null;
        // When effectiveness drops we are no longer answering on the bus —
        // any leftover "running / 2540 rpm / 798 W" runtime is stale and
        // misleading in the dP readout.  Clear it.
        if (wasEffective && !this.isEffective) this._resetRuntime();
    }
    public clearAutoDisabled(): void {
        this._autoDisabled = false;
        this._autoDisabledAt = null;
        this._autoDisabledReason = null;
    }

    public applyUserConfig(opts: Partial<VirtualPumpOptions>): void {
        const wasEffective = this.isEffective;
        if (typeof opts.enabled === 'boolean') this._enabled = opts.enabled;
        if (typeof opts.portId === 'number') this.portId = opts.portId;
        if (typeof opts.wattModel === 'string') this.wattModel = opts.wattModel;
        // Re-enabling resets the runtime clock so the status time counter
        // doesn't look frozen after a long auto-disable.
        if (opts.enabled === true) this._enabledAt = Date.now();
        // Same cleanup on user-disable as on auto-disable.
        if (wasEffective && !this.isEffective) this._resetRuntime();
    }

    /**
     * Wipe transient runtime state (running, remote, speeds, watts).  Called
     * when the pump transitions from effective → not-effective so the REST /
     * socket snapshot doesn't display stale OCP-commanded values next to
     * "Effective: no".  _packetCount / _lastPacketAt are preserved as a
     * historical record of bus activity.
     */
    private _resetRuntime(): void {
        this._running = false;
        this._remote = false;
        this._targetRpm = 0;
        this._targetFlow = 0;
        this._feature = 0;
    }

    /**
     * Process an inbound master→pump packet and enqueue the response on the
     * same portId with src=ourAddress, dst=msg.source.
     *
     * Responses mirror what a real IntelliFlo pump emits — small payloads
     * for the ack cases, and a 15-byte payload for the status (action 7).
     */
    public process(msg: Inbound): void {
        this._lastPacketAt = Date.now();
        this._packetCount++;

        const response = Outbound.create({
            portId: msg.portId,
            protocol: Protocol.Pump,
            source: this.address,
            dest: msg.source,
            action: msg.action,
            payload: [],
            retries: 0,
            response: false
        });

        switch (msg.action) {
            case 4: {
                // Remote/local control.  [255] = remote, [0] = local.
                const val = msg.extractPayloadByte(0);
                this._remote = val === 255;
                response.appendPayloadByte(val);
                break;
            }
            case 6: {
                // Power.  [10] = on, [4] = off.
                const val = msg.extractPayloadByte(0);
                if (val === 10) this._running = true;
                else if (val === 4) this._running = false;
                response.appendPayloadByte(val);
                break;
            }
            case 7: {
                this._appendStatusPayload(response);
                break;
            }
            default: {
                const handled = this.processSpeedCommand(msg, response);
                if (!handled) {
                    logger.verbose(`VirtualPump ${this.address}: ignoring unsupported action ${msg.action}`);
                    return;
                }
                break;
            }
        }

        try {
            let port = conn.findPortById(response.portId);
            if (port) port.emitter.emit('messagewritepriority', response);
            else conn.queueSendMessage(response);
            logger.verbose(`VirtualPump ${this.address}: answered action ${msg.action} with ${response.toShortPacket()}`);
        } catch (err) {
            logger.error(`VirtualPump ${this.address}: failed to queue response for action ${msg.action}: ${(err as Error).message}`);
        }

        // njsPC only populates state.pumps[].rpm/watts/driveState from inbound
        // pump replies (PumpStateMessage.process, gated on msg.source>=96).  A
        // real pump on the bus satisfies that naturally; our virtual pump
        // writes are outbound-only and never come back.  Feed a synthetic copy
        // of the reply directly to the parser so ICP/OCP and dashPanel agree.
        // We call PumpStateMessage.process() directly (not Messages.process /
        // Inbound.process) so the VirtualEquipment dispatch hook isn't
        // re-entered and we can't loop.
        if (LOOPBACK_ACTIONS.has(msg.action)) {
            this._loopbackAsInbound(response);
        }
    }

    private _loopbackAsInbound(out: Outbound): void {
        // Only loop back if the OCP has an active pump configured at our
        // address — PumpStateMessage.process() looks up by address and would
        // otherwise synthesize a phantom pump entry, violating our
        // "virtual pump is invisible to sys.pumps" invariant.
        const cfg = sys.pumps.find(p => p.address === this.address && p.isActive === true);
        if (!cfg) return;

        try {
            const inbound = new Inbound();
            inbound.protocol = Protocol.Pump;
            inbound.direction = Direction.In;
            inbound.portId = out.portId;
            inbound.preamble = [255, 0, 255];
            inbound.header = out.header.slice();
            inbound.payload = out.payload.slice();
            inbound.term = out.term.slice();
            inbound.isValid = true;
            inbound.timestamp = new Date();
            PumpStateMessage.process(inbound);
        } catch (err) {
            logger.error(`VirtualPump ${this.address}: loopback to PumpStateMessage failed for action ${out.action}: ${(err as Error).message}`);
        }
    }

    /**
     * Append the 15-byte status payload (action 7).  Byte layout mirrors
     * what PumpStateMessage.process decodes:
     *   [0]  command     0 idle / 10 running
     *   [1]  mode        0
     *   [2]  driveState  0 idle / 2 running
     *   [3]  watts hi
     *   [4]  watts lo
     *   [5]  rpm hi
     *   [6]  rpm lo
     *   [7]  flow (0 for VS)
     *   [8]  ppc
     *   [9]  (unused)
     *   [10] (unused)
     *   [11] status hi   0
     *   [12] status lo   0
     *   [13] hours component of run time
     *   [14] minutes component of run time
     */
    private _appendStatusPayload(response: Outbound): void {
        response.appendPayloadBytes(0, 15);
        response.setPayloadByte(0, this._running ? 10 : 0);
        response.setPayloadByte(1, 0);
        response.setPayloadByte(2, this._running ? 2 : 0);
        const watts = this._running ? Math.max(0, Math.round(this.computeWatts())) : 0;
        response.setPayloadByte(3, Math.floor(watts / 256) & 0xff);
        response.setPayloadByte(4, watts & 0xff);
        const rpm = this._running ? Math.max(0, this._targetRpm) : 0;
        response.setPayloadByte(5, Math.floor(rpm / 256) & 0xff);
        response.setPayloadByte(6, rpm & 0xff);
        const flow = this._running ? Math.max(0, this._targetFlow) & 0xff : 0;
        response.setPayloadByte(7, flow);
        response.setPayloadByte(8, 0);
        response.setPayloadByte(11, 0);
        response.setPayloadByte(12, 0);
        const runMinutes = Math.max(0, Math.floor((Date.now() - this._enabledAt) / 60000));
        response.setPayloadByte(13, Math.floor(runMinutes / 60) & 0xff);
        response.setPayloadByte(14, (runMinutes % 60) & 0xff);
    }

    /** Serialize user-intent + auto-disable state for data/virtualEquipment.json. */
    public toPersisted(): any {
        return {
            address: this.address,
            type: this.type,
            portId: this.portId,
            enabled: this._enabled,
            autoDisabled: this._autoDisabled,
            autoDisabledAt: this._autoDisabledAt,
            autoDisabledReason: this._autoDisabledReason,
            wattModel: this.wattModel
        };
    }

    /** Serialize intent + runtime state for REST/socket consumers. */
    public toSnapshot(): any {
        return {
            ...this.toPersisted(),
            isEffective: this.isEffective,
            runtime: {
                running: this._running,
                remote: this._remote,
                targetRpm: this._targetRpm,
                targetFlow: this._targetFlow,
                feature: this._feature,
                watts: this._running ? Math.round(this.computeWatts()) : 0,
                enabledAt: new Date(this._enabledAt).toISOString(),
                lastPacketAt: this._lastPacketAt ? new Date(this._lastPacketAt).toISOString() : null,
                packetCount: this._packetCount
            }
        };
    }
}
