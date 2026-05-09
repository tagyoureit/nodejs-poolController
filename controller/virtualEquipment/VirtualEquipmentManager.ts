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
import * as path from 'path';
import * as fs from 'fs';
import { Direction, Inbound, Message, Outbound, Protocol } from '../comms/messages/Messages';
import { logger } from '../../logger/Logger';
import { webApp } from '../../web/Server';
import { VirtualPump } from './pumps/VirtualPump';
import { VirtualPumpVS } from './pumps/VirtualPumpVS';
import { VirtualChlorinator } from './chlorinators/VirtualChlorinator';

/**
 * VirtualEquipmentManager
 *
 * Simulates downstream bus-attached equipment (pumps, chlorinators, etc.) that
 * an upstream master (real OCP or njsPC/Nixie) believes is physically present.
 *
 * This is NOT configured in poolConfig.json and does NOT appear anywhere in
 * sys.* or state.* equipment collections.  It is a wire-level impersonator
 * controlled via REST endpoints under /config/virtualEquipment and persisted
 * in its own file (data/virtualEquipment.json).
 *
 * Terminology:
 *  - "intent"        — what the user asked for via REST (enabled=true/false)
 *  - "autoDisabled"  — set true when a collision with a real device is
 *                      detected on the bus.  Requires an explicit REST
 *                      re-enable to clear.
 *  - "effective"     — enabled && !autoDisabled
 */
export class VirtualEquipmentManager {
    public static readonly CONFLICT_WINDOW_MS = 1000;
    private _pumps: VirtualPump[] = [];
    private _chlorinators: VirtualChlorinator[] = [];
    private _filePath: string;
    private _loaded = false;

    constructor(dataDir?: string) {
        this._filePath = path.posix.join(dataDir || path.posix.join(process.cwd(), 'data'), 'virtualEquipment.json');
    }

    public get pumps(): VirtualPump[] { return this._pumps; }
    public get chlorinators(): VirtualChlorinator[] { return this._chlorinators; }
    public get filePath(): string { return this._filePath; }

    public async loadAsync(): Promise<void> {
        try {
            if (!fs.existsSync(this._filePath)) {
                this._loaded = true;
                try {
                    await this.saveAsync();
                    logger.info(`VirtualEquipment: created empty ${this._filePath} (no virtual devices configured)`);
                } catch (err) {
                    logger.warn(`VirtualEquipment: could not create ${this._filePath}: ${(err as Error).message}`);
                }
                return;
            }
            const raw = fs.readFileSync(this._filePath, 'utf8') || '{}';
            const parsed = JSON.parse(raw);
            const pumpDefs: any[] = Array.isArray(parsed.pumps) ? parsed.pumps : [];
            for (const def of pumpDefs) {
                try {
                    const pump = this._constructPump(def);
                    if (pump) this._pumps.push(pump);
                } catch (err) {
                    logger.warn(`VirtualEquipment: skipping bad pump definition ${JSON.stringify(def)}: ${(err as Error).message}`);
                }
            }
            const chlorDefs: any[] = Array.isArray(parsed.chlorinators) ? parsed.chlorinators : [];
            for (const def of chlorDefs) {
                try {
                    const chlor = this._constructChlorinator(def);
                    if (chlor) this._chlorinators.push(chlor);
                } catch (err) {
                    logger.warn(`VirtualEquipment: skipping bad chlorinator definition ${JSON.stringify(def)}: ${(err as Error).message}`);
                }
            }
            this._loaded = true;
            const effectivePumps = this._pumps.filter(p => p.isEffective).length;
            const effectiveChlors = this._chlorinators.filter(c => c.isEffective).length;
            logger.info(`VirtualEquipment: loaded ${this._pumps.length} pump(s) (${effectivePumps} effective), ${this._chlorinators.length} chlorinator(s) (${effectiveChlors} effective)`);
        } catch (err) {
            logger.error(`VirtualEquipment: failed to load ${this._filePath}: ${(err as Error).message}`);
        }
    }

    private _constructPump(def: any): VirtualPump | null {
        if (typeof def.address !== 'number') throw new Error('address is required');
        const type = (def.type || 'vs').toLowerCase();
        switch (type) {
            case 'vs':
                return new VirtualPumpVS({
                    address: def.address,
                    portId: typeof def.portId === 'number' ? def.portId : 0,
                    enabled: def.enabled === true,
                    autoDisabled: def.autoDisabled === true,
                    autoDisabledAt: def.autoDisabledAt || null,
                    autoDisabledReason: def.autoDisabledReason || null,
                    wattModel: def.wattModel || 'cheap'
                });
            default:
                throw new Error(`unsupported virtual pump type "${type}"`);
        }
    }

