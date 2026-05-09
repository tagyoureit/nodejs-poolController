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
import { ChlorinatorStateMessage } from '../../comms/messages/status/ChlorinatorStateMessage';
import { conn } from '../../comms/Comms';
import { logger } from '../../../logger/Logger';

const LOOPBACK_ACTIONS = new Set<number>([18, 3]);

export interface VirtualChlorinatorOptions {
    address: number;
    portId?: number;
    enabled?: boolean;
    autoDisabled?: boolean;
    autoDisabledAt?: string | null;
    autoDisabledReason?: string | null;
    saltLevel?: number;
    modelName?: string;
}

export class VirtualChlorinator {
    public readonly address: number;
    public portId: number;
    public saltLevel: number;
    public modelName: string;

    private _enabled: boolean;
    private _autoDisabled: boolean;
    private _autoDisabledAt: string | null;
    private _autoDisabledReason: string | null;

    protected _targetOutput = 0;
    protected _enabledAt: number = Date.now();
    protected _lastPacketAt: number | null = null;
    protected _packetCount = 0;

    private _recentEchoes: number[] = [];

    constructor(opts: VirtualChlorinatorOptions) {
        this.address = opts.address;
        this.portId = opts.portId ?? 0;
        this.saltLevel = opts.saltLevel ?? 3400;
        this.modelName = opts.modelName || 'Intellichlor--40';
        this._enabled = opts.enabled === true;
        this._autoDisabled = opts.autoDisabled === true;
        this._autoDisabledAt = opts.autoDisabledAt ?? null;
        this._autoDisabledReason = opts.autoDisabledReason ?? null;
    }

    public get enabled(): boolean { return this._enabled; }
    public get autoDisabled(): boolean { return this._autoDisabled; }
    public get autoDisabledAt(): string | null { return this._autoDisabledAt; }
    public get autoDisabledReason(): string | null { return this._autoDisabledReason; }
    public get isEffective(): boolean { return this._enabled && !this._autoDisabled; }
    public get recentEchoes(): number[] { return this._recentEchoes; }

    public supportsAction(action: number): boolean {
        return action === 0 || action === 17 || action === 20 || action === 21;
    }

    public pushRecentInboundEcho(ts: number): void {
        this._recentEchoes.push(ts);
        if (this._recentEchoes.length > 8) this._recentEchoes.splice(0, this._recentEchoes.length - 8);
    }

    public setAutoDisabled(v: boolean, reason?: string): void {
        this._autoDisabled = v;
        this._autoDisabledAt = v ? new Date().toISOString() : null;
        this._autoDisabledReason = v ? (reason || 'Collision detected on bus') : null;
        if (v) this._resetRuntime();
    }

    public clearAutoDisabled(): void {
        this._autoDisabled = false;
        this._autoDisabledAt = null;
        this._autoDisabledReason = null;
    }

    public applyUserConfig(opts: Partial<VirtualChlorinatorOptions>): void {
        const wasEffective = this.isEffective;
        if (typeof opts.enabled === 'boolean') this._enabled = opts.enabled;
        if (typeof opts.portId === 'number') this.portId = opts.portId;
        if (typeof opts.saltLevel === 'number') this.saltLevel = opts.saltLevel;
        if (typeof opts.modelName === 'string' && opts.modelName.length > 0) this.modelName = opts.modelName;
        if (opts.enabled === true) this._enabledAt = Date.now();
        if (wasEffective && !this.isEffective) this._resetRuntime();
    }

    private _resetRuntime(): void {
        this._targetOutput = 0;
    }

    public process(msg: Inbound): void {
        this._lastPacketAt = Date.now();
        this._packetCount++;

        const response = Outbound.create({
            portId: msg.portId,
            protocol: Protocol.Chlorinator,
            source: 0,
            dest: 0,
            action: 0,
            payload: [],
            retries: 0,
            response: false
        });

        switch (msg.action) {
            case 0: {
                response.action = 1;
                response.appendPayloadByte(0);
                response.appendPayloadByte(0);
                break;
            }
            case 17: {
                this._targetOutput = msg.extractPayloadByte(0);
                response.action = 18;
                response.appendPayloadByte(Math.round(this.saltLevel / 50));
                response.appendPayloadByte(0);
                break;
            }
            case 20: {
                response.action = 3;
                response.appendPayloadByte(0);
                const nameBytes = this._getModelNameBytes();
                for (const b of nameBytes) response.appendPayloadByte(b);
                break;
            }
            case 21: {
                this._targetOutput = msg.extractPayloadByte(0) / 10;
                response.action = 18;
                response.appendPayloadByte(Math.round(this.saltLevel / 50));
                response.appendPayloadByte(0);
                break;
            }
            default:
                logger.verbose(`VirtualChlorinator ${this.address}: ignoring unsupported action ${msg.action}`);
                return;
        }

        try {
            conn.queueSendMessage(response);
            logger.verbose(`VirtualChlorinator ${this.address}: answered action ${msg.action} with response action ${response.action}`);
        } catch (err) {
            logger.error(`VirtualChlorinator ${this.address}: failed to queue response for action ${msg.action}: ${(err as Error).message}`);
        }

        if (LOOPBACK_ACTIONS.has(response.action)) {
            this._loopbackAsInbound(response);
        }
    }

    private _loopbackAsInbound(out: Outbound): void {
        try {
            const inbound = new Inbound();
            inbound.protocol = Protocol.Chlorinator;
            inbound.direction = Direction.In;
            inbound.portId = out.portId;
            inbound.preamble = [];
            inbound.header = out.header.slice();
            inbound.payload = out.payload.slice();
            inbound.term = out.term.slice();
            inbound.isValid = true;
            inbound.timestamp = new Date();
            ChlorinatorStateMessage.process(inbound);
        } catch (err) {
            logger.error(`VirtualChlorinator ${this.address}: loopback to ChlorinatorStateMessage failed: ${(err as Error).message}`);
        }
    }

    private _getModelNameBytes(): number[] {
        const bytes: number[] = [];
        const name = this.modelName.padEnd(16, '\0').substring(0, 16);
        for (let i = 0; i < 16; i++) {
            bytes.push(name.charCodeAt(i));
        }
        return bytes;
    }

    public toPersisted(): any {
        return {
            address: this.address,
            portId: this.portId,
            enabled: this._enabled,
            autoDisabled: this._autoDisabled,
            autoDisabledAt: this._autoDisabledAt,
            autoDisabledReason: this._autoDisabledReason,
            saltLevel: this.saltLevel,
            modelName: this.modelName
        };
    }

    public toSnapshot(): any {
        return {
            ...this.toPersisted(),
            isEffective: this.isEffective,
            runtime: {
                targetOutput: this._targetOutput,
                enabledAt: new Date(this._enabledAt).toISOString(),
                lastPacketAt: this._lastPacketAt ? new Date(this._lastPacketAt).toISOString() : null,
                packetCount: this._packetCount
            }
        };
    }
}
