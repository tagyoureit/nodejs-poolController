/*
IntelliCenter v3 OCP local WebSocket transport (port 6680).

Foundation scaffold per .plan/icv3-local-ws-transport.plan.md
- mDNS discovery of `Pentair -i -n<alias>` services on `_http._tcp.local`
- WS client with JSON envelope { command, messageID, objectList }
- Request/response correlator keyed by messageID
- RequestParamList subscription manager (re-subscribes on reconnect)
- Stats + cross-client emit on `icwsStats`
- Mutual exclusion: refuses to open while any RS-485 port or ScreenLogic is active;
  refuses to send when not open. Conversely, controller/comms/Comms.ts hard-guards
  RS-485 writes when icws is open.

This file does NOT yet:
- Mutate Equipment/State (no inbound translators)
- Replace IntelliCenterBoard outbound packet calls
Those are deferred per scope decision (foundation only). Hooks are exposed via
the typed event emitter so a follow-on PR can layer translators on top.
*/
import { EventEmitter } from 'events';
import { config } from '../../config/Config';
import { logger } from '../../logger/Logger';
import { webApp } from '../../web/Server';
import { Timestamp } from '../Constants';
import { Message } from './messages/Messages';
import { IntelliCenterWSController, finalizeGroupMembersWS } from './IntelliCenterWSController';
import { sys } from '../Equipment';
import { state } from '../State';
import * as childProcess from 'child_process';
import * as dns from 'dns';
import * as os from 'os';
const multicastdns = require('multicast-dns');

// Minimal local typing for `ws` to avoid a hard dep on @types/ws if missing.
interface WSClientLike extends EventEmitter {
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
}
const WebSocketCtor: any = (() => { try { return require('ws'); } catch { return undefined; } })();

const WS_OPEN = 1;

export interface OCPDiscoveryResult {
    alias: string;
    host: string;       // ipv4 string
    port: number;       // typically 6680
    fqdn?: string;
}

export interface ICWSRequest {
    command: 'GetParamList' | 'SetParamList' | 'WriteParamList' | 'RequestParamList'
        | 'ReleaseParamList' | 'ClearParam' | 'SendQuery' | 'GETQUERY' | 'SetCommand' | 'GetObject';
    messageID?: string;
    objectList?: any[];
    [k: string]: any;
}

export interface ICWSSubscription {
    objnam: string;
    keys: string[];
}

export class ICWSCounter {
    public bytesReceived: number = 0;
    public bytesSent: number = 0;
    public framesIn: number = 0;
    public framesOut: number = 0;
    public requests: number = 0;
    public responses: number = 0;
    public notifications: number = 0;
    public errors: number = 0;
    public reconnects: number = 0;
}

interface PendingRequest {
    resolve: (v: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    sentAt: Date;
    command: string;
}

export class IntelliCenterWSComms extends EventEmitter {
    private _client: WSClientLike | undefined;
    private _cfg: any;
    private _opening: boolean = false;
    private _closing: boolean = false;
    private _reconnectTimer: NodeJS.Timeout | undefined;
    private _pending: Map<string, PendingRequest> = new Map();
    private _subscriptions: Map<string, ICWSSubscription> = new Map();
    private _seq: number = 0;
    public counter: ICWSCounter = new ICWSCounter();
    public isOpen: boolean = false;
    public enabled: boolean = false;
    public lastError: string | undefined;
    public snapshotInProgress: boolean = false;
    public snapshotComplete: boolean = false;
    public snapshotState: 'idle' | 'loading' | 'complete' | 'failed' = 'idle';
    private _snapshotProgress: { current: number; total: number; collection: string; } = { current: 0, total: 0, collection: '' };
    private _disconnectedAt: number = 0;
    private _lastNotifyAt: number = 0;
    private _pendingValveDiverted: boolean | undefined = undefined;
    private _totalNotifications: number = 0;
    private _alertPollTimer: NodeJS.Timeout | undefined;
    private _keepaliveTimer: NodeJS.Timeout | undefined;
    private _keepaliveMissCount: number = 0;
    private _snapshotObjnams: Set<string> = new Set();

    public get host(): string { return this._cfg?.ocpws?.host || ''; }
    public get port(): number { return this._cfg?.ocpws?.port || 6680; }
    public get alias(): string { return this._cfg?.ocpws?.alias || ''; }

    private nextMessageId(): string {
        this._seq = (this._seq + 1) & 0x7fffffff;
        return `njspc-${Date.now().toString(36)}-${this._seq.toString(36)}`;
    }

    private loadConfig(): void {
        this._cfg = config.getSection('controller.comms');
        this.enabled = !!(this._cfg && this._cfg.enabled && this._cfg.type === 'ocpws');
    }

    /**
     * Block opening if any other transport (RS-485 or ScreenLogic) is currently
     * open on this process. Caller (Comms.setPortAsync / initAsync) should close
     * the prior transport first; this guard is defense-in-depth.
     */
    private assertExclusive(): void {
        // Local require to avoid circular import at module load time.
        const { conn } = require('./Comms');
        const { sl } = require('./ScreenLogic');
        if (sl && sl.isOpen) {
            throw new Error('IntelliCenterWSComms: cannot open while ScreenLogic is connected.');
        }
        if (conn && Array.isArray(conn.rs485Ports)) {
            for (const p of conn.rs485Ports) {
                if (p && p.isOpen) {
                    throw new Error(`IntelliCenterWSComms: cannot open while RS-485 port ${p.portId} is open.`);
                }
            }
        }
    }

    public async openAsync(): Promise<boolean> {
        this.loadConfig();
        if (!this.enabled) {
            logger.silly('IntelliCenterWS: not enabled (controller.comms.type !== "ocpws"); skipping open.');
            return false;
        }
        if (!WebSocketCtor) {
            this.lastError = `'ws' module not installed; run npm install`;
            logger.error(`IntelliCenterWS: ${this.lastError}`);
            return false;
        }
        if (!this.host) {
            this.lastError = 'IntelliCenterWS: host is empty. Configure controller.comms.ocpws.host or run discovery.';
            logger.error(this.lastError);
            return false;
        }
        try { this.assertExclusive(); }
        catch (err) {
            this.lastError = err.message;
            logger.error(err.message);
            return false;
        }
        if (this._opening) return false;
        this._opening = true;
        this._closing = false;
        const url = `ws://${this.host}:${this.port}/`;
        return new Promise<boolean>((resolve) => {
            try {
                const ws: WSClientLike = new WebSocketCtor(url, {
                    handshakeTimeout: 5000,
                    perMessageDeflate: false,
                });
                this._client = ws;
                let settled = false;
                const settle = (ok: boolean, err?: any) => {
                    if (settled) return;
                    settled = true;
                    this._opening = false;
                    if (!ok) {
                        this.lastError = err?.message || 'open failed';
                        logger.error(`IntelliCenterWS: open failed (${url}): ${this.lastError}`);
                        this.scheduleReconnect();
                    }
                    resolve(ok);
                };
                ws.on('open', () => {
                    this.isOpen = true;
                    logger.info(`IntelliCenterWS: connected to ${url} (alias="${this.alias}")`);
                    this.emit('open');
                    this.emitStats();
                    this.handleReconnectAsync().catch(e =>
                        logger.error(`IntelliCenterWS: reconnect handler error: ${e.message}`));
                    settle(true);
                });
                ws.on('message', (raw: any) => this.onMessage(raw));
                ws.on('error', (err: any) => {
                    this.counter.errors++;
                    this.lastError = err?.message || String(err);
                    logger.error(`IntelliCenterWS: socket error: ${this.lastError}`);
                    if (this.listenerCount('error') > 0) this.emit('error', err);
                    this.emitStats();
                    settle(false, err);
                });
                ws.on('close', (code: number, reason: any) => {
                    const wasOpen = this.isOpen;
                    if (wasOpen) this._disconnectedAt = Date.now();
                    this.isOpen = false;
                    this._client = undefined;
                    this.failAllPending(new Error(`websocket closed (code=${code})`));
                    if (wasOpen) {
                        logger.warn(`IntelliCenterWS: closed (code=${code}, reason=${reason?.toString() || ''})`);
                    }
                    this.emit('close');
                    this.emitStats();
                    if (!this._closing) this.scheduleReconnect();
                    settle(wasOpen);
                });
            } catch (err) {
                this._opening = false;
                this.lastError = err.message;
                logger.error(`IntelliCenterWS: open exception: ${err.message}`);
                this.scheduleReconnect();
                resolve(false);
            }
        });
    }