    private _constructChlorinator(def: any): VirtualChlorinator | null {
        if (typeof def.address !== 'number') throw new Error('address is required');
        return new VirtualChlorinator({
            address: def.address,
            portId: typeof def.portId === 'number' ? def.portId : 0,
            enabled: def.enabled === true,
            autoDisabled: def.autoDisabled === true,
            autoDisabledAt: def.autoDisabledAt || null,
            autoDisabledReason: def.autoDisabledReason || null,
            saltLevel: typeof def.saltLevel === 'number' ? def.saltLevel : 3400,
            modelName: def.modelName || 'Intellichlor--40'
        });
    }

    public shouldAnswer(msg: Inbound): boolean {
        if (msg.protocol === Protocol.Pump) {
            const pump = this.findEffectivePumpByAddress(msg.dest);
            if (!pump) return false;
            if (msg.source !== 16 && msg.source !== Message.pluginAddress) return false;
            return pump.supportsAction(msg.action);
        }
        if (msg.protocol === Protocol.Chlorinator) {
            if (msg.dest < 80 || msg.dest > 83) return false;
            const chlor = this.findEffectiveChlorinatorByAddress(msg.dest);
            if (!chlor) return false;
            return chlor.supportsAction(msg.action);
        }
        return false;
    }

    public process(msg: Inbound): void {
        if (msg.protocol === Protocol.Pump) {
            const pump = this.findEffectivePumpByAddress(msg.dest);
            if (!pump) return;
            try {
                pump.process(msg);
                this.emit();
            } catch (err) {
                logger.error(`VirtualEquipment: pump at address ${pump.address} failed to process action ${msg.action}: ${(err as Error).message}`);
            }
        } else if (msg.protocol === Protocol.Chlorinator) {
            const chlor = this.findEffectiveChlorinatorByAddress(msg.dest);
            if (!chlor) return;
            try {
                chlor.process(msg);
                this.emit();
            } catch (err) {
                logger.error(`VirtualEquipment: chlorinator at address ${chlor.address} failed to process action ${msg.action}: ${(err as Error).message}`);
            }
        }
    }

    public observe(msg: Inbound): void {
        if (msg.protocol === Protocol.Pump) {
            const pump = this.findPumpByAddress(msg.source);
            if (!pump || !pump.isEffective) return;
            const now = Date.now();
            pump.pushRecentInboundEcho(now);
            const windowStart = now - VirtualEquipmentManager.CONFLICT_WINDOW_MS;
            const echoes = pump.recentEchoes.filter(t => t >= windowStart);
            if (echoes.length >= 2) {
                const reason = `Collision: ${echoes.length} inbound packets with source=${pump.address} within ${VirtualEquipmentManager.CONFLICT_WINDOW_MS}ms — a real pump is likely on the bus.`;
                pump.setAutoDisabled(true, reason);
                logger.warn(`VirtualEquipment: auto-disabling pump at address ${pump.address}. ${reason}`);
                this.saveAsync().catch(e => logger.error(`VirtualEquipment: save after auto-disable failed: ${e.message}`));
                this.emit();
            }
        } else if (msg.protocol === Protocol.Chlorinator) {
            if (msg.dest >= 80 && msg.dest <= 83) return;
            const chlor = this.findChlorinatorByAddress(80);
            if (!chlor || !chlor.isEffective) return;
            const now = Date.now();
            chlor.pushRecentInboundEcho(now);
            const windowStart = now - VirtualEquipmentManager.CONFLICT_WINDOW_MS;
            const echoes = chlor.recentEchoes.filter(t => t >= windowStart);
            if (echoes.length >= 2) {
                const reason = `Collision: ${echoes.length} chlorinator response packets within ${VirtualEquipmentManager.CONFLICT_WINDOW_MS}ms — a real chlorinator is likely on the bus.`;
                chlor.setAutoDisabled(true, reason);
                logger.warn(`VirtualEquipment: auto-disabling chlorinator at address ${chlor.address}. ${reason}`);
                this.saveAsync().catch(e => logger.error(`VirtualEquipment: save after auto-disable failed: ${e.message}`));
                this.emit();
            }
        }
    }

    public shouldAnswerOutbound(msg: Outbound): boolean {
        const synth = this._outboundToInbound(msg);
        return this.shouldAnswer(synth);
    }

    public processOutbound(msg: Outbound): void {
        const synth = this._outboundToInbound(msg);
        this.process(synth);
    }

