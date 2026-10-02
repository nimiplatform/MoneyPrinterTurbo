import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const root = path.resolve(import.meta.dirname, '..');
const cache = path.join(root, '.nimi/local/media-build');
async function run(command, args, cwd = root, env = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Media build failed: ${command} (${code})`)),
    );
  });
}
async function sha(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function download(url, filename, expected) {
  await mkdir(path.dirname(filename), { recursive: true });
  try {
    await access(filename);
    if (!expected || (await sha(filename)) === expected) return filename;
  } catch {}
  const response = await fetch(url);
  if (!response.ok || !response.body)
    throw new Error(`Download failed (${response.status}): ${url}`);
  const pending = filename + '.download';
  await pipeline(Readable.fromWeb(response.body), createWriteStream(pending));
  if (expected && (await sha(pending)) !== expected)
    throw new Error(`Checksum mismatch: ${filename}`);
  await copyFile(pending, filename);
  await rm(pending);
  return filename;
}
async function extract(archive, destination) {
  await mkdir(destination, { recursive: true });
  await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:MPT_BUILD_ARCHIVE,$env:MPT_BUILD_DESTINATION)',
    ],
    root,
    { ...process.env, MPT_BUILD_ARCHIVE: archive, MPT_BUILD_DESTINATION: destination },
  );
}
export async function prepareMedia() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error(
      'This media bundle currently targets Windows x86_64. macOS arm64 is NOT-VERIFIED.',
    );
  await mkdir(cache, { recursive: true });
  const ffmpeg = path.join(cache, 'ffmpeg');
  try {
    await access(path.join(ffmpeg, 'bin/ffprobe.exe'));
  } catch {
    const archive = await download(
      'https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/ffmpeg-9.0.1-essentials_build.zip',
      path.join(cache, 'downloads/ffmpeg-9.0.1.zip'),
      'fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9',
    );
    await extract(archive, path.join(cache, 'extract'));
    await cp(path.join(cache, 'extract/ffmpeg-9.0.1-essentials_build'), ffmpeg, {
      recursive: true,
    });
  }
  const fontBase =
    'https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans';
  await download(
    fontBase + '/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
    path.join(root, 'resource/fonts/NotoSansCJKsc-Regular.otf'),
  );
  await download(fontBase + '/LICENSE', path.join(root, 'licenses/Noto-OFL.txt'));
  await run('python', ['-m', 'uv', 'sync', '--frozen', '--python', '3.14.4']);
  await run(path.join(root, '.venv/Scripts/python.exe'), [
    path.join(root, 'scripts/generate-icon.py'),
  ]);
  await run('python', [
    '-m',
    'uv',
    'export',
    '--frozen',
    '--no-dev',
    '--format',
    'requirements-txt',
    '--output-file',
    path.join(cache, 'requirements-media.txt'),
  ]);
  const bundle = path.join(cache, 'moneyprinter-media');
  const pythonRoot = path.join(bundle, 'python');
  try {
    await access(path.join(pythonRoot, 'python.exe'));
  } catch {
    const archive = await download(
      'https://www.python.org/ftp/python/3.14.4/python-3.14.4-embed-amd64.zip',
      path.join(cache, 'downloads/python-3.14.4.zip'),
      'cda80a9b1e75c0f1b4f9872ca1b417f0d19bce32facc811aea9180e70fad5fb9',
    );
    await extract(archive, pythonRoot);
  }
  const site = path.join(pythonRoot, 'Lib/site-packages');
  const pip = await download(
    'https://files.pythonhosted.org/packages/f3/6e/1736e5b4ae2b778ef2f81c47d797de9f891d4d8acb047a24ca37a60294dd/pip-26.2.1-py3-none-any.whl',
    path.join(cache, 'downloads/pip-26.2.1.zip'),
    '71138adf1f4ca900cdb7d289c21b7494329f2332b6d85f0e1c42108c0384ed3e',
  );
  try {
    await access(path.join(site, 'pip/__main__.py'));
  } catch {
    await extract(pip, site);
  }
  await writeFile(
    path.join(pythonRoot, 'python314._pth'),
    'python314.zip\n.\nLib/site-packages\n..\nimport site\n',
  );
  await run(
    path.join(pythonRoot, 'python.exe'),
    [
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '--no-compile',
      '--no-warn-script-location',
      '--only-binary=:all:',
      '--require-hashes',
      '--upgrade',
      '--target',
      site,
      '-r',
      path.join(cache, 'requirements-media.txt'),
    ],
    root,
    { ...process.env, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' },
  );
  // Keep only the deterministic worker and its direct media dependencies in the package.
  for (const rel of [
    'app/media_worker.py',
    'app/__init__.py',
    'app/config/__init__.py',
    'app/config/config.py',
    'app/models/__init__.py',
    'app/models/schema.py',
    'app/models/const.py',
    'app/services/__init__.py',
    'app/services/video.py',
    'app/services/bgm.py',
    'app/services/utils/__init__.py',
    'app/services/utils/video_effects.py',
    'app/utils/__init__.py',
    'app/utils/utils.py',
    'app/utils/file_security.py',
    'app/utils/logging_utils.py',
  ]) {
    await mkdir(path.dirname(path.join(bundle, rel)), { recursive: true });
    await copyFile(path.join(root, rel), path.join(bundle, rel));
  }
  await mkdir(path.join(bundle, 'resource/fonts'), { recursive: true });
  await copyFile(
    path.join(root, 'resource/fonts/NotoSansCJKsc-Regular.otf'),
    path.join(bundle, 'resource/fonts/NotoSansCJKsc-Regular.otf'),
  );
  await cp(ffmpeg, path.join(bundle, 'ffmpeg'), {
    recursive: true,
    filter: (src) => path.basename(src) !== 'ffplay.exe',
  });
  await cp(path.join(root, 'licenses'), path.join(bundle, 'licenses'), { recursive: true });
  await copyFile(path.join(root, 'LICENSE'), path.join(bundle, 'LICENSE'));
  await run(
    path.join(pythonRoot, 'python.exe'),
    [
      '-X',
      'utf8',
      '-c',
      'from app.services import video; import PIL; print("Packaged Python media imports ready")',
    ],
    bundle,
    {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      MPT_SCRATCH_ROOT: path.join(cache, 'bundle-check'),
      MPT_RESOURCE_ROOT: path.join(bundle, 'resource'),
      IMAGEIO_FFMPEG_EXE: path.join(bundle, 'ffmpeg/bin/ffmpeg.exe'),
    },
  );
  console.log('MoneyPrinterTurbo Windows media bundle ready:', bundle);
  return bundle;
}
if (path.resolve(process.argv[1] || '') === path.join(root, 'scripts/prepare-media.mjs'))
  await prepareMedia();
