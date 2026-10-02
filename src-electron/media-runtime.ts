import path from 'node:path';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import type { MediaAsset, ProductionParams, Cue } from '../src/production/types.js';
export type MediaPaths = {
  appRoot: string;
  scratchRoot: string;
  python: string;
  ffmpeg: string;
  ffprobe: string;
  resourceRoot: string;
};
export function mediaPaths(
  appRoot: string,
  scratchRoot: string,
  packaged: boolean,
  resourcesPath: string,
): MediaPaths {
  const root = packaged ? path.join(resourcesPath, 'moneyprinter-media') : appRoot;
  return {
    appRoot: root,
    scratchRoot,
    python: packaged
      ? path.join(root, 'python', 'python.exe')
      : path.join(root, '.venv', 'Scripts', 'python.exe'),
    ffmpeg: path.join(
      packaged ? root : path.join(root, '.nimi', 'local', 'media-build'),
      'ffmpeg',
      'bin',
      'ffmpeg.exe',
    ),
    ffprobe: path.join(
      packaged ? root : path.join(root, '.nimi', 'local', 'media-build'),
      'ffmpeg',
      'bin',
      'ffprobe.exe',
    ),
    resourceRoot: path.join(root, 'resource'),
  };
}
export async function killTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) =>
    execFile(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true },
      (error) => {
        if (error && child.exitCode === null) reject(error);
        else resolve();
      },
    ),
  );
}
export class MediaRuntime {
  private children = new Set<ChildProcess>();
  constructor(readonly paths: MediaPaths) {}
  availability() {
    const files = {
      Python: this.paths.python,
      FFmpeg: this.paths.ffmpeg,
      FFprobe: this.paths.ffprobe,
      worker: path.join(this.paths.appRoot, 'app', 'media_worker.py'),
      font: path.join(this.paths.resourceRoot, 'fonts', 'NotoSansCJKsc-Regular.otf'),
    };
    return {
      available: Object.values(files).every(existsSync),
      missing: Object.entries(files)
        .filter(([, file]) => !existsSync(file))
        .map(([name]) => name),
    };
  }
  async call<T>(
    operation: 'probe' | 'silence' | 'prepare-audio' | 'split-audio' | 'render',
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    const status = this.availability();
    if (!status.available)
      throw new Error(
        `媒体环境未就绪：${status.missing.join('、')}。运行 pnpm run media:prepare。`,
      );
    await mkdir(this.paths.scratchRoot, { recursive: true });
    const env: NodeJS.ProcessEnv = {};
    for (const name of [
      'SystemRoot',
      'WINDIR',
      'COMSPEC',
      'TEMP',
      'TMP',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'HOMEDRIVE',
      'HOMEPATH',
      'NUMBER_OF_PROCESSORS',
    ])
      if (process.env[name]) env[name] = process.env[name];
    Object.assign(env, {
      PATH: [
        path.dirname(this.paths.ffmpeg),
        path.dirname(this.paths.python),
        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
      ].join(path.delimiter),
      PYTHONUTF8: '1',
      PYTHONNOUSERSITE: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONDONTWRITEBYTECODE: '1',
      IMAGEIO_FFMPEG_EXE: this.paths.ffmpeg,
      MPT_FFPROBE: this.paths.ffprobe,
      MPT_SCRATCH_ROOT: this.paths.scratchRoot,
      MPT_RESOURCE_ROOT: this.paths.resourceRoot,
    });
    return await new Promise<T>((resolve, reject) => {
      const child = spawn(this.paths.python, ['-X', 'utf8', '-m', 'app.media_worker'], {
        cwd: this.paths.appRoot,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.children.add(child);
      let output = '',
        diagnostics = '';
      let cancellation: Promise<void> | undefined;
      const abort = () => {
        cancellation = killTree(child);
        void cancellation.catch(() => {});
      };
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (data: string) => {
        output += data;
        if (output.length > 4 * 1024 * 1024) {
          void killTree(child);
          reject(new Error('媒体 worker 输出超限。'));
        }
      });
      child.stderr?.on('data', (data: string) => {
        diagnostics = (diagnostics + data).slice(-6000);
      });
      child.once('error', reject);
      child.once('close', (code, exitSignal) => {
        this.children.delete(child);
        signal?.removeEventListener('abort', abort);
        void (async () => {
          if (cancellation) await cancellation;
          signal?.throwIfAborted();
          let result: { ok: boolean; result: T; error?: string };
          try {
            result = JSON.parse(output);
          } catch {
            throw new Error(`媒体 worker 未返回有效结果。${diagnostics.slice(-1600)}`);
          }
          if (!result.ok) throw new Error(result.error || diagnostics.slice(-1600));
          if (code !== 0 || exitSignal)
            throw new Error(
              `媒体 worker 异常退出 (${exitSignal || code})。${diagnostics.slice(-1200)}`,
            );
          resolve(result.result);
        })().catch(reject);
      });
      child.stdin?.end(JSON.stringify({ operation, input }) + '\n', 'utf8');
      if (signal?.aborted) abort();
    });
  }
  async stop() {
    await Promise.all([...this.children].map(killTree));
  }
  async dispose() {
    await this.stop();
    await rm(this.paths.scratchRoot, { recursive: true, force: true });
  }
}
export type Probe = {
  duration: number;
  width: number;
  height: number;
  audio: boolean;
  colorSpace?: string;
};
export type RenderResult = { combined: string; video: string; probe: Probe; musicMixed: boolean };
