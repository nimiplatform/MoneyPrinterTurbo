import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const toolsRoot = path.join(root, '.nimi/local/python-tools');
const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
export const mediaUv = path.join(toolsRoot, bin, process.platform === 'win32' ? 'uv.exe' : 'uv');
const python = path.join(toolsRoot, bin, process.platform === 'win32' ? 'python.exe' : 'python');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Media dependency setup failed (${result.status})`);
}

export function setupMedia() {
  if (!existsSync(mediaUv)) {
    run('python', ['-m', 'venv', toolsRoot]);
    run(python, ['-m', 'pip', 'install', 'uv==0.12.22']);
  }
  run(mediaUv, ['sync', '--frozen', '--python', '3.14.4']);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  setupMedia();
  if (process.argv.includes('--test')) {
    run(mediaUv, ['run', '--no-sync', 'python', '-X', 'utf8', '-m', 'pytest', '-q', 'test/media']);
  }
}
