import { ConfigMessage } from "./config/ConfigMessage";
import { PumpMessage } from "./config/PumpMessage"
import { VersionMessage } from "./status/VersionMessage";
import { PumpStateMessage } from "./status/PumpStateMessage";
import { EquipmentStateMessage } from "./status/EquipmentStateMessage";
import { ChlorinatorStateMessage } from "./status/ChlorinatorStateMessage";
import { ExternalMessage } from "./config/ExternalMessage";
import { Timestamp, ControllerType } from "../../Constants";
import { CircuitMessage } from "./config/CircuitMessage"
import { config } from '../../../config/Config';
import { sys } from '../../Equipment';
import { logger } from "../../../logger/Logger";
import { CustomNameMessage } from "./config/CustomNameMessage";
import { ScheduleMessage } from "./config/ScheduleMessage";
import { RemoteMessage } from "./config/RemoteMessage";
import { OptionsMessage } from "./config/OptionsMessage";
import { EquipmentMessage } from "./config/EquipmentMessage";
import { ValveMessage } from "./config/ValveMessage";
import { state } from "../../State";
export enum Direction {
    In = 'in',
    Out = 'out'
}
export enum Protocol {
    Unknown = 'unknown',
    Broadcast = 'broadcast',
    Pump = 'pump',
    Chlorinator = 'chlorinator'
}
export class Message {
    constructor() { }

    // Internal Storage
    protected _complete: boolean = false;
    public static headerSubByte: number = 33;
    public static pluginAddress: number = config.getSection('controller', { address: 33 }).address;
    //public static _controllerType: ControllerType = ControllerType.IntelliCenter;


    // Fields
    public timestamp: Date = new Date();
    public direction: Direction = Direction.In;
    public protocol: Protocol = Protocol.Unknown;
    public padding: number[] = [];
    public preamble: number[] = [];
    public header: number[] = [];
    public payload: number[] = [];
    public term: number[] = [];
    public packetCount: number = 0;

    public isValid: boolean = true;
    // Properties
    public get isComplete(): boolean { return this._complete; }
    public get sub(): number { return this.header.length > 1 ? this.header[1] : -1; }
    public get dest(): number { return this.protocol === Protocol.Chlorinator ? 2 : this.header.length > 2 ? this.header[2] : -1; }
    public get source(): number { return this.protocol === Protocol.Chlorinator ? 2 : this.header.length > 3 ? this.header[3] : -1; }
    public get action(): number { return this.protocol === Protocol.Chlorinator ? 0 : this.header.length > 5 ? this.header[4] : -1; }
    public get datalen(): number { return this.protocol === Protocol.Chlorinator ? this.payload.length : this.header.length > 5 ? this.header[5] : -1; }
    public get chkHi(): number { return this.protocol === Protocol.Chlorinator ? 0 : this.term.length > 0 ? this.term[0] : -1; }
    public get chkLo(): number { return this.protocol === Protocol.Chlorinator ? this.term[0] : this.term[1]; }
    //public get controllerType(): ControllerType { return Message._controllerType; }
    public get checksum(): number {
        var sum = 0;
        for (let i = 0; i < this.header.length; i++) sum += this.header[i];
        for (let i = 0; i < this.payload.length; i++) sum += this.payload[i];
        return sum;
    }

