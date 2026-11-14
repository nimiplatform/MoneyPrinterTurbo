import type { MediaAsset } from '../production/types.js';

export type RemoteMedia = Readonly<{
  name: string; mimeType: string; size: number; sha256: string;
  chunks: AsyncIterable<Uint8Array<ArrayBuffer>>;
}>;
type MediaPart = { dataBase64: string; offset: number; length: number; nextOffset: number; totalSize: number; sha256: string; eof: boolean; relativePath: string; mediaType: string };
export type MediaReader = (offset: number) => Promise<MediaPart>;
const LIMIT = 256 * 1024 * 1024;

/** One read gesture uses one captured PC target and immutable media metadata. */
export async function remoteMedia(asset: MediaAsset, read: MediaReader, signal: AbortSignal): Promise<RemoteMedia> {
  signal.throwIfAborted();
  const first = await read(0);
  signal.throwIfAborted();
  const total = first.totalSize, digest = first.sha256, mime = first.mediaType;
  if (!Number.isSafeInteger(total) || total < 0 || total > LIMIT || !/^sha256:[a-f0-9]{64}$/.test(digest)
    || typeof mime !== 'string' || !mime || /[\r\n\0]/.test(mime))
    throw new Error('媒体信息无效或超过 256 MB。请在 PC 打开原文件。');
  return {
    name: asset.name, mimeType: mime, size: total, sha256: digest,
    chunks: (async function* () {
      let offset = 0, part = first;
      while (true) {
        signal.throwIfAborted();
        if (part.offset !== offset || part.relativePath !== asset.relativePath || part.sha256 !== digest || part.totalSize !== total || part.mediaType !== mime)
          throw new Error('媒体信息在传输期间发生变化，未提供部分文件。');
        if (typeof part.dataBase64 !== 'string' || part.dataBase64.length > 174764
          || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(part.dataBase64))
          throw new Error('媒体数据无效，未提供部分文件。');
        const bytes = Uint8Array.from(atob(part.dataBase64), c => c.charCodeAt(0));
        if ((!bytes.length && total !== 0) || bytes.length > 131072 || part.length !== bytes.length || part.nextOffset !== offset + bytes.length
          || part.nextOffset > total || part.eof !== (part.nextOffset === total))
          throw new Error('媒体传输不完整，未提供部分文件。');
        if (bytes.length) yield bytes;
        offset = part.nextOffset;
        if (part.eof) return;
        part = await read(offset);
      }
    })(),
  };
}

/** Preview and the retained Share action still need a Blob; Save streams to Android. */
export async function remoteMediaBlob(source: RemoteMedia, signal: AbortSignal) {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for await (const chunk of source.chunks) chunks.push(chunk);
  const blob = new Blob(chunks, { type: source.mimeType });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  if (`sha256:${digest}` !== source.sha256) throw new Error('媒体完整性校验失败，未提供文件。');
  return blob;
}