    public async closeAsync(): Promise<boolean> {
        this._closing = true;
        this.stopKeepalive();
        if (this._alertPollTimer) {
            clearInterval(this._alertPollTimer);
            this._alertPollTimer = undefined;
        }
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = undefined;
        }
        const ws = this._client;
        if (!ws) {
            this.isOpen = false;
            this.emitStats();
            return true;
        }
        return new Promise<boolean>((resolve) => {
            const done = () => {
                this.isOpen = false;
                this._client = undefined;
                this.failAllPending(new Error('connection closed by client'));
                this.emitStats();
                resolve(true);
            };
            try {
                ws.once('close', done);
                ws.close(1000, 'njsPC close');
                // Hard cut after 2s if server doesn't ack.
                setTimeout(() => { try { ws.terminate(); } catch { /* */ } done(); }, 2000);
            } catch {
                done();
            }
        });
    }

    private scheduleReconnect(): void {
        if (this._closing || !this.enabled) return;
        const delay = Math.max(1000, Number(this._cfg?.ocpws?.reconnectMs) || 5000);
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => {
            this.counter.reconnects++;
            logger.info(`IntelliCenterWS: reconnect attempt #${this.counter.reconnects} -> ${this.host}:${this.port}`);
            this.openAsync().catch(e => logger.error(`IntelliCenterWS: reconnect error: ${e.message}`));
        }, delay);
    }

    private failAllPending(err: Error): void {
        for (const [, pr] of this._pending) {
            clearTimeout(pr.timer);
            try { pr.reject(err); } catch { /* */ }
        }
        this._pending.clear();
    }

    private onMessage(raw: any): void {
        let text: string;
        if (Buffer.isBuffer(raw)) { this.counter.bytesReceived += raw.length; text = raw.toString('utf8'); }
        else if (typeof raw === 'string') { this.counter.bytesReceived += Buffer.byteLength(raw, 'utf8'); text = raw; }
        else { this.counter.bytesReceived += String(raw).length; text = String(raw); }
        this.counter.framesIn++;
        let msg: any;
        try { msg = JSON.parse(text); }
        catch (err) {
            this.counter.errors++;
            logger.warn(`IntelliCenterWS: non-JSON frame discarded (${err.message}). Snippet: ${text.slice(0, 200)}`);
            return;
        }
        this.logFrame('in', msg);
        const id = msg && msg.messageID;
        if (id && this._pending.has(id)) {
            const pr = this._pending.get(id)!;
            clearTimeout(pr.timer);
            this._pending.delete(id);
            this.counter.responses++;
            try { pr.resolve(msg); } catch (e) { logger.error(`IntelliCenterWS: response handler error: ${e.message}`); }
            this.emitStats();
            return;
        }
        // Unsolicited frames (NotifyList push, server hello, error, etc.).
        if (msg && msg.command === 'NotifyList') {
            this.counter.notifications++;
            this.emit('notify', msg);
            this.handleNotifyList(msg);
        } else if (msg && msg.command === 'WriteParamList') {
            this.counter.notifications++;
            this.handleNotifyList(msg);
        } else {
            if (msg?.command === 'Error') {
                logger.debug(`IntelliCenterWS: Error frame: ${JSON.stringify(msg).slice(0, 500)}`);
            }
            this.emit('frame', msg);
        }
        this.emitStats();
    }

    private logFrame(dir: 'in' | 'out', msg: any): void {
        try {
            const cmd = msg?.command;
            const id = msg?.messageID;
            const objCount = Array.isArray(msg?.objectList) ? msg.objectList.length : undefined;
            logger.silly(`IntelliCenterWS:${dir} cmd=${cmd} id=${id} objs=${objCount}`);
        } catch { /* */ }
    }

    private handleNotifyList(msg: any): void {
        if (this.snapshotInProgress) return;
        if (!Array.isArray(msg?.objectList)) return;
        this._lastNotifyAt = Date.now();
        this._totalNotifications++;
        for (const obj of msg.objectList) {
            if (obj.objnam && obj.params) {
                try {
                    IntelliCenterWSController.apply(obj.objnam, obj.params);
                } catch (err) {
                    logger.debug(`IntelliCenterWS: NotifyList decode error for ${obj.objnam}: ${err?.message || err}`);
                }
            }
            const processed = new Set<string>();
            if (Array.isArray(obj.created)) {
                for (const item of obj.created) {
                    if (!item.objnam || !item.params) continue;
                    processed.add(item.objnam);
                    try {
                        IntelliCenterWSController.apply(item.objnam, item.params, item.params['OBJTYP']);
                    } catch (err) {
                        logger.debug(`IntelliCenterWS: WriteParamList created decode error for ${item.objnam}: ${err?.message || err}`);
                    }
                }
            }
            if (Array.isArray(obj.changes)) {
                for (const item of obj.changes) {
                    if (!item.objnam || !item.params) continue;
                    if (processed.has(item.objnam)) continue;
                    try {
                        IntelliCenterWSController.apply(item.objnam, item.params, item.params['OBJTYP']);
                    } catch (err) {
                        logger.debug(`IntelliCenterWS: WriteParamList changes decode error for ${item.objnam}: ${err?.message || err}`);
                    }
                }
            }
            if (Array.isArray(obj.deleted)) {
                for (const del of obj.deleted) {
                    if (typeof del === 'string' && del.length > 0) {
                        logger.info(`IntelliCenterWS: OCP deleted object ${del}`);
                        IntelliCenterWSController.handleDeletion(del);
                    }
                }
            }
        }
        sys.board.circuits.syncVirtualCircuitStates();
        state.emitEquipmentChanges();
    }

    /**
     * Single-shot request/response. Throws on timeout, on disconnect, or if the
     * server returns a non-200 response code.
     */
    public async request(req: ICWSRequest, timeoutMs?: number): Promise<any> {
        if (!this.isOpen || !this._client) throw new Error('IntelliCenterWS: not connected');
        // Hard guard: if any RS-485 port is open, refuse to write to WS.
        const { conn } = require('./Comms');
        if (conn && Array.isArray(conn.rs485Ports)) {
            for (const p of conn.rs485Ports) {
                if (p && p.isOpen) throw new Error(`IntelliCenterWS: refusing to send while RS-485 port ${p.portId} is open`);
            }
        }
        const id = req.messageID || this.nextMessageId();
        const envelope: any = { ...req, messageID: id };
        const text = JSON.stringify(envelope);
        const to = Math.max(1000, Number(timeoutMs ?? this._cfg?.ocpws?.messageTimeoutMs) || 10000);
        return new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                this.counter.errors++;
                reject(new Error(`IntelliCenterWS: request '${req.command}' timed out (id=${id})`));
            }, to);
            this._pending.set(id, { resolve, reject, timer, sentAt: new Date(), command: req.command });
            try {
                this._client!.send(text);
                this.counter.requests++;
                this.counter.framesOut++;
                this.counter.bytesSent += Buffer.byteLength(text, 'utf8');
                this.logFrame('out', envelope);
                this.emitStats();
            } catch (err) {
                this._pending.delete(id);
                clearTimeout(timer);
                this.counter.errors++;
                reject(err);
            }
        });
    }

    public async getParamList(objnam: string, keys: string[]): Promise<any> {
        return this.request({ command: 'GetParamList', objectList: [{ objnam, keys }] });
    }

    public async enumerateAll(keys: string[] = ['OBJNAM', 'OBJTYP', 'SNAME', 'SUBTYP']): Promise<any[]> {
        const resp = await this.getParamList('ALL', keys);
        return Array.isArray(resp?.objectList) ? resp.objectList : [];
    }

    public async setParamList(objnam: string, params: Record<string, string>): Promise<any> {
        return this.request({ command: 'SetParamList', objectList: [{ objnam, params }] });
    }

    public async createObject(objtyp: string, params: Record<string, string>): Promise<any> {
        return this.request({ command: 'CREATEOBJECT', objectList: [{ objtyp, params }] } as any);
    }

    public async createObjectAffect(parentObjnam: string, objectList: Array<Record<string, string>>): Promise<any> {
        return this.request({ command: 'SetCommand', method: 'CreateObjectAffect', arguments: { OBJNAM: parentObjnam, objectList } } as any);
    }

    public async deleteObject(objnam: string): Promise<any> {
        return this.request({ command: 'SetCommand', method: 'DeleteObject', objectList: [{ objnam }] });
    }

    public async destroyObject(objnam: string): Promise<any> {
        return this.request({ command: 'SetParamList', objectList: [{ objnam, params: { STATUS: 'DSTROY' } }] });
    }

    /**
     * Add a `RequestParamList` subscription. Re-issued automatically after
     * reconnect. Calling with the same objnam replaces the prior key list.
     */
    public async subscribe(objnam: string, keys: string[]): Promise<void> {
        this._subscriptions.set(objnam, { objnam, keys: [...keys] });
        if (this.isOpen) {
            await this.request({ command: 'RequestParamList', objectList: [{ objnam, keys }] });
        }
    }

    public async unsubscribe(objnam: string): Promise<void> {
        this._subscriptions.delete(objnam);
        if (this.isOpen) {
            await this.request({ command: 'ReleaseParamList', objectList: [{ objnam }] });
        }
    }

    private async resubscribeAll(): Promise<void> {
        if (!this._subscriptions.size) return;
        const objectList: any[] = [];
        for (const sub of this._subscriptions.values()) objectList.push({ objnam: sub.objnam, keys: sub.keys });
        await this.request({ command: 'RequestParamList', objectList });
    }

    private async handleReconnectAsync(): Promise<void> {
        const gap = this._disconnectedAt > 0 ? Date.now() - this._disconnectedAt : 0;
        this._disconnectedAt = 0;
        if (!this.snapshotComplete && gap === 0) {
            return;
        }
        if (gap >= 30000) {
            logger.info(`IntelliCenterWS: reconnect after ${Math.round(gap / 1000)}s gap — running full re-snapshot.`);
            await this.loadInitialConfigAsync();
        } else if (this.snapshotComplete) {
            logger.info(`IntelliCenterWS: reconnect after ${Math.round(gap / 1000)}s gap — re-subscribing only.`);
            await this.subscribeAllAsync();
        }
    }

    /**
     * mDNS discovery of `Pentair -i -n*` services on `_http._tcp.local`.
     *
     * Runs three strategies in order:
     *   1. macOS: shell out to `dns-sd` (built-in, always available) — required
     *      because the `multicast-dns` npm lib cannot co-bind UDP 5353 with
     *      macOS `mDNSResponder` and so silently receives nothing.
     *   2. Linux: shell out to `avahi-browse` if installed.
     *   3. Cross-platform fallback: the `multicast-dns` lib (works on Linux
     *      without avahi, and on Windows).
     *
     * Returns within `timeoutMs` (default 4s).
     */
    public static async searchAsync(timeoutMs: number = 4000): Promise<OCPDiscoveryResult[]> {
        const platform = os.platform();
        try {
            if (platform === 'darwin') {
                const found = await IntelliCenterWSComms.searchViaDnsSd(timeoutMs);
                if (found.length) return found;
            } else if (platform === 'linux') {
                const found = await IntelliCenterWSComms.searchViaAvahi(timeoutMs).catch(() => [] as OCPDiscoveryResult[]);
                if (found.length) return found;
            }
        } catch (err) {
            logger.silly(`IntelliCenterWS.searchAsync: native discovery failed: ${err.message}; falling back to multicast-dns`);
        }
        return IntelliCenterWSComms.searchViaMulticastDns(timeoutMs);
    }

    /** macOS native browse via `dns-sd`. */
    private static searchViaDnsSd(timeoutMs: number): Promise<OCPDiscoveryResult[]> {
        return new Promise<OCPDiscoveryResult[]>((resolve) => {
            const browse = childProcess.spawn('dns-sd', ['-B', '_http._tcp', 'local.']);
            const instances = new Set<string>();
            let buf = '';
            browse.stdout.on('data', (d: Buffer) => {
                buf += d.toString('utf8');
                let idx;
                while ((idx = buf.indexOf('\n')) >= 0) {
                    const line = buf.slice(0, idx);
                    buf = buf.slice(idx + 1);
                    // Matches:  HH:MM:SS.mmm  Add        3  12 local.   _http._tcp.   Pentair -i -nmassol
                    const m = line.match(/^\s*\d{2}:\d{2}:\d{2}\.\d+\s+Add\s+\S+\s+\S+\s+local\.\s+_http\._tcp\.\s+(.+)$/);
                    if (m) {
                        const inst = m[1].trim();
                        if (inst.indexOf('Pentair') === 0) instances.add(inst);
                    }
                }
            });
            const browseTimer = setTimeout(() => { try { browse.kill('SIGTERM'); } catch { /* */ } }, Math.max(1500, Math.floor(timeoutMs * 0.6)));
            browse.on('close', async () => {
                clearTimeout(browseTimer);
                const results: OCPDiscoveryResult[] = [];
                for (const inst of instances) {
                    try {
                        const meta = await IntelliCenterWSComms.dnsSdLookup(inst, Math.max(1000, Math.floor(timeoutMs * 0.4) / Math.max(1, instances.size)));
                        let host = meta?.target || '';
                        let ip = '';
                        if (host) {
                            try { ip = await IntelliCenterWSComms.dnsLookup4(host); } catch { /* */ }
                        }
                        const alias = inst.replace(/^Pentair\s*-i\s*-n/, '').replace(/\._http\._tcp\.local\.?$/, '');
                        results.push({ alias, host: ip || host, port: meta?.port || 6680, fqdn: host });
                    } catch (err) {
                        logger.silly(`IntelliCenterWS.searchViaDnsSd: lookup '${inst}' failed: ${err.message}`);
                    }
                }
                resolve(results);
            });
            browse.on('error', (err: Error) => {
                logger.silly(`IntelliCenterWS.searchViaDnsSd: spawn error: ${err.message}`);
                resolve([]);
            });
        });
    }

    /** macOS `dns-sd -L` to resolve a single instance's SRV (host:port). */
    private static dnsSdLookup(instance: string, timeoutMs: number): Promise<{ target: string; port: number; } | undefined> {
        return new Promise((resolve) => {
            const cp = childProcess.spawn('dns-sd', ['-L', instance, '_http._tcp', 'local.']);
            let buf = '';
            let parsed: { target: string; port: number; } | undefined;
            cp.stdout.on('data', (d: Buffer) => {
                buf += d.toString('utf8');
                if (parsed) return;
                // Pentair\032-i\032-nmassol._http._tcp.local. can be reached at pentair.local.:6680 (interface 12)
                const m = buf.match(/can be reached at\s+(\S+):(\d+)/);
                if (m) {
                    parsed = { target: m[1].replace(/\.$/, ''), port: parseInt(m[2], 10) || 6680 };
                    try { cp.kill('SIGTERM'); } catch { /* */ }
                }
            });
            const t = setTimeout(() => { try { cp.kill('SIGTERM'); } catch { /* */ } }, Math.max(800, timeoutMs));
            cp.on('close', () => { clearTimeout(t); resolve(parsed); });
            cp.on('error', () => { clearTimeout(t); resolve(undefined); });
        });
    }

    /** Linux native browse via `avahi-browse -rtp _http._tcp` (parsable output). */
    private static searchViaAvahi(timeoutMs: number): Promise<OCPDiscoveryResult[]> {
        return new Promise<OCPDiscoveryResult[]>((resolve, reject) => {
            const cp = childProcess.spawn('avahi-browse', ['-rtp', '_http._tcp']);
            let buf = '';
            const results: OCPDiscoveryResult[] = [];
            cp.stdout.on('data', (d: Buffer) => { buf += d.toString('utf8'); });
            const t = setTimeout(() => { try { cp.kill('SIGTERM'); } catch { /* */ } }, Math.max(1500, timeoutMs));
            cp.on('error', (err) => { clearTimeout(t); reject(err); });
            cp.on('close', () => {
                clearTimeout(t);
                // Parsable format lines look like:
                //   =;eth0;IPv4;Pentair\032-i\032-nmassol;_http._tcp;local;pentair.local;10.0.0.111;6680;
                for (const line of buf.split('\n')) {
                    if (!line.startsWith('=')) continue;
                    const parts = line.split(';');
                    if (parts.length < 9) continue;
                    if (parts[2] !== 'IPv4') continue;
                    if (parts[4] !== '_http._tcp') continue;
                    const inst = parts[3].replace(/\\032/g, ' ');
                    if (inst.indexOf('Pentair') !== 0) continue;
                    const host = parts[6];
                    const ip = parts[7];
                    const port = parseInt(parts[8], 10) || 6680;
                    const alias = inst.replace(/^Pentair\s*-i\s*-n/, '');
                    results.push({ alias, host: ip || host, port, fqdn: host });
                }
                resolve(results);
            });
        });
    }

    /** Cross-platform fallback using the `multicast-dns` lib. Known to fail on macOS. */
    private static searchViaMulticastDns(timeoutMs: number): Promise<OCPDiscoveryResult[]> {
        return new Promise((resolve) => {
            const results = new Map<string, OCPDiscoveryResult>();
            let mdns: any;
            try { mdns = multicastdns({ loopback: true }); }
            catch (err) { logger.error(`IntelliCenterWS.searchViaMulticastDns: failed to start mdns: ${err.message}`); return resolve([]); }
            const finish = async () => {
                try { mdns.removeAllListeners(); mdns.destroy(); } catch { /* */ }
                // Resolve any entries with empty host via dns.lookup.
                const out: OCPDiscoveryResult[] = [];
                for (const r of results.values()) {
                    if (!r.host && r.fqdn) {
                        try { r.host = await IntelliCenterWSComms.dnsLookup4(r.fqdn); } catch { /* */ }
                    }
                    out.push(r);
                }
                resolve(out);
            };
            const timer = setTimeout(() => { finish(); }, timeoutMs);
            mdns.on('response', (resp: any) => {
                try {
                    const all = [...(resp.answers || []), ...(resp.additionals || [])];
                    const targets: string[] = [];
                    for (const a of all) {
                        if (a.type === 'PTR' && typeof a.name === 'string' && a.name.indexOf('_http._tcp') >= 0
                            && typeof a.data === 'string' && a.data.indexOf('Pentair') === 0) {
                            targets.push(a.data);
                        }
                    }
                    for (const target of targets) {
                        const alias = target.replace(/^Pentair\s*-i\s*-n/, '').replace(/\._http\._tcp\.local\.?$/, '');
                        const srv = all.find(a => a.type === 'SRV' && a.name === target);
                        let host = '';
                        let port = 6680;
                        let fqdn: string | undefined;
                        if (srv) {
                            port = srv.data?.port || 6680;
                            fqdn = srv.data?.target;
                            const aRec = all.find(a => a.type === 'A' && a.name === fqdn);
                            if (aRec) host = aRec.data;
                        }
                        results.set(target, { alias, host, port, fqdn });
                    }
                } catch (err) {
                    logger.silly(`IntelliCenterWS.searchViaMulticastDns: parse error: ${err.message}`);
                }
            });
            try {
                mdns.query({ questions: [{ name: '_http._tcp.local', type: 'PTR' }] });
            } catch (err) {
                clearTimeout(timer);
                logger.error(`IntelliCenterWS.searchViaMulticastDns: query error: ${err.message}`);
                finish();
            }
        });
    }

    /** dns.lookup wrapped as Promise. Goes through mDNSResponder on macOS for `*.local` names. */
    private static dnsLookup4(host: string): Promise<string> {
        return new Promise((resolve, reject) => {
            dns.lookup(host, { family: 4 }, (err, address) => {
                if (err) reject(err); else resolve(address);
            });
        });
    }

    /**
     * Light-weight liveness test against a candidate {host,port}. Opens a WS,
     * exchanges one GetParamList, closes, returns metadata or throws.
     */
    public static async testAsync(host: string, port: number = 6680, timeoutMs: number = 5000): Promise<{ ver?: string; ok: boolean; }> {
        if (!WebSocketCtor) throw new Error(`'ws' module not installed`);
        return new Promise((resolve, reject) => {
            const url = `ws://${host}:${port}/`;
            const ws: WSClientLike = new WebSocketCtor(url, { handshakeTimeout: timeoutMs, perMessageDeflate: false });
            const id = `njspc-test-${Date.now().toString(36)}`;
            const envelope = { command: 'GetParamList', messageID: id, objectList: [{ objnam: '_5451', keys: ['VER'] }] };
            const timer = setTimeout(() => { try { ws.terminate(); } catch { /* */ } reject(new Error('test timeout')); }, timeoutMs);
            ws.on('open', () => { try { ws.send(JSON.stringify(envelope)); } catch (e) { reject(e); } });
            ws.on('message', (raw: any) => {
                clearTimeout(timer);
                let msg: any;
                try { msg = JSON.parse(raw.toString('utf8')); } catch (e) { reject(e); return; }
                const ver = msg?.objectList?.[0]?.params?.VER;
                try { ws.close(1000); } catch { /* */ }
                resolve({ ver, ok: true });
            });
            ws.on('error', (err: any) => { clearTimeout(timer); reject(err); });
        });
    }

    public get stats(): any {
        const status = this.isOpen ? 'open' : (this.enabled ? 'closed' : 'disabled');
        return {
            status,
            host: this.host,
            port: this.port,
            alias: this.alias,
            isOpen: this.isOpen,
            enabled: this.enabled,
            pending: this._pending.size,
            subscriptions: {
                count: this._subscriptions.size,
                lastNotifyAt: this._lastNotifyAt || undefined,
                totalNotifications: this._totalNotifications,
            },
            lastError: this.lastError,
            counter: { ...this.counter },
            snapshot: {
                state: this.snapshotState,
                inProgress: this.snapshotInProgress,
                complete: this.snapshotComplete,
                progress: { ...this._snapshotProgress },
            },
        };
    }

    public emitStats(): void {
        try { webApp.emitToChannel('icwsStats', 'icwsStats', this.stats); } catch { /* */ }
    }

    private emitSnapshotProgress(collection: string, current: number, total: number): void {
        this._snapshotProgress = { collection, current, total };
        this.emitStats();
    }

    public async tryGetConfigurationAsync(): Promise<boolean> {
        try {
            const start = Date.now();
            const resp = await this.sendQuery('GetConfiguration');
            const elapsed = Date.now() - start;
            const answer = resp?.answer || resp?.objectList || [];
            logger.info(`IntelliCenterWS: GetConfiguration returned ${answer.length} objects in ${elapsed}ms`);
            if (!Array.isArray(answer) || answer.length < 10) {
                logger.info(`IntelliCenterWS: GetConfiguration response too small (${answer.length} objects), falling through to per-collection fetch.`);
                return false;
            }
            const typesReceived = new Set<string>();
            for (const obj of answer) {
                if (!obj.objnam || !obj.params) continue;
                this._snapshotObjnams.add(obj.objnam);
                if (obj.params?.OBJTYP) {
                    IntelliCenterWSController.registerObjnamType(obj.objnam, obj.params.OBJTYP);
                    typesReceived.add(obj.params.OBJTYP.toUpperCase());
                }
                IntelliCenterWSController.apply(obj.objnam, obj.params, obj.params?.OBJTYP);
            }
            const requiredTypes = ['BODY', 'CIRCUIT', 'SCHED', 'PUMP', 'HEATER', 'VALVE', 'CHEM', 'SENSE'];
            const missing = requiredTypes.filter(t => !typesReceived.has(t));
            if (missing.length > 0) {
                logger.info(`IntelliCenterWS: GetConfiguration missing types [${missing.join(', ')}], falling through to per-collection fetch.`);
                return false;
            }
            return true;
        } catch (err) {
            logger.info(`IntelliCenterWS: GetConfiguration failed (${err?.message || err}), falling through to per-collection fetch.`);
            return false;
        }
    }

    public async loadInitialConfigAsync(): Promise<void> {
        if (this.snapshotInProgress) {
            logger.warn('IntelliCenterWS: snapshot already in progress; skipping.');
            return;
        }
        this.snapshotInProgress = true;
        this.snapshotComplete = false;
        this.snapshotState = 'loading';
        this._snapshotObjnams.clear();
        this.emitSnapshotProgress('starting', 0, 0);
        logger.info('IntelliCenterWS: starting initial config snapshot from OCP...');
        try {
            await this.fetchSystemAsync();
            const gotFullConfig = await this.tryGetConfigurationAsync();
            if (!gotFullConfig) {
                const collections = [
                    'BODY', 'CIRCUIT', 'SCHED', 'PUMP', 'HEATER',
                    'VALVE', 'CHEM', 'REMOTE', 'SENSE', 'EXTINSTR',
                ];
                const totalCollections = collections.length;
                for (let i = 0; i < collections.length; i++) {
                    const col = collections[i];
                    this.emitSnapshotProgress(col, i + 1, totalCollections);
                    try {
                        await this.fetchCollectionAsync(col);
                    } catch (err) {
                        logger.warn(`IntelliCenterWS: fetchCollection(${col}) failed: ${err?.message || err}`);
                    }
                }
            }
            this.pruneOrphanedItems();
            this.runPostSnapshotFinalizers();
            this.snapshotState = 'complete';
            this.snapshotComplete = true;
            this.snapshotInProgress = false;
            this.emitSnapshotProgress('complete', gotFullConfig ? 1 : 10, gotFullConfig ? 1 : 10);
            logger.info(`IntelliCenterWS: initial config snapshot complete (method=${gotFullConfig ? 'GetConfiguration' : 'per-collection'}).`);
            state.equipment.model = sys.equipment.model;
            state.equipment.controllerType = sys.controllerType;
            state.equipment.shared = sys.equipment.shared;
            state.equipment.single = sys.equipment.single;
            state.equipment.maxBodies = sys.equipment.maxBodies;
            state.equipment.maxCircuits = sys.equipment.maxCircuits;
            state.mode = 0;
            state.status = 1;
            state.emitControllerChange();
            state.emitEquipmentChanges();
            await this.subscribeAllAsync();
            this.startAlertPolling();
            this.startKeepalive();
        } catch (err) {
            this.snapshotState = 'failed';
            this.snapshotInProgress = false;
            this.lastError = `Snapshot failed: ${err?.message || err}`;
            this.emitSnapshotProgress('failed', 0, 0);
            logger.error(`IntelliCenterWS: snapshot failed: ${err?.message || err}`);
        }
    }

    private async fetchSystemAsync(): Promise<void> {
        try {
            const resp = await this.getParamList('_5451', [
                'PROPNAME', 'NAME', 'EMAIL', 'EMAIL2', 'PHONE', 'PHONE2',
                'ADDRESS', 'CITY', 'STATE', 'ZIP', 'COUNTRY', 'LOCX', 'LOCY',
                'TIMZON', 'MODE', 'MANHT', 'VER', 'HNAME', 'SASHP', 'FREEZEDLY', 'VALVE', 'HEATING',
            ]);
            if (resp?.objectList?.[0]?.params) {
                const p = resp.objectList[0].params;
                IntelliCenterWSController.apply('_5451', p);
                const vp = p['VALVE'];
                if (typeof vp !== 'undefined') this._pendingValveDiverted = vp === 'ON' || vp === '1' || vp === 'on';
            }
            await this.subscribe('_5451', ['VALVE', 'HEATING', 'VER', 'SERVICE']);
        } catch (err) {
            logger.warn(`IntelliCenterWS: fetchSystemAsync failed: ${err?.message || err}`);
        }
        try {
            const cfeaResp = await this.getParamList('_CFEA', ['MANOVR']);
            if (cfeaResp?.objectList?.[0]?.params) {
                IntelliCenterWSController.apply('_CFEA', cfeaResp.objectList[0].params);
            }
            await this.subscribe('_CFEA', ['MANOVR']);
        } catch (err) {
            logger.debug(`IntelliCenterWS: feature options fetch failed: ${err?.message || err}`);
        }
        try {
            const clockResp = await this.getParamList('_C10C', ['CLK24A', 'DLSTIM', 'SOURCE']);
            if (clockResp?.objectList?.[0]?.params) {
                IntelliCenterWSController.apply('_C10C', clockResp.objectList[0].params);
            }
        } catch (err) {
            logger.debug(`IntelliCenterWS: clock fetch failed: ${err?.message || err}`);
        }
        try {
            const modResp = await this.getParamList('M0101', ['VER', 'SUBTYP']);
            if (modResp?.objectList?.[0]?.params) {
                IntelliCenterWSController.apply('M0101', modResp.objectList[0].params, 'MODULE');
            }
        } catch (err) {
            logger.debug(`IntelliCenterWS: module fetch failed: ${err?.message || err}`);
        }
    }

    private async fetchCollectionAsync(collection: string): Promise<void> {
        const allObjects = await this.enumerateAll(['OBJNAM', 'OBJTYP', 'SNAME', 'SUBTYP', 'PARENT']);
        for (const o of allObjects) {
            if (o.objnam) this._snapshotObjnams.add(o.objnam);
            if (o.objnam && o.params?.OBJTYP) IntelliCenterWSController.registerObjnamType(o.objnam, o.params.OBJTYP);
        }
        const matching = allObjects.filter(o => {
            const otyp = (o.params?.OBJTYP || '').toUpperCase();
            if (otyp === collection) return true;
            if (collection === 'CIRCUIT' && (otyp === 'CIRCUIT' || otyp === 'FEATR' || otyp === 'CIRCGRP' || otyp === 'LITSHO')) return true;
            if (collection === 'CHEM' && (otyp === 'CHEM' || otyp === 'CHLOR')) return true;
            if (collection === 'EXTINSTR' && otyp === 'EXTINSTR') return true;
            return false;
        });
        const childTypes = new Set(['PMPCIRC', 'CIRCGRP', 'REMBTN']);
        const children = allObjects.filter(o => {
            const otyp = (o.params?.OBJTYP || '').toUpperCase();
            if (!childTypes.has(otyp)) return false;
            const parent = (o.params?.PARENT || '').toUpperCase();
            return matching.some(m => m.objnam && m.objnam.toUpperCase() === parent);
        });
        const toFetch = [...matching, ...children];
        for (const obj of toFetch) {
            const on = obj.objnam;
            if (!on) continue;
            try {
                const sub = (obj.params?.SUBTYP || '').toUpperCase();
                const effectiveType = (sub === 'ICHLOR' || on.toUpperCase().startsWith('CHR')) ? 'CHLOR' : (obj.params?.OBJTYP || '');
                const keys = this.getKeysForObjtyp(effectiveType);
                if (keys.length === 0) {
                    if (obj.params) IntelliCenterWSController.apply(on, obj.params);
                    continue;
                }
                const resp = await this.getParamList(on, keys);
                if (resp?.objectList?.[0]?.params) {
                    const merged = { ...obj.params, ...resp.objectList[0].params };
                    IntelliCenterWSController.apply(on, merged, obj.params?.OBJTYP);
                }
            } catch (err) {
                logger.debug(`IntelliCenterWS: fetchObject(${on}) failed: ${err?.message || err}`);
                if (obj.params) IntelliCenterWSController.apply(on, obj.params);
            }
        }
    }

    private getKeysForObjtyp(objtyp: string): string[] {
        const t = (objtyp || '').toUpperCase();
        switch (t) {
            case 'CIRCUIT':
            case 'FEATR':
            case 'LITSHO':
            case 'CIRCGRP':
                return ['SNAME', 'SUBTYP', 'STATUS', 'FREEZE', 'FEATR', 'TIME', 'DNTSTP', 'USE', 'ACT'];
            case 'BODY':
                return ['SNAME', 'SUBTYP', 'STATUS', 'TEMP', 'LOTMP', 'HITMP', 'HTMODE', 'MODE', 'HTSRC', 'VOL'];
            case 'SCHED':
                return ['CIRCUIT', 'DAY', 'TIME', 'TIMOUT', 'START', 'STOP', 'MODE', 'STATUS', 'SINGLE', 'HEATER', 'LOTMP', 'COOLING', 'ACT', 'VACFLO', 'UPDATE'];
            case 'PUMP':
                return ['SNAME', 'SUBTYP', 'STATUS', 'RPM', 'GPM', 'PWR', 'MIN', 'MAX', 'MINF', 'MAXF', 'SETTMP', 'SETTMPNC', 'PRIMFLO', 'PRIMTIM', 'COMUART', 'BODY'];
            case 'PMPCIRC':
                return ['CIRCUIT', 'SPEED', 'SELECT', 'BODY', 'PARENT', 'INDEX'];
            case 'HEATER':
                return ['SNAME', 'SUBTYP', 'BODY', 'STATUS', 'COOL', 'DLY', 'BOOST', 'COMUART'];
            case 'VALVE':
                return ['SNAME', 'CIRCUIT', 'ASSIGN', 'POSIT'];
            case 'CHEM':
                return ['SNAME', 'SUBTYP', 'BODY', 'PHSET', 'PHVAL', 'ORPSET', 'ORPVAL', 'SINDEX', 'ALK', 'CALC', 'CYACID', 'TEMP'];
            case 'CHLOR':
                return ['SNAME', 'SUBTYP', 'PRIM', 'SEC', 'SUPER', 'TIMOUT', 'SALT', 'BODY'];
            case 'EXTINSTR':
                return ['SNAME', 'SUBTYP', 'BODY', 'STATUS'];
            case 'REMOTE':
                return ['SNAME', 'SUBTYP'];
            case 'REMBTN':
                return ['CIRCUIT', 'PARENT', 'INDEX'];
            case 'SENSE':
                return ['SUBTYP', 'PROBE', 'SOURCE', 'CALIB'];
            case 'CIRCGRP':
                return ['CIRCUIT', 'DLY', 'STATUS', 'PARENT', 'INDEX'];
            case 'MODULE':
                return ['VER', 'SUBTYP'];
            case 'PERMIT':
                return ['SNAME', 'PASSWRD', 'TIMOUT', 'ENABLE', 'SHOMNU'];
            case 'SYSTEM':
                return ['VALVE', 'HEATING', 'VER', 'SERVICE', 'VACFLO', 'VACTIM', 'START', 'STOP'];
            default:
                return [];
        }
    }

    private pruneOrphanedItems(): void {
        if (this._snapshotObjnams.size === 0) return;
        const collections: Array<{ name: string; sysColl: any; stateColl?: any }> = [
            { name: 'schedule', sysColl: sys.schedules, stateColl: state.schedules },
            { name: 'circuit', sysColl: sys.circuits, stateColl: state.circuits },
            { name: 'feature', sysColl: sys.features, stateColl: state.features },
            { name: 'pump', sysColl: sys.pumps, stateColl: state.pumps },
            { name: 'heater', sysColl: sys.heaters, stateColl: state.heaters },
            { name: 'valve', sysColl: sys.valves, stateColl: state.valves },
            { name: 'chlorinator', sysColl: sys.chlorinators, stateColl: state.chlorinators },
            { name: 'chemController', sysColl: sys.chemControllers, stateColl: state.chemControllers },
            { name: 'cover', sysColl: sys.covers, stateColl: state.covers },
            { name: 'remote', sysColl: sys.remotes },
            { name: 'circuitGroup', sysColl: sys.circuitGroups, stateColl: state.circuitGroups },
            { name: 'lightGroup', sysColl: sys.lightGroups, stateColl: state.lightGroups },
        ];
        let totalPruned = 0;
        for (const { name, sysColl, stateColl } of collections) {
            for (let i = sysColl.length - 1; i >= 0; i--) {
                const item = sysColl.getItemByIndex(i);
                const shouldPrune = item.objnam
                    ? !this._snapshotObjnams.has(item.objnam)
                    : item.isActive;
                if (shouldPrune) {
                    logger.info(`IntelliCenterWS: pruning orphaned ${name} id=${item.id} objnam=${item.objnam || '(none)'} name="${item.name || ''}"`);
                    if (stateColl) {
                        const sItem = stateColl.getItemById(item.id);
                        sItem.isActive = false;
                        item.isActive = false;
                        sItem.emitEquipmentChange();
                        stateColl.removeItemById(item.id);
                    } else {
                        item.isActive = false;
                    }
                    sysColl.removeItemById(item.id);
                    totalPruned++;
                }
            }
        }
        if (totalPruned > 0) logger.info(`IntelliCenterWS: pruned ${totalPruned} orphaned item(s) not reported by OCP.`);
    }

    private runPostSnapshotFinalizers(): void {
        try {
            const bodyCount = sys.bodies.length;
            sys.equipment.maxBodies = bodyCount;
            sys.equipment.shared = bodyCount >= 2;
            sys.equipment.single = bodyCount < 2;
            sys.equipment.dual = false;
            sys.equipment.maxCircuits = sys.circuits.length;
            sys.equipment.maxValves = sys.valves.length;
            sys.equipment.maxSchedules = Math.max(sys.schedules.length, 12);
            sys.equipment.maxPumps = 16;
            sys.equipment.maxFeatures = 32;
            sys.equipment.maxHeaters = 16;
            sys.equipment.maxLightGroups = 40;
            sys.equipment.maxCircuitGroups = 16;
            if (sys.equipment.shared) sys.board.equipmentIds.circuits.start = 1;
        } catch (err) {
            logger.debug(`IntelliCenterWS: equipment finalization failed: ${err?.message || err}`);
        }
        try { sys.board.heaters.updateHeaterServices(); } catch (err) {
            logger.debug(`IntelliCenterWS: updateHeaterServices failed: ${err?.message || err}`);
        }
        if (typeof this._pendingValveDiverted !== 'undefined') {
            IntelliCenterWSController.syncValveStatesWS();
            this._pendingValveDiverted = undefined;
        }
        for (let i = 0; i < sys.bodies.length; i++) {
            const body = sys.bodies.getItemByIndex(i);
            const sbody = state.temps.bodies.getItemById(body.id);
            if (sbody) {
                if (sbody.type === 0) { sbody.circuit = 6; body.circuit = 6; }
                else if (sbody.type === 1) { sbody.circuit = 1; body.circuit = 1; }
            }
        }
        sys.board.circuits.syncVirtualCircuitStates();
        for (let i = 0; i < sys.bodies.length; i++) {
            const body = sys.bodies.getItemByIndex(i);
            const sbody = state.temps.bodies.getItemById(body.id);
            if (sbody && typeof body.heatMode !== 'undefined') {
                logger.debug(`postSnapshot body ${body.id}: applying heatMode=${body.heatMode} (state was ${sbody.heatMode})`);
                sbody.heatMode = body.heatMode;
                logger.debug(`postSnapshot body ${body.id}: state heatMode now=${sbody.heatMode}`);
            }
        }
        sys.equipment.setEquipmentIds();
        try { finalizeGroupMembersWS(); } catch (err) {
            logger.debug(`IntelliCenterWS: finalizeGroupMembersWS failed: ${err?.message || err}`);
        }
    }

    public async subscribeAllAsync(): Promise<void> {
        try {
            const allObjects = await this.enumerateAll(['OBJNAM', 'OBJTYP', 'SUBTYP']);
            const batchList: Array<{ objnam: string; keys: string[] }> = [];
            for (const obj of allObjects) {
                const on = obj.objnam;
                const typ = (obj.params?.OBJTYP || '').toUpperCase();
                const keys = this.getSubscriptionKeysForObject(on, typ, obj.params?.SUBTYP);
                if (on && keys.length > 0) {
                    batchList.push({ objnam: on, keys });
                    this._subscriptions.set(on, { objnam: on, keys: [...keys] });
                }
            }
            batchList.push({ objnam: '_5451', keys: ['MODE', 'AVAIL', 'TEMPNC', 'VACFLO', 'VACTIM', 'START', 'STOP', 'HEATING', 'VALVE', 'TIMZON', 'SERVICE', 'VER', 'PROPNAME', 'UPDATE', 'IN', 'PROGRESS', 'AUTO'] });
            this._subscriptions.set('_5451', { objnam: '_5451', keys: ['MODE', 'AVAIL', 'TEMPNC', 'VACFLO', 'VACTIM', 'START', 'STOP', 'HEATING', 'VALVE', 'TIMZON', 'SERVICE', 'VER', 'PROPNAME', 'UPDATE', 'IN', 'PROGRESS', 'AUTO'] });
            batchList.push({ objnam: '_CFEA', keys: ['MANOVR'] });
            this._subscriptions.set('_CFEA', { objnam: '_CFEA', keys: ['MANOVR'] });
            batchList.push({ objnam: 'UFFFE', keys: ['ENABLE', 'OBJTYP', 'PASSWRD', 'SHOMNU'] });
            this._subscriptions.set('UFFFE', { objnam: 'UFFFE', keys: ['ENABLE', 'OBJTYP', 'PASSWRD', 'SHOMNU'] });
            const BATCH_SIZE = 20;
            for (let i = 0; i < batchList.length; i += BATCH_SIZE) {
                const batch = batchList.slice(i, i + BATCH_SIZE);
                await this.request({ command: 'RequestParamList', objectList: batch });
            }
            logger.info(`IntelliCenterWS: subscribed to ${this._subscriptions.size} objects for live updates.`);
        } catch (err) {
            logger.warn(`IntelliCenterWS: subscribeAllAsync failed: ${err?.message || err}`);
        }
    }

    private getSubscriptionKeysForObject(objnam: string, objtyp: string, subtyp?: string): string[] {
        const typ = (objtyp || '').toUpperCase();
        switch (typ) {
            case 'CIRCUIT':
            case 'FEATR':
                return ['STATUS', 'SNAME', 'FEATR', 'FREEZE', 'DNTSTP', 'TIME', 'MODE', 'LISTORD', 'USAGE', 'LIMIT', 'USE', 'OBJLIST', 'SWIM', 'SYNC', 'SET'];
            case 'CIRCGRP':
            case 'LITSHO':
                return ['STATUS', 'MODE', 'LISTORD', 'USAGE', 'FREEZE', 'LIMIT', 'USE', 'MANUAL', 'FEATR', 'DNTSTP', 'CHILD', 'HNAME', 'SNAME', 'TIME'];
            case 'BODY':
                return ['SNAME', 'FILTER', 'LOTMP', 'TEMP', 'HITMP', 'HTSRC', 'LISTORD', 'STATUS', 'LSTTMP', 'HTMODE', 'HEATER', 'MANUAL', 'HNAME', 'MANHT', 'VOL', 'SETTMP', 'BOOST'];
            case 'HEATER':
                return ['LISTORD', 'PARENT', 'BODY', 'SHARE', 'SNAME', 'HNAME', 'RLY', 'DLY', 'COMUART', 'START', 'STOP', 'STATUS', 'PERMIT', 'SHOMNU', 'COOL', 'ACT', 'HTMODE', 'TIME', 'BOOST', 'READY'];
            case 'PUMP':
                return ['STATUS', 'RPM', 'GPM', 'PWR', 'SNAME', 'SUBTYP', 'PRIMFLO', 'PRIMTIM', 'MIN', 'MAX', 'MINF', 'MAXF', 'SETTMP', 'SETTMPNC', 'COMUART'];
            case 'PMPCIRC':
                return ['CIRCUIT', 'SELECT'];
            case 'SCHED':
                return ['CIRCUIT', 'DAY', 'TIME', 'TIMOUT', 'START', 'STOP', 'MODE', 'STATUS', 'ACT', 'VACFLO', 'UPDATE'];
            case 'VALVE':
                return ['CIRCUIT', 'ASSIGN', 'POSIT', 'SNAME'];
            case 'CHEM':
                return ['SNAME', 'LISTORD', 'BODY', 'PHSET', 'PHVAL', 'ORPSET', 'ORPVAL', 'SINDEX', 'PRIM', 'SEC', 'PHTNK', 'ORPTNK', 'ALK', 'CALC', 'CYACID', 'SUPER', 'PUMP', 'SUBTYP'];
            case 'CHLOR':
                return ['PRIM', 'SEC', 'SUPER', 'TIMOUT', 'SALT', 'SNAME'];
            case 'SENSE':
                return ['SOURCE', 'PROBE', 'CALIB'];
            case 'EXTINSTR':
                return ['SNAME', 'HNAME', 'OBJNAM', 'OBJTYP', 'SUBTYP', 'PARENT', 'STATUS', 'NORMAL', 'POSIT'];
            case 'MODULE':
                return ['OBJNAM', 'OBJTYP', 'PARENT', 'PORT', 'SNAME', 'STATIC', 'SUBTYP', 'VER'];
            default:
                return this.getKeysForObjtyp(typ);
        }
    }

    public async fetchActiveAlerts(): Promise<void> {
        if (!this.isOpen || this.snapshotInProgress) return;
        try {
            const resp = await this.sendQuery('GETACTIVESTATUSMESSAGES');
            const alerts: Array<{ objnam: string; params: Record<string, string> }> = resp?.answer || [];
            const activeCodes: Set<string> = new Set();
            for (const alert of alerts) {
                if (!alert.params || alert.params.OBJTYP !== 'STATUS') continue;
                const parent = alert.params.PARENT || '';
                const sname = alert.params.SNAME || '';
                const code = this.alertParentToCode(parent);
                if (!code) continue;
                activeCodes.add(code);
                const exists = state.equipment.messages.exists((m: any) => m.code === code);
                if (!exists) {
                    state.equipment.messages.setMessageByCode(code, 'error', sname);
                }
            }
            const existing = state.equipment.messages.get(true) || [];
            for (const msg of existing) {
                if (msg.code && msg.code.endsWith(':comms') && !activeCodes.has(msg.code)) {
                    state.equipment.messages.removeItemByCode(msg.code);
                }
            }
        } catch (err) {
            logger.debug(`IntelliCenterWS: fetchActiveAlerts failed: ${err?.message || err}`);
        }
    }

    private sendQuery(queryName: string, params?: Record<string, string>): Promise<any> {
        if (!this.isOpen || !this._client) return Promise.reject(new Error('not connected'));
        return new Promise<any>((resolve, reject) => {
            const id = this.nextMessageId();
            const envelope = JSON.stringify({ command: 'GETQUERY', messageID: id, queryName, arguments: [''], ...params });
            const timeout = setTimeout(() => {
                this.removeListener('frame', handler);
                reject(new Error(`GetQuery '${queryName}' timed out`));
            }, 10000);
            const handler = (msg: any) => {
                if (msg?.command === 'SendQuery' && msg?.queryName === queryName) {
                    clearTimeout(timeout);
                    this.removeListener('frame', handler);
                    resolve(msg);
                } else if (msg?.command === 'Error') {
                    clearTimeout(timeout);
                    this.removeListener('frame', handler);
                    reject(new Error(`GetQuery '${queryName}' rejected: ${JSON.stringify(msg).slice(0, 300)}`));
                }
            };
            this.on('frame', handler);
            this._client!.send(envelope);
            this.counter.requests++;
            this.counter.framesOut++;
            this.counter.bytesSent += Buffer.byteLength(envelope, 'utf8');
        });
    }

    private alertParentToCode(parent: string): string | undefined {
        const upper = (parent || '').toUpperCase();
        if (upper.startsWith('PMP')) {
            const id = parseInt(upper.slice(3), 10);
            return id > 0 ? `pump:${id}:comms` : undefined;
        }
        if (upper.startsWith('H00') || upper.startsWith('H0')) {
            const id = parseInt(upper.slice(1), 10);
            return id > 0 ? `heater:${id}:comms` : undefined;
        }
        if (upper.startsWith('CHM') || upper.startsWith('CHL')) {
            const id = parseInt(upper.slice(3), 10) || 1;
            return `chlorinator:${id}:comms`;
        }
        return `ws:${parent.toLowerCase()}:comms`;
    }

    public startKeepalive(intervalMs: number = 7870): void {
        this.stopKeepalive();
        this._keepaliveMissCount = 0;
        this._keepaliveTimer = setInterval(async () => {
            if (!this.isOpen) return;
            try {
                const resp = await this.getParamList('_C10C', ['CLK24A']);
                this._keepaliveMissCount = 0;
                if (resp?.objectList?.[0]?.params) {
                    IntelliCenterWSController.apply('_C10C', resp.objectList[0].params);
                }
            } catch (err) {
                this._keepaliveMissCount++;
                logger.debug(`IntelliCenterWS: keepalive miss #${this._keepaliveMissCount}: ${err?.message || err}`);
                if (this._keepaliveMissCount >= 3) {
                    logger.warn(`IntelliCenterWS: 3 consecutive keepalive misses — triggering reconnect.`);
                    this._keepaliveMissCount = 0;
                    this.stopKeepalive();
                    try { if (this._client) this._client.close(4001, 'keepalive timeout'); } catch { /* */ }
                }
            }
        }, intervalMs);
        logger.info(`IntelliCenterWS: keepalive started (interval=${intervalMs}ms).`);
    }

    public stopKeepalive(): void {
        if (this._keepaliveTimer) {
            clearInterval(this._keepaliveTimer);
            this._keepaliveTimer = undefined;
        }
    }

    public startAlertPolling(intervalMs: number = 30000): void {
        if (this._alertPollTimer) clearInterval(this._alertPollTimer);
        this._alertPollTimer = setInterval(() => {
            this.fetchActiveAlerts().catch(e =>
                logger.debug(`IntelliCenterWS: alert poll error: ${e?.message || e}`));
        }, intervalMs);
        this.fetchActiveAlerts().catch(e =>
            logger.debug(`IntelliCenterWS: initial alert fetch error: ${e?.message || e}`));
    }

    public static buildCondition(filters: Array<{ key: string; op: '=' | '!' | '*'; value: string }>, logic: '&' | '|' = '&'): string {
        return filters.map(f => `${f.key}${f.op}${f.value}`).join(` ${logic} `);
    }

    public static buildConditionGroup(groups: string[], logic: '&' | '|' = '&'): string {
        if (groups.length === 1) return groups[0];
        return groups.map(g => g.includes(' ') ? `(${g})` : g).join(` ${logic} `);
    }

    public toLog(msg: any): string {
        const ts = Timestamp.toISOLocal(new Date());
        const cmd = msg?.command;
        const id = msg?.messageID;
        const _id = Message.nextMessageId;
        return `{"protocol":"icws","_id":${_id},"command":"${cmd}","messageID":"${id}","ts":"${ts}"}`;
    }
}

export const icws: IntelliCenterWSComms = new IntelliCenterWSComms();
