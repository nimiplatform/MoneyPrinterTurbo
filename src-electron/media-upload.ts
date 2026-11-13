import { randomUUID } from 'node:crypto';
import { mkdir, appendFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { mediaImport, type ProductionController, type MediaImport } from './production-controller.js';
import type { MediaAsset } from '../src/production/types.js';

type Upload = { owner: string; meta: MediaImport; file: string; offset: number; touched: number; asset?: MediaAsset };
/** Bounded staging for App media, scoped to the Runtime-issued consumer and this Host lifetime. */
export class MediaUploads {
  private uploads = new Map<string, Upload>();
  private closed = false;
  constructor(private controller: ProductionController, private root: string) {}
  async call(owner: string, input: Record<string, any>) {
    if (this.closed || !owner) throw new Error('媒体上传会话已结束。');
    for (const [id, upload] of this.uploads) if (Date.now() - upload.touched > 15 * 60_000) {
      await rm(upload.file, { force: true }); this.uploads.delete(id);
    }
    if (input.action === 'begin') {
      const meta = mediaImport(input.name, input.mediaType, input.size);
      if (this.uploads.size >= 8) throw new Error('同时导入的文件过多，请稍后重试。');
      const id = randomUUID();
      await mkdir(this.root, { recursive: true });
      this.uploads.set(id, { owner, meta, file: path.join(this.root, id), offset: 0, touched: Date.now() });
      return { id, offset: 0 };
    }
    const upload = this.uploads.get(input.id);
    if (!upload || upload.owner !== owner) throw new Error('没有此来源的媒体上传。');
    upload.touched = Date.now();
    if (input.action === 'abort') {
      await rm(upload.file, { force: true }); this.uploads.delete(input.id); return { aborted: true };
    }
    if (input.action === 'append') {
      if (upload.asset || input.offset !== upload.offset || typeof input.dataBase64 !== 'string'
        || input.dataBase64.length > 87384 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.dataBase64))
        throw new Error('媒体块位置或格式无效。');
      const bytes = Buffer.from(input.dataBase64, 'base64');
      if (!bytes.length || bytes.length > 65536 || upload.offset + bytes.length > upload.meta.size) throw new Error('媒体块超过声明大小。');
      await appendFile(upload.file, bytes);
      upload.offset += bytes.length;
      return { id: input.id, offset: upload.offset };
    }
    if (input.action === 'finish') {
      if (upload.offset !== upload.meta.size) throw new Error('媒体尚未完整上传。');
      if (!upload.asset) {
        upload.asset = await this.controller.importMediaStream(upload.meta, createReadStream(upload.file));
        await rm(upload.file, { force: true });
      }
      return { asset: upload.asset };
    }
    throw new Error('未支持的媒体上传动作。');
  }
  async close() {
    this.closed = true;
    await Promise.all([...this.uploads.values()].map(upload => rm(upload.file, { force: true })));
    this.uploads.clear();
  }
}
