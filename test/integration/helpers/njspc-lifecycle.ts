import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import { ApiClient } from './api-client';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

let njspcProcess: ChildProcess | null = null;

function killExistingOnPort(port: number): void {
  try {
    const output = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim();
    if (output) {
      for (const pid of output.split('\n')) {
        try { process.kill(parseInt(pid, 10), 'SIGTERM'); } catch {}
      }
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try {
          const check = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim();
          if (!check) break;
        } catch { break; }
        execSync('sleep 0.5');
      }
    }
  } catch {}
}

export async function startNjsPC(): Promise<void> {
  if (njspcProcess) {
    await stopNjsPC();
  }
  killExistingOnPort(4200);

  return new Promise((resolve, reject) => {
    const distApp = path.join(PROJECT_ROOT, 'dist', 'app.js');
    njspcProcess = spawn('node', [distApp], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let started = false;

    njspcProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (!started && (output.includes('Server is now listening') || output.includes('listening on'))) {
        started = true;
        resolve();
      }
    });

    njspcProcess.stderr?.on('data', (data) => {
      // log but don't reject unless we haven't started
    });

    njspcProcess.on('error', (err) => {
      if (!started) reject(err);
    });

    njspcProcess.on('exit', (code) => {
      njspcProcess = null;
      if (!started) reject(new Error(`njsPC exited with code ${code} before starting`));
    });

    setTimeout(() => {
      if (!started) {
        started = true;
        resolve(); // assume started even without log signal
      }
    }, 10_000);
  });
}

export async function stopNjsPC(): Promise<void> {
  if (njspcProcess) {
    const proc = njspcProcess;
    njspcProcess = null;
    proc.kill('SIGTERM');
    await sleep(2000);
    try { proc.kill('SIGKILL'); } catch {}
    await sleep(1000);
  }
  killExistingOnPort(4200);
  await sleep(500);
}

export async function restartNjsPC(api: ApiClient, waitTimeoutMs = 90_000): Promise<boolean> {
  await stopNjsPC();
  await sleep(2000);
  await startNjsPC();
  await sleep(3000);
  return api.waitForReady(waitTimeoutMs);
}

export function isRunning(): boolean {
  return njspcProcess !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