    // Methods
    public toPacket(): number[] {
        const pkt = [];
        pkt.push(...this.padding);
        pkt.push(...this.preamble);
        pkt.push(...this.header);
        pkt.push(...this.payload);
        pkt.push(...this.term);
        return pkt;
    }
    public toShortPacket(): number[] {
        const pkt = [];
        // pkt.push.apply( pkt, this.padding );
        // pkt.push.apply( pkt, this.preamble );
        pkt.push(...this.header);
        pkt.push(...this.payload);
        pkt.push(...this.term);
        return pkt;
    }
    public toLog(): string {
        return '{"valid":' + this.isValid + ',"dir":"' + this.direction + '","proto":"' + this.protocol
            + '","pkt":[' + JSON.stringify(this.padding) + JSON.stringify(this.preamble) + JSON.stringify(this.header) + JSON.stringify(this.payload) + JSON.stringify(this.term) + ']'
            + ',"ts":"' + Timestamp.toISOLocal(this.timestamp) + '"}';
    }
    public toReplay(): string {
        return '{"type":"packet","packet":[' + this.toPacket().join(',') + '],"direction":"' + (this.direction === Direction.In ? 'inbound' : 'outbound') + '","level":"info","timestamp":"'
            + this.timestamp.toISOString() + '"}';
    }
    private(val: number) {
        if (this.protocol !== Protocol.Chlorinator) this.header[2] = val;
    }
}
export class Inbound extends Message {
    // usr/bin/socat TCP-LISTEN:9801,fork,reuseaddr FILE:/dev/ttyB0,b9600,raw
    constructor() {
        super();
        this.direction = Direction.In;
    }
    // Private methods
    private isValidChecksum(): boolean {
        // Check for the crazy intellichlor -- 40 packet.
        if (this.protocol === Protocol.Chlorinator && this.payload.length === 19 && this.chkLo === 188) return true;
        return (this.chkHi * 256) + this.chkLo === this.checksum;
    }
    private testChlorHeader(bytes: number[], ndx: number): boolean { return (ndx + 1 < bytes.length && bytes[ndx] === 16 && bytes[ndx + 1] === 2); }
    private testBroadcastHeader(bytes: number[], ndx: number): boolean { return ndx < bytes.length - 3 && bytes[ndx] === 255 && bytes[ndx + 1] === 0 && bytes[ndx + 2] === 255 && bytes[ndx + 3] === 165; }
    private testChlorTerm(bytes: number[], ndx: number): boolean { return ndx < bytes.length - 2 && bytes[ndx + 1] === 16 && bytes[ndx + 2] === 3; }
    private pushBytes(target: number[], bytes: number[], ndx: number, length: number): number {
        let end = ndx + length;
        while (ndx < bytes.length && ndx < end)
            target.push(bytes[ndx++]);
        return ndx;
    }
    // Methods
    public readPacket(bytes: number[]): number {
        var ndx = this.readHeader(bytes, 0);
        if (this.isValid) ndx = this.readPayload(bytes, ndx);
        if (this.isValid) ndx = this.readChecksum(bytes, ndx);
        return ndx;
    }
    public mergeBytes(bytes) {
        var ndx = 0;
        if (this.header.length === 0) ndx = this.readHeader(bytes, ndx);
        if (this.isValid) ndx = this.readPayload(bytes, ndx);
        if (this.isValid) ndx = this.readChecksum(bytes, ndx);
        return ndx;
    }
    public readHeader(bytes: number[], ndx: number): number {
        while (ndx < bytes.length) {
            if (this.testChlorHeader(bytes, ndx)) {
                this.protocol = Protocol.Chlorinator;
                break;
            }
            if (this.testBroadcastHeader(bytes, ndx)) {
                this.protocol = Protocol.Broadcast;
                break;
            }
            this.padding.push(bytes[ndx++]);
        }
        switch (this.protocol) {
            case Protocol.Pump:
            case Protocol.Broadcast:
                ndx = this.pushBytes(this.preamble, bytes, ndx, 3);
                ndx = this.pushBytes(this.header, bytes, ndx, 6);
                if (this.source >= 96 && this.source <= 111) this.protocol = Protocol.Pump;
                if (this.dest >= 96 && this.dest <= 111) this.protocol = Protocol.Pump;
                if (this.datalen > 50) this.isValid = false;
                break;
            case Protocol.Chlorinator:
                ndx = this.pushBytes(this.header, bytes, ndx, 2);
                break;
            default:
                break;
        }
        return ndx;
    }
    public readPayload(bytes: number[], ndx: number): number {
        if (!this.isValid) return bytes.length;
        switch (this.protocol) {
            case Protocol.Broadcast:
            case Protocol.Pump:
                ndx = this.pushBytes(this.payload, bytes, ndx, this.datalen - this.payload.length);
                break;
            case Protocol.Chlorinator:
                while (ndx < bytes.length && !this.testChlorTerm(bytes, ndx)) {
                    this.payload.push(bytes[ndx++]);
                    if (this.payload.length > 20) {
                        this.isValid = false; // We have a runaway packet.  Some collision occurred so lets preserve future packets.
                        break;
                    }
                }
                break;
        }
        return ndx;
    }
    public readChecksum(bytes: number[], ndx: number): number {
        if (!this.isValid) return bytes.length;
        if (ndx >= bytes.length) return ndx;
        switch (this.protocol) {
            case Protocol.Broadcast:
            case Protocol.Pump:
                if (this.payload.length >= this.datalen) {
                    this._complete = true;
                    ndx = this.pushBytes(this.term, bytes, ndx, 2);
                    this.isValid = this.isValidChecksum();
                }
                break;
            case Protocol.Chlorinator:
                if (this.testChlorTerm(bytes, ndx)) {
                    this._complete = true;
                    ndx = this.pushBytes(this.term, bytes, ndx, 3);
                    this.isValid = this.isValidChecksum();
                }
                break;
        }
        return ndx;
    }
    public extractPayloadString(start: number, length: number) {
        var s = '';
        for (var i = start; i < this.payload.length && i < start + length; i++) {
            if (this.payload[i] <= 0) break;
            s += String.fromCharCode(this.payload[i]);
        }
        return s;
    }
    public extractPayloadInt(ndx: number, def?: number) {
        return ndx + 1 < this.payload.length ? (this.payload[ndx + 1] * 256) + this.payload[ndx] : def;
    }
    public extractPayloadByte(ndx: number, def?: number) {
        return ndx < this.payload.length ? this.payload[ndx] : def;
    }
    private processBroadcast(): void {
        if (this.action !== 2 && !state.isInitialized) {
            // RKS: This is a placeholder for now so that messages aren't processed until we
            // are certain who is on the other end of the wire. Once the system config is normalized
            // we won't need this check here anymore.
            return;
        }
        switch (this.action) {
            // IntelliCenter
            case 2:  // Shared IntelliCenter/IntelliTouch
            case 5:
            case 8:
            case 96: // intellibrite lights
            case 204:
                EquipmentStateMessage.process(this);
                break;
            // IntelliTouch
            case 10:
                CustomNameMessage.process(this);
                break;
            case 11:
                CircuitMessage.process(this);
                break;
            case 17:
                ScheduleMessage.process(this);
                break;
            case 24:
            case 27:
            case 152:
            case 155:
                PumpMessage.process(this);
                break;
            case 25:
                ChlorinatorStateMessage.process(this);
                break;
            // IntelliCenter & IntelliTouch
            case 30:
                switch (sys.controllerType) {
                    case ControllerType.IntelliCenter:
                        ConfigMessage.process(this);
                        break;
                    case ControllerType.Unknown:
                        break;
                    default:
                        OptionsMessage.process(this);
                        break;
                }
                break;
            case 22:
            case 32:
            case 33:
                RemoteMessage.process(this);
                break;
            case 29:
            case 35:
                ValveMessage.process(this);
                break;
            case 39:
            case 167:
                CircuitMessage.process(this);
                break;
            case 40:
                OptionsMessage.process(this);
                break;
            case 164:  //IntelliCenter
                VersionMessage.process(this);
                break;
            case 168: // Some other turd is setting a value.
                // This appears to be like the config packet where the dispatching is dependent upon the byte 0 of the payload.
                // 7 = Intellichlor and this looks like the correct data.
                // Change pool level from 50 to 51%
                // [165, 63, 15, 16, 168, 11][7, 0, 0, 32, 1, 51, 10, 0, 13, 0, 1][2, 41]
                // Set cleaner on.
                // [165, 63, 16, 36, 168, 35][15, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0][6, 14] // Later on.
                //console.log(this.toLog());
                // We are going to catch some of these as this will reflect some of the state information much more rapidly.  For instance, when another controller
                // selects a new light theme a message will come across the wire with an action of 168 and a byte 0 of 1.  In order to get this change more rapidly
                // we will capture it and reflect the change.  If a failure occurs the request will either be sent again or a 164 will be sent on the wire.  At that point
                // all configuration changes will be picked up.
                ExternalMessage.process(this);
                break;
            case 252:
                EquipmentMessage.process(this);
                break;
            default:
                break;
        }
    }
    public process() {
        //console.log( `${ this.toShortPacket() }` )
        switch (this.protocol) {
            case Protocol.Broadcast:
                this.processBroadcast();
                break;
            case Protocol.Pump:
                if (this.source >= 96 && this.source <= 111)
                    PumpStateMessage.process(this);
                else
                    this.processBroadcast();
                break;
            case Protocol.Chlorinator:
                ChlorinatorStateMessage.process(this);
                break;
            default:
                break;
        }
    }
}
export class Outbound extends Message {
    constructor(proto: Protocol, source: number, dest: number, action: number, payload: number[], retries?: number, response?: Response) {
        super();
        this.protocol = proto;
        this.direction = Direction.Out;
        this.retries = retries || 0;
        this.response = response;
        this.preamble.length = 0;
        this.header.length = 0;
        this.term.length = 0;
        this.payload.length = 0;
        if (proto === Protocol.Chlorinator) {
            this.header.push.apply(this.header, [16, 2]);
            this.term.push.apply(this.term, [0, 16, 3]);
        }
        else {
            this.preamble.push.apply(this.preamble, [255, 0, 255]);
            this.header.push.apply(this.header, [165, Message.headerSubByte, 15, Message.pluginAddress, 0, 0]);
            this.term.push.apply(this.term, [0, 0]);
        }
        this.source = source;
        this.dest = dest;
        this.action = action;
        this.payload.push.apply(this.payload, payload);
    }
    // Factory
    public static createMessage(action: number, payload: number[], retries?: number, response?: Response): Outbound {
        return new Outbound(Protocol.Broadcast, Message.pluginAddress, 16, action, payload, retries, response)
    }
    public static createBroadcastRaw(dest: number, source: number, action: number, payload: number[], retries?: number, response?: Response): Outbound {
        return new Outbound(Protocol.Broadcast, source, dest, action, payload, retries)
    }
    // Fields
    public retries: number = 0;
    public timeout: number = 1000;
    public response: Response;
    public failed: boolean = false;
    // Properties
    public get sub() { return super.sub; }
    public get dest() { return super.dest; }
    public get source() { return super.source; }
    public get action() { return super.action; }
    public get datalen() { return super.datalen; }
    public get chkHi() { return super.chkHi; }
    public get chkLo() { return super.chkLo; }
    public set sub(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[1] = val; }
    public set dest(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[2] = val; }
    public set source(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[3] = val; }
    public set action(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[4] = val; }
    public set datalen(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[5] = val; }
    public set chkHi(val: number) { if (this.protocol !== Protocol.Chlorinator) this.term[0] = val; }
    public set chkLo(val: number) { if (this.protocol !== Protocol.Chlorinator) this.term[1] = val; else this.term[0] = val; }
    public get requiresResponse(): boolean { return (typeof (this.response) !== "undefined" && this.response !== null); }
    // Methods
    public calcChecksum() {
        this.datalen = this.payload.length;
        let sum: number = this.checksum;
        switch (this.protocol) {
            case Protocol.Pump:
            case Protocol.Broadcast:
                this.chkHi = Math.floor(sum / 256);
                this.chkLo = (sum - (super.chkHi * 256));
                break;
            case Protocol.Chlorinator:
                this.term[0] = sum;
                break;
        }
    }
    public appendPayloadString(s: string, len?: number) {
        for (var i = 0; i < s.length; i++) {
            if (typeof (len) !== "undefined" && i >= len) break;
            this.payload.push(s.charCodeAt(i));
        }
        if (typeof (len) !== "undefined") {
            for (var j = i; j < len; j++) this.payload.push(0);
        }
        return this;
    }
    public toPacket(): number[] {
        var pkt = [];
        this.calcChecksum();
        pkt.push.apply(pkt, this.padding);
        pkt.push.apply(pkt, this.preamble);
        pkt.push.apply(pkt, this.header);
        pkt.push.apply(pkt, this.payload);
        pkt.push.apply(pkt, this.term);
        return pkt;
    }
}
export class Ack extends Outbound {
    constructor(byte: number) {
        super(Protocol.Broadcast, Message.pluginAddress, 15, 1, [byte]);
    }
}
export class Response extends Message {
    constructor(source: number, dest: number, action?: number, payload?: number[], ack?: number, callback?: (msg?: Outbound) => void) {
        super();
        this.protocol = Protocol.Broadcast;
        this.direction = Direction.In;
        this.preamble.push.apply(this.preamble, [255, 0, 255]);
        this.header.push.apply(this.header, [165, Message.headerSubByte, 0, 0, 0, 0]);
        this.term.push.apply(this.term, [0, 0]);
        this.source = source;
        this.dest = dest;
        this.action = action;
        if (typeof payload !== 'undefined' && payload.length > 0) this.payload.push(...payload);
        if (typeof ack !== 'undefined' && ack !== null) this.ack = new Ack(ack);
        this.callback = callback;
    }
    // Factory
    public static createResponse(action: number, payload: number[]): Response {
        return new Response(15, Message.pluginAddress, action, payload);
    }
    // Fields
    public ack: Ack;
    public callback: () => void;

