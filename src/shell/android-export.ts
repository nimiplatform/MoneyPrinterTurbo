import type { RemoteMedia } from './remote-media.js';

export type ExportSink = {
  beginExport(input: { name: string; mimeType: string; size: number; sha256: string }): Promise<{ id: string }>;
  appendExport(input: { id: string; offset: number; data: string }): Promise<{ received: number }>;
  saveExport(input: { id: string }): Promise<{ name?: string; bytesWritten: number }>;
  abortExport(input: { id: string }): Promise<void>;
};
export type AndroidDeliveryState =
  | { state: 'saved'; name?: string; bytes: number }
  | { state: 'reading' | 'choosing' | 'canceled' | 'shared' | 'failed'; name: string; bytes?: number; total?: number; error?: string };
export type DeliveryObserver = (state: AndroidDeliveryState) => void;
export type AndroidSaveResult = { canceled: true } | { canceled: false; name?: string; bytesWritten: number };

export async function saveAndroidMedia(source: RemoteMedia, signal: AbortSignal, files: ExportSink, report: DeliveryObserver): Promise<AndroidSaveResult> {
  signal.throwIfAborted();
  const { id } = await files.beginExport({ name: source.name, mimeType: source.mimeType, size: source.size, sha256: source.sha256 });
  let offset = 0;
  try {
    for await (const part of source.chunks) {
      for (let position = 0; position < part.length; position += 65536) {
        signal.throwIfAborted();
        const bytes = part.subarray(position, position + 65536);
        let raw = ''; for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const result = await files.appendExport({ id, offset, data: btoa(raw) });
        if (result.received !== offset + bytes.length) throw new Error('设备文件传输未完整完成。');
        offset = result.received;
        report({ state: 'reading', name: source.name, bytes: offset, total: source.size });
      }
    }
    if (offset !== source.size) throw new Error('PC 文件未完整传输，尚未打开保存位置。');
    signal.throwIfAborted();
    report({ state: 'choosing', name: source.name, bytes: offset, total: source.size });
    // Native verifies the staged digest before opening SAF. Local Save can finish
    // after the picker ends the Runtime scope; no later RPC or client rebind occurs.
    const saved = await files.saveExport({ id });
    if (saved.bytesWritten !== source.size) throw new Error('所选位置未完整保存文件，请检查目标文件；PC 原件仍保留。');
    return { canceled: false, ...(saved.name ? { name: saved.name } : {}), bytesWritten: saved.bytesWritten };
  } catch (error) {
    if ((error as { code?: string }).code === 'MPT_EXPORT_CANCELED') return { canceled: true };
    throw error;
  } finally {
    await files.abortExport({ id }).catch(() => undefined);
  }
}