    private _outboundToInbound(msg: Outbound): Inbound {
        const inbound = new Inbound();
        inbound.protocol = msg.protocol;
        inbound.direction = Direction.In;
        inbound.portId = msg.portId;
        inbound.preamble = msg.preamble.slice();
        inbound.header = msg.header.slice();
        inbound.payload = msg.payload.slice();
        inbound.term = msg.term.slice();
        inbound.isValid = true;
        inbound.timestamp = new Date();
        return inbound;
    }

    public findPumpByAddress(address: number): VirtualPump | undefined {
        return this._pumps.find(p => p.address === address);
    }
    public findEffectivePumpByAddress(address: number): VirtualPump | undefined {
        const p = this.findPumpByAddress(address);
        return p && p.isEffective ? p : undefined;
    }

    public findChlorinatorByAddress(address: number): VirtualChlorinator | undefined {
        return this._chlorinators.find(c => c.address === address);
    }
    public findEffectiveChlorinatorByAddress(address: number): VirtualChlorinator | undefined {
        const c = this.findChlorinatorByAddress(address);
        return c && c.isEffective ? c : undefined;
    }

    public async upsertPumpAsync(def: any): Promise<VirtualPump> {
        if (typeof def.address !== 'number') throw new Error('address is required');
        const type = (def.type || 'vs').toLowerCase();
        let pump = this.findPumpByAddress(def.address);
        if (pump) {
            if (pump.type !== type) {
                this._pumps = this._pumps.filter(p => p !== pump);
                pump = null;
            } else {
                pump.applyUserConfig({
                    enabled: def.enabled === true,
                    portId: typeof def.portId === 'number' ? def.portId : pump.portId,
                    wattModel: def.wattModel || pump.wattModel
                });
                pump.clearAutoDisabled();
            }
        }
        if (!pump) {
            pump = this._constructPump({ ...def, autoDisabled: false });
            this._pumps.push(pump);
        }
        await this.saveAsync();
        this.emit();
        return pump;
    }

    public async deletePumpAsync(address: number): Promise<void> {
        const before = this._pumps.length;
        this._pumps = this._pumps.filter(p => p.address !== address);
        if (this._pumps.length !== before) {
            await this.saveAsync();
            this.emit();
        }
    }

    public async reenablePumpAsync(address: number): Promise<VirtualPump | undefined> {
        const pump = this.findPumpByAddress(address);
        if (!pump) return undefined;
        pump.clearAutoDisabled();
        await this.saveAsync();
        this.emit();
        return pump;
    }

    public async upsertChlorinatorAsync(def: any): Promise<VirtualChlorinator> {
        if (typeof def.address !== 'number') throw new Error('address is required');
        let chlor = this.findChlorinatorByAddress(def.address);
        if (chlor) {
            chlor.applyUserConfig({
                enabled: def.enabled === true,
                portId: typeof def.portId === 'number' ? def.portId : chlor.portId,
                saltLevel: typeof def.saltLevel === 'number' ? def.saltLevel : chlor.saltLevel,
                modelName: def.modelName || chlor.modelName
            });
            chlor.clearAutoDisabled();
        } else {
            chlor = this._constructChlorinator({ ...def, autoDisabled: false });
            this._chlorinators.push(chlor);
        }
        await this.saveAsync();
        this.emit();
        return chlor;
    }

    public async deleteChlorinatorAsync(address: number): Promise<void> {
        const before = this._chlorinators.length;
        this._chlorinators = this._chlorinators.filter(c => c.address !== address);
        if (this._chlorinators.length !== before) {
            await this.saveAsync();
            this.emit();
        }
    }

    public async reenableChlorinatorAsync(address: number): Promise<VirtualChlorinator | undefined> {
        const chlor = this.findChlorinatorByAddress(address);
        if (!chlor) return undefined;
        chlor.clearAutoDisabled();
        await this.saveAsync();
        this.emit();
        return chlor;
    }

    public getSnapshot(): any {
        return {
            filePath: this._filePath,
            pumps: this._pumps.map(p => p.toSnapshot()),
            chlorinators: this._chlorinators.map(c => c.toSnapshot())
        };
    }

    public async saveAsync(): Promise<void> {
        const data = {
            pumps: this._pumps.map(p => p.toPersisted()),
            chlorinators: this._chlorinators.map(c => c.toPersisted())
        };
        const dir = path.dirname(this._filePath);
        try {
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(this._filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
            logger.error(`VirtualEquipment: failed to write ${this._filePath}: ${(err as Error).message}`);
            throw err;
        }
    }

    public emit(): void {
        try {
            webApp.emitToClients('virtualEquipment', this.getSnapshot());
        } catch { /* webApp may not be initialized during unit tests */ }
    }
}

export const virtualEquipmentManager: VirtualEquipmentManager = new VirtualEquipmentManager();
