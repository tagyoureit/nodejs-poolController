import { Direction, Inbound, Outbound, Protocol } from '../../comms/messages/Messages';
import { IntelliChemStateMessage } from '../../comms/messages/status/IntelliChemStateMessage';
import { conn } from '../../comms/Comms';
import { sys } from '../../Equipment';
import { logger } from '../../../logger/Logger';

const SUPPORTED_ACTIONS = new Set<number>([210, 146]);
const LOOPBACK_ACTIONS = new Set<number>([18]);

export interface VirtualIntelliChemOptions {
    address: number;
    portId?: number;
    enabled?: boolean;
    autoDisabled?: boolean;
    autoDisabledAt?: string | null;
    autoDisabledReason?: string | null;
    phLevel?: number;
    phSetpoint?: number;
    orpLevel?: number;
    orpSetpoint?: number;
    temperature?: number;
    calciumHardness?: number;
    cyanuricAcid?: number;
    alkalinity?: number;
    saltLevel?: number;
    phTankLevel?: number;
    orpTankLevel?: number;
}

export class VirtualIntelliChem {
    public readonly address: number;
    public portId: number;

    private _enabled: boolean;
    private _autoDisabled: boolean;
    private _autoDisabledAt: string | null;
    private _autoDisabledReason: string | null;

    public phLevel: number;
    public phSetpoint: number;
    public orpLevel: number;
    public orpSetpoint: number;
    public temperature: number;
    public calciumHardness: number;
    public cyanuricAcid: number;
    public alkalinity: number;
    public saltLevel: number;
    public phTankLevel: number;
    public orpTankLevel: number;

    private _lastPacketAt: number | null = null;
    private _packetCount = 0;
    private _recentEchoes: number[] = [];
    public _dirty = false;

    constructor(opts: VirtualIntelliChemOptions) {
        this.address = opts.address;
        this.portId = opts.portId ?? 0;
        this._enabled = opts.enabled === true;
        this._autoDisabled = opts.autoDisabled === true;
        this._autoDisabledAt = opts.autoDisabledAt ?? null;
        this._autoDisabledReason = opts.autoDisabledReason ?? null;

        this.phLevel = opts.phLevel ?? 7.5;
        this.phSetpoint = opts.phSetpoint ?? 7.5;
        this.orpLevel = opts.orpLevel ?? 700;
        this.orpSetpoint = opts.orpSetpoint ?? 700;
        this.temperature = opts.temperature ?? 78;
        this.calciumHardness = opts.calciumHardness ?? 300;
        this.cyanuricAcid = opts.cyanuricAcid ?? 40;
        this.alkalinity = opts.alkalinity ?? 100;
        this.saltLevel = opts.saltLevel ?? 3400;
        this.phTankLevel = opts.phTankLevel ?? 6;
        this.orpTankLevel = opts.orpTankLevel ?? 6;
    }

    public get enabled(): boolean { return this._enabled; }
    public get autoDisabled(): boolean { return this._autoDisabled; }
    public get autoDisabledAt(): string | null { return this._autoDisabledAt; }
    public get autoDisabledReason(): string | null { return this._autoDisabledReason; }
    public get isEffective(): boolean { return this._enabled && !this._autoDisabled; }
    public get recentEchoes(): number[] { return this._recentEchoes; }

    public supportsAction(action: number): boolean {
        return SUPPORTED_ACTIONS.has(action);
    }

    public pushRecentInboundEcho(ts: number): void {
        this._recentEchoes.push(ts);
        if (this._recentEchoes.length > 8) this._recentEchoes.splice(0, this._recentEchoes.length - 8);
    }

    public setAutoDisabled(v: boolean, reason?: string): void {
        this._autoDisabled = v;
        this._autoDisabledAt = v ? new Date().toISOString() : null;
        this._autoDisabledReason = v ? (reason || 'Collision detected on bus') : null;
    }

    public clearAutoDisabled(): void {
        this._autoDisabled = false;
        this._autoDisabledAt = null;
        this._autoDisabledReason = null;
    }

