import WebSocket = require('ws');

export interface OCPClientConfig {
  host: string;
  port: number;
  timeoutMs?: number;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

export class OCPVerificationClient {
  private ws: WebSocket | null = null;
  private config: OCPClientConfig;
  private messageId = 0;
  private pending: Map<string, PendingRequest> = new Map();

  constructor(config: OCPClientConfig = { host: '10.0.0.111', port: 6680, timeoutMs: 8000 }) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.config.host}:${this.config.port}`;
      this.ws = new WebSocket(url);

      const timer = setTimeout(() => {
        reject(new Error(`OCP WS connect timeout: ${url}`));
      }, this.config.timeoutMs || 8000);

      this.ws.on('open', () => {
        clearTimeout(timer);
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      this.ws.on('close', () => {
        this.ws = null;
        for (const [id, req] of this.pending) {
          clearTimeout(req.timer);
          req.reject(new Error('WS closed'));
        }
        this.pending.clear();
      });
    });
  }

  async getParam(objnam: string, keys: string[]): Promise<Record<string, string>> {
    const msgId = this.nextId();
    const request = {
      messageID: msgId,
      command: 'GetParamList',
      condition: `OBJNAM=${objnam}`,
      objectList: [{ objnam, keys }],
    };
    const response = await this.sendAndWait(msgId, request);
    if (response?.objectList?.length > 0) {
      return response.objectList[0].params || {};
    }
    return {};
  }

  async getParamByType(objtyp: string, keys: string[]): Promise<any[]> {
    const msgId = this.nextId();
    const request = {
      messageID: msgId,
      command: 'GetParamList',
      condition: `OBJTYP=${objtyp}`,
      objectList: [{ objnam: 'ALL', keys }],
    };
    const response = await this.sendAndWait(msgId, request);
    return response?.objectList || [];
  }

  async setParam(objnam: string, params: Record<string, string>): Promise<boolean> {
    const msgId = this.nextId();
    const request = {
      messageID: msgId,
      command: 'SetParamList',
      objectList: [{ objnam, params }],
    };
    const response = await this.sendAndWait(msgId, request);
    return response?.response === '200';
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  private nextId(): string {
    return `test-${++this.messageId}-${Date.now()}`;
  }

  private sendAndWait(msgId: string, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        reject(new Error('WS not connected'));
        return;
      }

      const timer = setTimeout(() => {
        this.pending.delete(msgId);
        reject(new Error(`OCP request timeout: ${request.command} ${msgId}`));
      }, this.config.timeoutMs || 8000);

      this.pending.set(msgId, { resolve, reject, timer });
      this.ws.send(JSON.stringify(request));
    });
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      const msgId = msg.messageID;
      if (msgId && this.pending.has(msgId)) {
        const req = this.pending.get(msgId)!;
        clearTimeout(req.timer);
        this.pending.delete(msgId);
        req.resolve(msg);
      }
    } catch {
      // ignore non-JSON or unsolicited messages
    }
  }
}
