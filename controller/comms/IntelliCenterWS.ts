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
        | 'ReleaseParamList' | 'ClearParam' | 'SendQuery' | 'SetCommand' | 'GetObject';
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
                    // Re-issue any pre-existing subscriptions.
                    this.resubscribeAll().catch(e =>
                        logger.error(`IntelliCenterWS: resubscribe error: ${e.message}`));
                    settle(true);
                });
                ws.on('message', (raw: any) => this.onMessage(raw));
                ws.on('error', (err: any) => {
                    this.counter.errors++;
                    this.lastError = err?.message || String(err);
                    logger.error(`IntelliCenterWS: socket error: ${this.lastError}`);
                    this.emit('error', err);
                    this.emitStats();
                });
                ws.on('close', (code: number, reason: any) => {
                    const wasOpen = this.isOpen;
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
        } else {
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
            subscriptions: this._subscriptions.size,
            lastError: this.lastError,
            counter: { ...this.counter },
        };
    }

    public emitStats(): void {
        try { webApp.emitToChannel('icwsStats', 'icwsStats', this.stats); } catch { /* */ }
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