    public applyUserConfig(opts: Partial<VirtualIntelliChemOptions>): void {
        if (typeof opts.enabled === 'boolean') this._enabled = opts.enabled;
        if (typeof opts.portId === 'number') this.portId = opts.portId;
        if (typeof opts.phLevel === 'number') this.phLevel = opts.phLevel;
        if (typeof opts.phSetpoint === 'number') this.phSetpoint = opts.phSetpoint;
        if (typeof opts.orpLevel === 'number') this.orpLevel = opts.orpLevel;
        if (typeof opts.orpSetpoint === 'number') this.orpSetpoint = opts.orpSetpoint;
        if (typeof opts.temperature === 'number') this.temperature = opts.temperature;
        if (typeof opts.calciumHardness === 'number') this.calciumHardness = opts.calciumHardness;
        if (typeof opts.cyanuricAcid === 'number') this.cyanuricAcid = opts.cyanuricAcid;
        if (typeof opts.alkalinity === 'number') this.alkalinity = opts.alkalinity;
        if (typeof opts.saltLevel === 'number') this.saltLevel = opts.saltLevel;
        if (typeof opts.phTankLevel === 'number') this.phTankLevel = opts.phTankLevel;
        if (typeof opts.orpTankLevel === 'number') this.orpTankLevel = opts.orpTankLevel;
    }

    public process(msg: Inbound): void {
        this._lastPacketAt = Date.now();
        this._packetCount++;

        switch (msg.action) {
            case 210: {
                const response = Outbound.create({
                    portId: msg.portId,
                    protocol: Protocol.Broadcast,
                    source: this.address,
                    dest: msg.source,
                    action: 18,
                    payload: [],
                    retries: 0,
                    response: false
                });
                this._appendStatusPayload(response);
                try {
                    let port = conn.findPortById(response.portId);
                    if (port) port.emitter.emit('messagewritepriority', response);
                    else conn.queueSendMessage(response);
                    logger.verbose(`VirtualIntelliChem ${this.address}: answered action 210 with status (action 18)`);
                } catch (err) {
                    logger.error(`VirtualIntelliChem ${this.address}: failed to queue response: ${(err as Error).message}`);
                }
                if (LOOPBACK_ACTIONS.has(18)) {
                    this._loopbackAsInbound(response);
                }
                break;
            }
            case 146: {
                const phSp = msg.extractPayloadIntBE(0);
                const orpSp = msg.extractPayloadIntBE(2);
                if (phSp > 0 && phSp < 1000) this.phSetpoint = phSp / 100;
                if (orpSp > 0 && orpSp < 1000) this.orpSetpoint = orpSp;
                const ch = msg.extractPayloadIntBE(6);
                const cya = msg.extractPayloadIntBE(8);
                const alk = msg.extractPayloadIntBE(10);
                if (ch > 0) this.calciumHardness = ch;
                if (cya > 0) this.cyanuricAcid = cya;
                if (alk > 0) this.alkalinity = alk;
                this._dirty = true;
                logger.verbose(`VirtualIntelliChem ${this.address}: received config push (action 146) ph=${this.phSetpoint} orp=${this.orpSetpoint} ch=${this.calciumHardness} cya=${this.cyanuricAcid} alk=${this.alkalinity}`);
                break;
            }
            default:
                logger.verbose(`VirtualIntelliChem ${this.address}: ignoring unsupported action ${msg.action}`);
                return;
        }
    }

