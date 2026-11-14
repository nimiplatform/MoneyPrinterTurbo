import type { NimiAppScope } from '@nimiplatform/kit/core/app-session';
import type { StudioPlatform, StudioCommand } from '../production/platform.js';
import type { Task, MediaAsset } from '../production/types.js';
import { remoteMedia, remoteMediaBlob } from './remote-media.js';
import type { DeliveryObserver } from './android-export.js';

function within<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) { void promise.catch(() => undefined); reject(signal.reason); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
const pause = (ms: number, signal: AbortSignal) => within(new Promise<void>(resolve => setTimeout(resolve, ms)), signal);
function base64(bytes: Uint8Array) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
}

/** Each instance captures one real connected scope. Reconnect cannot retarget an outstanding gesture. */
export function remoteProductionPlatform(scope: NimiAppScope, kind: 'web' | 'android', report: DeliveryObserver = () => undefined): StudioPlatform {
  const api = scope.client.integration;
  async function selectTarget(operation: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const candidates = (await within(api.listCatalog(), signal)).filter(row => row.integrationId === 'moneyprinterturbo.production.v1' && row.available);
    if (!candidates.length) throw new Error('请在 PC 打开 MoneyPrinterTurbo，并保持它运行。');
    const allowed = candidates.filter(row => row.permittedOperations.includes(operation));
    if (!allowed.length) throw new Error(`请在 Nimi Home → 集成中允许此客户端使用 ${operation}。`);
    if (allowed.length !== 1) throw new Error('有多个获准的 PC 工作区。请在 Nimi Home 中仅保留本次要使用的工作区权限。');
    return allowed[0]!.targetRef;
  }
  async function call<T>(operation: string, input: unknown, capturedTarget?: string): Promise<T> {
    const signal = AbortSignal.any([scope.signal, AbortSignal.timeout(60_000)]);
    signal.throwIfAborted();
    const targetRef = capturedTarget ?? await selectTarget(operation, signal);
    try {
      let result = await within(api.invoke({ targetRef, operation, inputJson: JSON.stringify(input) }), signal);
      while (result.status === 'accepted') {
        await pause(150, signal);
        result = await within(api.getCall({ callId: result.callId }), signal);
      }
      if (result.status !== 'completed') throw new Error(`PC 操作未完成（${result.errorCode || result.status}）。请检查 PC App 和原任务记录。`);
      return JSON.parse(result.resultJson) as T;
    } catch (error) {
      if (signal.aborted) throw new Error('连接中断或响应超时，操作结果尚未确认。重新连接后请检查原任务记录；本次操作不会自动重交。');
      throw error;
    }
  }
  async function text(prompt: string) {
    const result = await scope.client.ai.scenario.execute({ type: 'text-generate', messages: [
      { role: 'system', text: 'You are a short-video editor. Follow the user language. Return only the requested content, without markdown fences.' },
      { role: 'user', text: prompt },
    ], maxTokens: 3000 }, { signal: scope.signal });
    scope.signal.throwIfAborted();
    if (result.output.type !== 'text-generate' || result.output.finishReason !== 'stop') throw new Error('文字响应未完整结束。请检查输入后明确重试。');
    const content = result.output.items.filter(item => item.type === 'text').map(item => item.text).join('').trim();
    if (!content) throw new Error('模型返回了空文字。');
    return content;
  }
  async function mediaSource(asset: MediaAsset) {
    const target = await selectTarget('media.read', AbortSignal.any([scope.signal, AbortSignal.timeout(60_000)]));
    return remoteMedia(asset, offset => call('media.read', { relativePath: asset.relativePath, offset }, target), scope.signal);
  }
  async function readMedia(asset: MediaAsset) {
    return remoteMediaBlob(await mediaSource(asset), scope.signal);
  }
  return {
    kind, connected: true, client: scope.client,
    async command<T>(name: StudioCommand, payload: Record<string, unknown> = {}) {
      const operations: Record<string, string> = { snapshot: 'studio.snapshot', settings: 'studio.settings', start: 'create', task: 'task', cancel: 'cancel', resume: 'resume', jobs: 'jobs', 'cues.save': 'cues.save', regenerate: 'regenerate', asset: 'asset' };
      if (name === 'settings.save') {
        if (payload.scope !== 'creation') throw new Error('业务账号设置请在 PC 完成。');
        return call<T>('studio.settings.save', { params: payload.value });
      }
      if (name === 'rewrite') {
        const p = payload.params as Task['params'];
        return { script: await text(`Rewrite this short video script in ${p.language}. Instruction: ${payload.instruction}\nScript: ${p.script}`) } as T;
      }
      if (name === 'metadata') {
        const task = await call<Task>('task', payload);
        return { text: await text(`Return a social post title and description in ${task.params.language}, based on this script: ${task.script}`) } as T;
      }
      if (name === 'preview') {
        const { taskId } = await call<{ taskId: string }>('preview.start', payload);
        try {
          while (true) {
            const task = await call<Task>('task', { id: taskId });
            if (task.state === 'complete' && task.previewResult) return task.previewResult as T;
            if (!['queued','running'].includes(task.state)) throw new Error(task.error || '试听尚未完成。');
            await pause(1000, scope.signal);
          }
        } catch (cause) { throw new Error(`试听任务 ${taskId} 已保存。请在历史任务检查原结果，不要重复提交。${String(cause)}`); }
      }
      if (!operations[name]) throw new Error('此操作请在 PC 完成。');
      return call<T>(operations[name], payload);
    },
    async importMedia(file, mediaType) {
      if (!file.size || file.size > 256 * 1024 * 1024) throw new Error('请选择 256 MB 以内的媒体文件。');
      const { id } = await call<{ id: string }>('media.upload', { action: 'begin', name: file.name, mediaType, size: file.size });
      try {
        for (let offset = 0; offset < file.size; offset += 65536) {
          const bytes = new Uint8Array(await file.slice(offset, offset + 65536).arrayBuffer());
          await call('media.upload', { action: 'append', id, offset, dataBase64: base64(bytes) });
        }
        return (await call<{ asset: MediaAsset }>('media.upload', { action: 'finish', id })).asset;
      } catch (cause) { if (!scope.signal.aborted) void call('media.upload', { action: 'abort', id }).catch(() => undefined); throw cause; }
    },
    async openMedia(asset) {
      const url = URL.createObjectURL(await readMedia(asset));
      return { url, revoke: () => URL.revokeObjectURL(url) };
    },
    async deliverAsset(asset) {
      if (kind === 'android') {
        report({ state: 'reading', name: asset.name });
        try {
          const { deliverAndroidMedia } = await import('./android-media.js');
          const result = await deliverAndroidMedia(await mediaSource(asset), scope.signal, report);
          report({ state: result.canceled ? 'canceled' : 'saved', name: asset.name, bytes: result.bytesWritten });
        } catch (error) { report({ state: 'failed', name: asset.name, error: String(error) }); throw error; }
      } else {
        const blob = await readMedia(asset);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = asset.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    },
    ...(kind === 'android' ? { async shareAsset(asset: MediaAsset) {
      report({ state: 'reading', name: asset.name });
      try {
        const blob = await readMedia(asset);
        const { shareAndroidMedia } = await import('./android-media.js');
        const result = await shareAndroidMedia(blob, asset.name, scope.signal);
        report({ state: result.canceled ? 'canceled' : 'shared', name: asset.name });
      } catch (error) { report({ state: 'failed', name: asset.name, error: String(error) }); throw error; }
    } } : {}),
  };
}
