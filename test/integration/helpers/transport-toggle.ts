import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'config.json');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'test', 'integration', 'reports', '_config_backups');

export type TransportMode = 'rs485' | 'ocpws';

export function switchTransport(mode: TransportMode): void {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  config.controller.comms.type = mode;
  if (mode === 'ocpws') {
    config.controller.comms.enabled = true;
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getCurrentTransport(): TransportMode {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  return config.controller.comms.type as TransportMode;
}

export function wipePoolData(): void {
  const files = ['poolConfig.json', 'poolState.json'];
  for (const file of files) {
    const filepath = path.join(DATA_DIR, file);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
}

export function backupPoolData(label: string): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const files = ['poolConfig.json', 'poolState.json'];
  for (const file of files) {
    const src = path.join(DATA_DIR, file);
    if (fs.existsSync(src)) {
      const dest = path.join(BACKUP_DIR, `${label}_${file}`);
      fs.copyFileSync(src, dest);
    }
  }
}

export function restorePoolData(label: string): void {
  const files = ['poolConfig.json', 'poolState.json'];
  for (const file of files) {
    const src = path.join(BACKUP_DIR, `${label}_${file}`);
    if (fs.existsSync(src)) {
      const dest = path.join(DATA_DIR, file);
      fs.copyFileSync(src, dest);
    }
  }
}

export function backupConfig(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  fs.copyFileSync(CONFIG_PATH, path.join(BACKUP_DIR, 'config.json.bak'));
}

export function restoreConfig(): void {
  const bak = path.join(BACKUP_DIR, 'config.json.bak');
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, CONFIG_PATH);
  }
}