    // Properties
    public get sub() { return super.sub; }
    public get dest() { return super.dest; }
    public get source() { return super.source; }
    public get action() { return super.action; }
    public get datalen() { return super.datalen; }
    public set sub(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[1] = val; }
    public set dest(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[2] = val; }
    public set source(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[3] = val; }
    public set action(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[4] = val; }
    public set datalen(val: number) { if (this.protocol !== Protocol.Chlorinator) this.header[5] = val; }
    public set chkHi(val: number) { if (this.protocol !== Protocol.Chlorinator) this.term[0] = val; }
    public set chkLo(val: number) { if (this.protocol !== Protocol.Chlorinator) this.term[1] = val; else this.term[0] = val; }

    // Methods
    public isResponse(msg: Message): boolean {
        if (typeof this.action !== 'undefined' && this.action !== null && msg.action !== this.action)
            return false;
        if (sys.controllerType !== ControllerType.IntelliCenter) {
            if (this.action === 252 && msg.action === 253) return true;
            switch (this.action) {
                // these responses have multiple items so match the 1st payload byte
                case 1: // ack
                case 10:
                case 11:
                case 17:
                    if (msg.payload[0] !== this.payload[0]) return false;
                    break;
                case 252:
                    if (msg.action !== 253) return false;
                    break;
                default:
                    if (this.action !== msg.action) return false;
            }
        }
        else if (sys.controllerType === ControllerType.IntelliCenter) {
            // intellicenter packets
            for (let i = 0; i < this.payload.length; i++) {
                if (i > msg.payload.length - 1)
                    return false;
                if (msg.payload[i] !== this.payload[i]) return false;
            }
        }
        return true;
    }
}