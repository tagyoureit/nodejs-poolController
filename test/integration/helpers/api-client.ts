import * as http from 'http';

export interface ApiClientConfig {
  host: string;
  port: number;
}

export class ApiClient {
  private host: string;
  private port: number;

  constructor(config: ApiClientConfig = { host: '127.0.0.1', port: 4200 }) {
    this.host = config.host;
    this.port = config.port;
  }

  async get(path: string): Promise<any> {
    return this.request('GET', path);
  }

  async put(path: string, body?: any): Promise<any> {
    return this.request('PUT', path, body);
  }

  async delete(path: string, body?: any): Promise<any> {
    return this.request('DELETE', path, body);
  }

  async waitForReady(timeoutMs: number = 90_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const status = await this.get('/state/status');
        if (status && status.val !== undefined && status.val !== 0) {
          return true;
        }
      } catch {
        // not ready yet
      }
      await sleep(2000);
    }
    return false;
  }

  private request(method: string, path: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: this.host,
        port: this.port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: 15_000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
