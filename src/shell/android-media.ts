import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { registerPlugin } from '@capacitor/core';
import { saveAndroidMedia, type ExportSink, type DeliveryObserver } from './android-export.js';
import type { RemoteMedia } from './remote-media.js';
const files = registerPlugin<ExportSink>('MoneyPrinterTurboFiles');

export function deliverAndroidMedia(source: RemoteMedia, signal: AbortSignal, report: DeliveryObserver) {
  return saveAndroidMedia(source, signal, files, report);
}

export async function shareAndroidMedia(blob: Blob, name: string, signal: AbortSignal) {
  if (!name || name === '.' || name === '..' || /[/\\\0]/u.test(name)) throw new Error('文件名无效。');
  const folder = `mpt-exports/${crypto.randomUUID()}`;
  const path = `${folder}/${name}`;
  const file = await Filesystem.writeFile({ directory: Directory.Cache, path, data: '', recursive: true });
  const remove = async () => { await Filesystem.deleteFile({ directory: Directory.Cache, path }); await Filesystem.rmdir({ directory: Directory.Cache, path: folder }); };
  try {
    for (let offset = 0; offset < blob.size; offset += 65536) {
      signal.throwIfAborted();
      const bytes = new Uint8Array(await blob.slice(offset, offset + 65536).arrayBuffer());
      let data = ''; for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await Filesystem.appendFile({ directory: Directory.Cache, path, data: btoa(data) });
    }
    signal.throwIfAborted();
    await Share.share({ files: [file.uri], title: name });
    return { canceled: false };
  } catch (cause) {
    await remove().catch(() => undefined);
    if (cause instanceof Error && cause.message === 'Share canceled') return { canceled: true };
    throw cause;
  }
}