    private _appendStatusPayload(response: Outbound): void {
        const phRaw = Math.round(this.phLevel * 100);
        const orpRaw = Math.round(this.orpLevel);
        const phSpRaw = Math.round(this.phSetpoint * 100);
        const orpSpRaw = Math.round(this.orpSetpoint);
        const salt = Math.round(this.saltLevel / 50);
        const alk = Math.round(this.alkalinity);
        const ch = Math.round(this.calciumHardness);

        response.appendPayloadByte((phRaw >> 8) & 0xFF);
        response.appendPayloadByte(phRaw & 0xFF);
        response.appendPayloadByte((orpRaw >> 8) & 0xFF);
        response.appendPayloadByte(orpRaw & 0xFF);
        response.appendPayloadByte((phSpRaw >> 8) & 0xFF);
        response.appendPayloadByte(phSpRaw & 0xFF);
        response.appendPayloadByte((orpSpRaw >> 8) & 0xFF);
        response.appendPayloadByte(orpSpRaw & 0xFF);
        response.appendPayloadByte(0); // [8]
        response.appendPayloadByte(0); // [9]
        response.appendPayloadByte(0); // [10] pH dose time hi
        response.appendPayloadByte(0); // [11] pH dose time lo
        response.appendPayloadByte(0); // [12]
        response.appendPayloadByte(0); // [13]
        response.appendPayloadByte(0); // [14] ORP dose time hi
        response.appendPayloadByte(0); // [15] ORP dose time lo
        response.appendPayloadByte(0); // [16] pH dose vol hi
        response.appendPayloadByte(0); // [17] pH dose vol lo
        response.appendPayloadByte(0); // [18] ORP dose vol hi
        response.appendPayloadByte(0); // [19] ORP dose vol lo
        response.appendPayloadByte(this.phTankLevel); // [20]
        response.appendPayloadByte(this.orpTankLevel); // [21]
        const lsi = this._calculateLSI();
        const lsiByte = lsi < 0 ? (256 + Math.round(lsi * 100)) & 0xFF : Math.round(lsi * 100) & 0x7F;
        response.appendPayloadByte(lsiByte); // [22] LSI
        response.appendPayloadByte((ch >> 8) & 0xFF); // [23] calcium hi
        response.appendPayloadByte(ch & 0xFF); // [24] calcium lo
        response.appendPayloadByte(0); // [25]
        response.appendPayloadByte(this.cyanuricAcid & 0xFF); // [26] CYA
        response.appendPayloadByte((alk >> 8) & 0xFF); // [27] alkalinity hi
        response.appendPayloadByte(alk & 0xFF); // [28] alkalinity lo
        response.appendPayloadByte(salt & 0xFF); // [29] salt / 50
        response.appendPayloadByte(0); // [30]
        response.appendPayloadByte(this.temperature & 0xFF); // [31]
        response.appendPayloadByte(0); // [32] alarms (no alarms)
        response.appendPayloadByte(0); // [33] warnings (no warnings)
        response.appendPayloadByte(0x85); // [34] doser type + status: pH=acid(1), ORP=chlor(1), pH=dosing(0), ORP=monitoring(2)
        response.appendPayloadByte(0); // [35] delays
        response.appendPayloadByte(80); // [36] firmware lo (1.080)
        response.appendPayloadByte(1); // [37] firmware hi
        response.appendPayloadByte(0); // [38] water chemistry
        response.appendPayloadByte(0); // [39]
        response.appendPayloadByte(0); // [40]
    }

    private _calculateLSI(): number {
        const tempC = (this.temperature - 32) * 5 / 9;
        const tf = 0.0124 * tempC + 0.55;
        const cf = Math.log10(Math.max(this.calciumHardness, 1));
        const af = Math.log10(Math.max(this.alkalinity, 1));
        return Math.round((this.phLevel + tf + cf + af - 12.1) * 100) / 100;
    }

    private _loopbackAsInbound(out: Outbound): void {
        const cfg = sys.chemControllers.getItemByAddress(this.address);
        if (!cfg || !cfg.isActive) return;
        try {
            const inbound = new Inbound();
            inbound.protocol = Protocol.Broadcast;
            inbound.direction = Direction.In;
            inbound.portId = out.portId;
            inbound.preamble = [255, 0, 255];
            inbound.header = [165, 0, out.dest, this.address, 18, out.payload.length];
            inbound.payload = out.payload.slice();
            inbound.term = out.term.slice();
            inbound.isValid = true;
            inbound.timestamp = new Date();
            IntelliChemStateMessage.process(inbound);
        } catch (err) {
            logger.error(`VirtualIntelliChem ${this.address}: loopback failed: ${(err as Error).message}`);
        }
    }

    public toPersisted(): any {
        return {
            address: this.address,
            portId: this.portId,
            enabled: this._enabled,
            autoDisabled: this._autoDisabled,
            autoDisabledAt: this._autoDisabledAt,
            autoDisabledReason: this._autoDisabledReason,
            phLevel: this.phLevel,
            phSetpoint: this.phSetpoint,
            orpLevel: this.orpLevel,
            orpSetpoint: this.orpSetpoint,
            temperature: this.temperature,
            calciumHardness: this.calciumHardness,
            cyanuricAcid: this.cyanuricAcid,
            alkalinity: this.alkalinity,
            saltLevel: this.saltLevel,
            phTankLevel: this.phTankLevel,
            orpTankLevel: this.orpTankLevel
        };
    }

    public toSnapshot(): any {
        return {
            ...this.toPersisted(),
            isEffective: this.isEffective,
            runtime: {
                lastPacketAt: this._lastPacketAt ? new Date(this._lastPacketAt).toISOString() : null,
                packetCount: this._packetCount
            }
        };
    }
}
