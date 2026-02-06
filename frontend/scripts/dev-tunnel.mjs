import { spawnSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

function findCloudflared() {
  if (process.env.CLOUDFLARED_PATH && fs.existsSync(process.env.CLOUDFLARED_PATH)) {
    return process.env.CLOUDFLARED_PATH;
  }

  const isWin = process.platform === 'win32';
  const which = isWin ? 'where' : 'which';

  const r = spawnSync(which, ['cloudflared'], { encoding: 'utf8' });

  if (r.status === 0) {
    const p = r.stdout.split(/\r?\n/).find(Boolean);
    if (p && fs.existsSync(p.trim())) return p.trim();
  }

  if (isWin) {
    const guesses = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Cloudflare', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Cloudflare', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey', 'bin', 'cloudflared.exe'),
    ];

    for (const g of guesses) {
      if (fs.existsSync(g)) return g;
    }
  }

  return null;
}

function findConfig() {
  const list = [
    path.join(process.cwd(), 'cloudflared', 'config-fe.yml'),
    path.join(os.homedir(), '.cloudflared', 'config-fe.yml'),
  ];

  return list.find(p => fs.existsSync(p)) || null;
}

const bin = findCloudflared();

if (!bin) {
  console.error(`
❌ cloudflared не найден

Установи:
winget install Cloudflare.cloudflared

Или укажи путь:
setx CLOUDFLARED_PATH "C:\\path\\cloudflared.exe"
`);
  process.exit(1);
}

const cfg = findConfig();

if (!cfg) {
  console.error('❌ Не найден config-fe.yml');
  process.exit(1);
}

console.log('▶ cloudflared:', bin);
console.log('▶ config:', cfg);

const p = spawn(bin, ['tunnel', '--config', cfg, 'run'], {
  stdio: 'inherit',
});

p.on('exit', code => process.exit(code ?? 0));
