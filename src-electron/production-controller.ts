import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { NimiElectronAppBusinessServices } from '@nimiplatform/kit/shell/electron/main';
import type { NimiLocalAppScenarioJob, NimiLocalAppScenarioJobSpec } from '@nimiplatform/sdk/app';
import type { JsonValue } from '@nimiplatform/sdk/types';
import {
  defaultBusiness,
  defaultParams,
  narrationKey,
  STAGES,
  validateAsset,
  validateParams,
  type BusinessSettings,
  type MediaAsset,
  type ProductionParams,
  type Task,
  type Stage,
} from '../src/production/types.js';
import { assembleCues, toSrt, validateCues } from '../src/production/transcription.js';
import { parseVisualTerms } from '../src/production/script.js';
import { taskPage } from './task-list.js';
import { MediaRuntime, type Probe, type RenderResult } from './media-runtime.js';
import { searchStock, publishVideo, pollPublication, validatePublication } from './business-services.js';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const missing = (e: unknown) =>
  /(?:NOT_FOUND|not-found|does not exist|not found|no such file)/i.test(
    e instanceof Error ? e.message : String(e),
  );
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
const aiIdentity = (
  snapshot: Awaited<ReturnType<NimiElectronAppBusinessServices['aiConfig']['get']>>,
) =>
  JSON.stringify([
    snapshot.revision,
    snapshot.effectiveSelections.map((s) => [
      s.capabilityContract,
      s.state,
      s.resource?.oneofKind,
      s.resource?.oneofKind === 'local'
        ? s.resource.local.loadoutRef
        : s.resource?.oneofKind === 'cloud'
          ? [s.resource.cloud.target.connectorRef, s.resource.cloud.target.providerModelTarget]
          : null,
    ]),
  ]);
const mimeExt: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/x-subrip': 'srt',
  'application/json': 'json',
  'text/plain': 'txt',
};
function musicProfile(snapshot: Awaited<ReturnType<NimiElectronAppBusinessServices['aiConfig']['get']>>, p: ProductionParams) {
  const selected = snapshot.effectiveSelections.find((s) => s.capabilityContract === 'music.generate');
  const input = selected?.resource?.oneofKind === 'local' ? selected.resource.local.musicInput
    : selected?.resource?.oneofKind === 'cloud' ? selected.resource.cloud.target.musicInput : undefined;
  const profile = input?.generation.find((r) => p.music === 'video'
    ? ['optional', 'required'].includes(r.videoReferenceMode)
    : r.videoReferenceMode !== 'required' && r.supportsInstrumental && r.lyricsMode !== 'required');
  if (!profile) throw new Error(p.music === 'video'
    ? '当前音乐资源不接受真实成片视频。请在 Nimi 配置支持视频条件的资源，或改选本地音乐。'
    : '当前音乐资源未声明纯音乐输入支持。请在 Nimi 选择相应资源，或改选本地音乐。');
  return profile;
}
export class ProductionController {
  private alive = true;
  private queue: string[] = [];
  private active = false;
  private aborts = new Map<string, AbortController>();
  private writes: Promise<unknown> = Promise.resolve();
  private tasks = new Map<string, Task>();
  private previewWork = new Map<string, AbortController>();
  readonly ready: Promise<void>;
  constructor(
    readonly services: NimiElectronAppBusinessServices,
    readonly media: MediaRuntime,
  ) {
    this.ready = this.load();
  }
  assertLive(signal?: AbortSignal) {
    if (!this.alive) throw new Error('Nimi 会话已失效，请重新打开 App。旧任务不会自动重放。');
    signal?.throwIfAborted();
  }
  private async load() {
    let ids: string[] = [];
    try {
      ids = (await this.services.storage.readJson('production/index.json')).value as string[];
    } catch (e) {
      if (!missing(e)) throw e;
    }
    if (!Array.isArray(ids)) throw new Error('任务索引格式错误。');
    for (const id of ids) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('任务索引 ID 无效。');
      const t = (await this.services.storage.readJson(`production/tasks/${id}.json`))
        .value as unknown as Task;
      if (['running', 'queued'].includes(t.state)) {
        t.state = 'paused';
        t.error = '上次会话或 Host 已结束。请检查已知 Job 或阶段结果，再显式继续。';
      }
      for (const attempt of t.jobs)
        if (attempt.state === 'submitting' && !attempt.id) attempt.state = 'uncertain';
      this.tasks.set(id, t);
    }
  }
  private write(relativePath: string, value: unknown) {
    this.assertLive();
    const op = this.writes
      .catch(() => {})
      .then(() => {
        this.assertLive();
        return this.services.storage.writeJson(relativePath, json(value));
      });
    this.writes = op;
    return op;
  }
  private async save(t: Task) {
    this.assertLive();
    t.updatedAt = new Date().toISOString();
    await this.write(`production/tasks/${t.id}.json`, t);
    await this.write('production/index.json', [...this.tasks.keys()]);
  }
  async snapshot() {
    await this.ready;
    this.assertLive();
    return {
      tasks: json([...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      media: this.media.availability(),
    };
  }
  async listTasks(cursor?: unknown, limit?: unknown) {
    await this.ready;
    this.assertLive();
    return taskPage(this.tasks.values(), cursor, limit);
  }
  async readTask(id: string) {
    await this.ready;
    this.assertLive();
    return json(this.task(id));
  }
  async settings(): Promise<{ params: ProductionParams; business: BusinessSettings }> {
    await this.ready;
    try {
      const s = (await this.services.storage.readJson('production/settings.json'))
        .value as unknown as { params: ProductionParams; business: BusinessSettings };
      return s;
    } catch (e) {
      if (!missing(e)) throw e;
      return { params: structuredClone(defaultParams), business: { ...defaultBusiness } };
    }
  }
  async saveSettings(scope: unknown, input: unknown) {
    await this.ready;
    if (scope !== 'creation' && scope !== 'business') throw new Error('未知设置范围。');
    const saved = await this.settings();
    if (scope === 'creation') {
      const params = input;
      if (!params || typeof params !== 'object') throw new Error('创作参数格式不正确。');
      // Empty drafts can be saved before a topic is entered, while submission validates the full task.
      const p = validateParams({
        ...(params as object),
        topic: (params as ProductionParams).topic || '未命名草稿',
      });
      p.topic = (params as ProductionParams).topic;
      await this.write('production/settings.json', { ...saved, params: p });
      return { saved: true };
    }
    const business = input;
    if (
      !business ||
      typeof business !== 'object' ||
      Object.keys(business).some((k) => !(k in defaultBusiness))
    )
      throw new Error('业务设置格式不正确。');
    const b = business as BusinessSettings;
    for (const key of [
      'pexelsKey',
      'pixabayKey',
      'coverrKey',
      'uploadPostKey',
      'uploadPostUser',
    ] as const)
      if (typeof b[key] !== 'string' || b[key].length > 2000) throw new Error('业务账户设置无效。');
    if (
      !Array.isArray(b.uploadPlatforms) ||
      b.uploadPlatforms.some(
        (x) =>
          ![
            'youtube',
            'tiktok',
            'instagram',
            'facebook',
            'linkedin',
            'x',
            'pinterest',
            'threads',
          ].includes(x),
      )
    )
      throw new Error('发布平台无效。');
    await this.write('production/settings.json', { ...saved, business: b });
    return { saved: true };
  }
  async importAsset(name: string, mediaType: string, bytes: Uint8Array): Promise<MediaAsset> {
    await this.ready;
    this.assertLive();
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.length > 256 * 1024 * 1024 ||
      !mimeExt[mediaType] ||
      !/^(image|audio|video)\//.test(mediaType)
    )
      throw new Error('请选择 256 MB 以内支持的媒体文件。');
    if (typeof name !== 'string' || name.length > 250) throw new Error('文件名过长。');
    const asset = await this.services.storage.assets.write({
      relativePath: `imports/${randomUUID()}.${mimeExt[mediaType]}`,
      body: bytes,
      mediaType,
    });
    this.assertLive();
    return { ...asset, name, mediaType };
  }
  async start(input: unknown, seed?: Task) {
    await this.ready;
    const p = validateParams(input);
    this.assertLive();
    const configSnapshot = await this.services.aiConfig.get();
    if (['materials', 'video'].includes(p.stopAt)) {
      if (p.materialSource === 'local' && !p.materials.length) throw new Error('请先导入图片或视频素材。');
      if (['pexels', 'pixabay', 'coverr'].includes(p.materialSource)) {
        const business = (await this.settings()).business;
        if (!business[`${p.materialSource}Key` as 'pexelsKey' | 'pixabayKey' | 'coverrKey'])
          throw new Error(`请先在业务设置中填写 ${p.materialSource} API key。`);
      }
    }
    if (p.stopAt === 'video' && p.musicVolume > 0 && p.music !== 'none') {
      if (['ai', 'video'].includes(p.music)) musicProfile(configSnapshot, p);
      else if (!p.musicAssets.length) throw new Error('请先导入背景音乐。');
    }
    const revision = configSnapshot.revision;
    const configIdentity = aiIdentity(configSnapshot);
    const ids: string[] = [];
    for (let variant = 0; variant < p.batch; variant++) {
      const now = new Date().toISOString();
      const t: Task = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        params: p,
        configRevision: revision,
        configIdentity,
        variant,
        state: 'queued',
        stage: 'script',
        progress: 0,
        script: p.script.trim(),
        terms: [...p.terms],
        materials: [],
        cues: seed ? structuredClone(seed.cues) : [],
        words: seed ? structuredClone(seed.words) : [],
        ...(seed?.audio ? { audio: seed.audio } : {}),
        artifacts: [],
        jobs: [],
        warnings: [],
      };
      this.tasks.set(t.id, t);
      await this.save(t);
      this.queue.push(t.id);
      ids.push(t.id);
    }
    void this.pump();
    return { taskIds: ids };
  }
  private task(id: string) {
    const t = this.tasks.get(id);
    if (!t) throw new Error('任务不存在。');
    return t;
  }
  async cancel(id: string) {
    await this.ready;
    const t = this.task(id);
    this.assertLive();
    if (['complete', 'failed', 'stopped'].includes(t.state) && !this.aborts.has(id) && !this.previewWork.has(id))
      return { schedulingStopped: true, alreadyTerminal: true, state: t.state,
        runtimeCancellationRequested: 0, runtimeCancellationConfirmed: null, mediaStopping: false };
    this.queue = this.queue.filter((x) => x !== id);
    this.aborts.get(id)?.abort(new Error('用户停止任务。'));
    this.previewWork.get(id)?.abort(new Error('用户停止试听。'));
    const known = t.jobs.filter((j) => j.id && j.state !== 'consumed');
    const results = await Promise.allSettled(
      known.map((j) =>
        this.services.ai.scenarioJobs.cancel(j.id!, 'User stopped MoneyPrinterTurbo task'),
      ),
    );
    t.state = 'stopped';
    t.error = results.some((r) => r.status === 'rejected')
      ? '已停止 App 调度；部分 Runtime Job 的取消未确认，请查询原 Job。'
      : '已停止调度；已知 Job 已请求取消。';
    // The media call waits for the owned process tree to exit before this task's run returns.
    await this.save(t);
    return {
      schedulingStopped: true,
      runtimeCancellationRequested: known.length,
      runtimeCancellationConfirmed: known.length ? results.every(
        (r) => r.status === 'fulfilled' && r.value.job.status === 'canceled',
      ) : null,
      unconfirmedSubmissions: t.jobs.filter((j) => !j.id && ['submitting', 'uncertain'].includes(j.state)).length,
      mediaStopping: this.aborts.has(id) || this.previewWork.has(id),
    };
  }
  async resume(id: string) {
    await this.ready;
    const t = this.task(id);
    if (!['paused', 'failed', 'stopped'].includes(t.state)) throw new Error('该任务当前不可继续。');
    if (t.jobs.some((j) => ['submitting', 'uncertain'].includes(j.state) && !j.id && !j.submissionId))
      throw new Error('存在无 Job ID 的不确定提交。请先在 Nimi 确认执行情况；不能自动重新计费。');
    const snapshot = await this.services.aiConfig.get();
    const revision = snapshot.revision;
    if (
      revision !== t.configRevision ||
      !t.configIdentity ||
      aiIdentity(snapshot) !== t.configIdentity
    )
      throw new Error(
        'AI 配置已改变。原任务保留原配置语义；请显式创建新任务，已知 Job 可单独查询。',
      );
    t.state = 'queued';
    delete t.error;
    await this.save(t);
    this.queue.push(id);
    void this.pump();
    return { queued: true };
  }
  async inspectJobs(id: string) {
    await this.ready;
    const t = this.task(id);
    return Promise.all(
      t.jobs
        .filter((j) => j.id || j.submissionId)
        .map(async (j) => ({
          stage: j.stage,
          ...(j.id
            ? await this.services.ai.scenarioJobs.get(j.id)
            : await this.services.ai.scenarioJobs.lookupSubmission(j.submissionId!)),
        })),
    );
  }
  async editCues(id: string, cues: unknown) {
    await this.ready;
    const t = this.task(id);
    if (t.state === 'running' || t.state === 'queued') throw new Error('请先停止任务再校对。');
    t.cues = validateCues(cues);
    await this.save(t);
    return { saved: true };
  }
  async regenerate(id: string) {
    await this.ready;
    const source = this.task(id);
    if (source.state === 'running' || source.state === 'queued') throw new Error('请先停止任务。');
    const p = {
      ...source.params,
      script: source.script,
      terms: source.terms,
      materials: source.materials,
      narration: 'upload' as const,
      audio: source.audio,
      batch: 1,
      materialSource: 'local' as const,
      stopAt: 'video' as const,
    };
    return this.start(p, source);
  }
  private async pump() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.queue.length && this.alive) {
        const id = this.queue.shift()!;
        const t = this.task(id);
        if (t.state !== 'queued') continue;
        const control = new AbortController();
        this.aborts.set(id, control);
        t.state = 'running';
        try {
          await this.save(t);
          await this.pipeline(t, control.signal);
          this.assertLive(control.signal);
          t.state = 'complete';
          t.progress = 100;
          await this.save(t);
        } catch (e) {
          if (this.alive) {
            if (!control.signal.aborted)
              t.state =
                t.jobs.some((j) => j.state === 'uncertain') ||
                /配置|会话|uncertain/i.test(String(e))
                  ? 'paused'
                  : 'failed';
            t.error = e instanceof Error ? e.message : String(e);
            try {
              await this.save(t);
            } catch (persistenceError) {
              t.state = 'paused';
              t.error += '；任务记录保存失败：' + String(persistenceError);
              this.queue = [];
            }
          }
        } finally {
          this.aborts.delete(id);
        }
      }
    } finally {
      this.active = false;
    }
  }
  private async config(t: Task, signal: AbortSignal) {
    this.assertLive(signal);
    const snap = await this.services.aiConfig.get();
    this.assertLive(signal);
    if (
      snap.revision !== t.configRevision ||
      !t.configIdentity ||
      aiIdentity(snap) !== t.configIdentity
    )
      throw new Error('AI 配置已改变，任务暂停。原结果和 Job ID 已保留。');
    return snap;
  }
  private async text(prompt: string, signal: AbortSignal, task?: Task, stage = 'text'): Promise<string> {
    if (task) await this.config(task, signal);
    let attempt = task?.jobs.find((j) => j.stage === stage);
    if (task && attempt?.state === 'consumed') {
      const saved = task.artifacts.find((a) => a.name === `${stage}-response.json`);
      if (!saved) throw new Error('原文字响应记录缺失，不能自动重新请求。');
      const read = await this.services.storage.assets.read({ relativePath: saved.relativePath });
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of read.body) {
        this.assertLive(signal); size += chunk.length;
        if (size > 1024 * 1024) throw new Error('原文字响应超过读取限制。');
        chunks.push(chunk);
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (result.traceId !== attempt.traceId) throw new Error('原文字响应与请求记录不匹配。');
      return this.completedText(result);
    }
    if (attempt && attempt.state !== 'rejected')
      throw new Error('本步骤已有文字请求，不能自动重放。请检查原响应或编辑参数后显式创建新任务。');
    if (task) {
      if (attempt) attempt.state = 'submitting';
      else { attempt = { stage, type: 'text-generate', state: 'submitting' }; task.jobs.push(attempt); }
      await this.save(task);
    }
    try {
    const result = await this.services.ai.scenario.execute(
      {
        type: 'text-generate',
        messages: [
          {
            role: 'system',
            text: 'You are a short-video editor. Follow the user language. Return only the requested content, without markdown fences.',
          },
          { role: 'user', text: prompt },
        ],
        maxTokens: 3000,
      },
      { signal },
    );
    this.assertLive(signal);
    if (task && attempt) {
      attempt.traceId = result.traceId;
      attempt.state = 'consumed';
      await this.document(task, `${stage}-response.json`, result, signal);
      await this.save(task);
      await this.config(task, signal);
    }
    return this.completedText(result);
    } catch (e) {
      if (task && attempt && attempt.state !== 'consumed') {
        const reason = e && typeof e === 'object' && 'reasonCode' in e ? String(e.reasonCode) : '';
        attempt.reasonCode = reason;
        attempt.state = ['AI_MEDIA_OPTION_UNSUPPORTED', 'AI_MEDIA_SPEC_INVALID', 'AI_INPUT_INVALID',
          'SDK_LOCAL_APP_INPUT_INVALID', 'AI_CONFIG_NOT_FOUND', 'AI_CONFIG_REQUIRED']
          .includes(reason.toUpperCase().replaceAll('-', '_')) ? 'rejected' : 'uncertain';
      }
      if (task && this.alive) await this.save(task);
      throw e;
    }
  }
  private completedText(value: unknown): string {
    const result = value as { output?: { type?: string; finishReason?: string; items?: { type?: string; text?: unknown }[] } };
    if (result?.output?.type !== 'text-generate' || result.output.finishReason !== 'stop' || !Array.isArray(result.output.items))
      throw new Error('文字响应未完整结束。请检查已保存响应，编辑参数后创建新任务。');
    const parts = result.output.items.filter((item) => item.type === 'text');
    if (parts.some((item) => typeof item.text !== 'string')) throw new Error('文字响应格式无效。');
    const text = parts.map((item) => item.text).join('').trim();
    if (!text) throw new Error('模型返回了空文字。');
    return text;
  }
  async rewrite(input: unknown, instruction: string) {
    await this.ready;
    const p = validateParams(input);
    const signal = new AbortController().signal;
    return {
      script: await this.text(
        `Rewrite this short video script in ${p.language}. Instruction: ${instruction}\nScript: ${p.script}`,
        signal,
      ),
    };
  }
  private async runJob(
    t: Task,
    stage: string,
    spec: NimiLocalAppScenarioJobSpec,
    signal: AbortSignal,
  ) {
    await this.config(t, signal);
    let record = t.jobs.find((j) => j.stage === stage);
    let job: NimiLocalAppScenarioJob;
    if (record?.id) job = (await this.services.ai.scenarioJobs.get(record.id)).job;
    else if (record?.submissionId) {
      const found = await this.services.ai.scenarioJobs.lookupSubmission(record.submissionId);
      job = found.job;
      record.id = job.jobId;
      record.state = 'known';
      await this.save(t);
    } else {
      if (record && record.state !== 'rejected')
        throw new Error('无 ID 的不确定提交已暂停，请确认原请求。');
      if (record) {
        record.state = 'submitting';
        delete record.reasonCode;
      } else {
        record = {
          stage,
          type: spec.type,
          state: 'submitting',
          ...(spec.type === 'music-generate' ? { submissionId: randomUUID() } : {}),
        };
        t.jobs.push(record);
      }
      await this.save(t);
      try {
        job = (
          await this.services.ai.scenarioJobs.submit(
            spec,
            record.submissionId ? { clientSubmissionId: record.submissionId } : undefined,
          )
        ).job;
        record.id = job.jobId;
        record.state = 'known';
        this.assertLive();
        await this.save(t);
        if (signal.aborted) {
          await this.services.ai.scenarioJobs.cancel(
            job.jobId,
            'Stopped before submission returned',
          );
          signal.throwIfAborted();
        }
      } catch (e) {
        const reason =
          e && typeof e === 'object' && 'reasonCode' in e
            ? String(e.reasonCode)
            : e instanceof Error
              ? e.message
              : '';
        record.reasonCode = reason;
        const normalized = reason.toUpperCase().replaceAll('-', '_');
        if (!record.id)
          record.state = [
            'AI_MEDIA_OPTION_UNSUPPORTED',
            'AI_MEDIA_SPEC_INVALID',
            'AI_INPUT_INVALID',
            'SDK_LOCAL_APP_INPUT_INVALID',
            'AI_CONFIG_NOT_FOUND',
            'AI_CONFIG_REQUIRED',
          ].includes(normalized)
            ? 'rejected'
            : 'uncertain';
        if (this.alive) await this.save(t);
        throw e;
      }
    }
    while (['submitted', 'queued', 'running'].includes(job.status)) {
      await sleep(800, signal);
      job = (await this.services.ai.scenarioJobs.get(job.jobId)).job;
      this.assertLive(signal);
    }
    await this.config(t, signal);
    if (job.status !== 'completed')
      throw new Error(
        `${stage}：${job.reasonDetail || job.reasonCode || job.status} (Job ${job.jobId})`,
      );
    return { job, record };
  }
  private async adopt(
    t: Task,
    job: NimiLocalAppScenarioJob,
    label: string,
    signal: AbortSignal,
  ): Promise<MediaAsset[]> {
    const out: MediaAsset[] = [];
    for (const [i, a] of job.artifacts.entries()) {
      this.assertLive(signal);
      const extension = mimeExt[a.mimeType];
      if (!extension) throw new Error(`无法消费产物类型 ${a.mimeType}`);
      const result = await this.services.storage.assets.adoptArtifact({
        artifactId: a.artifactId,
        relativePath: `tasks/${t.id}/${label}-${i}.${extension}`,
        overwrite: true,
      });
      this.assertLive(signal);
      const asset: MediaAsset = {
        ...result,
        name: `${label}-${i}.${extension}`,
        mediaType: a.mimeType,
        ...(a.durationMs > 0 ? { duration: a.durationMs / 1000 } : {}),
      };
      if (/^(audio|video)\//.test(a.mimeType)) {
        const file = await this.materialize(asset, `${t.id}/inspect/${label}-${i}.${extension}`, signal);
        const info = await this.media.call<Probe>('probe', { file }, signal);
        if (!Number.isFinite(info.duration) || info.duration <= 0)
          throw new Error('生成资产缺少可解码的真实时长。');
        asset.duration = info.duration;
      }
      out.push(asset);
      if (!t.artifacts.some((x) => x.relativePath === asset.relativePath)) t.artifacts.push(asset);
    }
    return out;
  }
  private async consumeFile(
    t: Task,
    file: string,
    label: string,
    mediaType: string,
    signal: AbortSignal,
  ): Promise<MediaAsset> {
    this.assertLive(signal);
    const result = await this.services.storage.assets.write({
      relativePath: `tasks/${t.id}/${label}.${mimeExt[mediaType]}`,
      body: createReadStream(path.join(this.media.paths.scratchRoot, file)),
      mediaType,
      overwrite: true,
    });
    this.assertLive(signal);
    const a = { ...result, name: `${label}.${mimeExt[mediaType]}`, mediaType };
    const index = t.artifacts.findIndex((x) => x.relativePath === a.relativePath);
    if (index >= 0) t.artifacts[index] = a;
    else t.artifacts.push(a);
    return a;
  }
  private async document(t: Task, name: string, value: unknown, signal: AbortSignal) {
    this.assertLive(signal);
    const body = new TextEncoder().encode(
      name.endsWith('.json') ? JSON.stringify(value, null, 2) : String(value),
    );
    const asset = await this.services.storage.assets.write({
      relativePath: `tasks/${t.id}/${name}`,
      body,
      mediaType: name.endsWith('.json')
        ? 'application/json'
        : name.endsWith('.srt')
          ? 'application/x-subrip'
          : 'text/plain',
      overwrite: true,
    });
    this.assertLive(signal);
    const a = {
      ...asset,
      name,
      mediaType: name.endsWith('.json')
        ? 'application/json'
        : name.endsWith('.srt')
          ? 'application/x-subrip'
          : 'text/plain',
    };
    t.artifacts = t.artifacts.filter((x) => x.relativePath !== a.relativePath);
    t.artifacts.push(a);
  }
  private async materialize(a: MediaAsset, file: string, signal: AbortSignal): Promise<string> {
    validateAsset(a);
    this.assertLive(signal);
    const destination = path.join(this.media.paths.scratchRoot, file);
    await mkdir(path.dirname(destination), { recursive: true });
    const result = await this.services.storage.assets.read({ relativePath: a.relativePath });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of result.body) {
      this.assertLive(signal);
      size += chunk.length;
      if (size > 256 * 1024 * 1024) throw new Error('素材超过 256 MB。');
      chunks.push(chunk);
    }
    await writeFile(destination, Buffer.concat(chunks));
    return file;
  }
  private async stage(t: Task, stage: Stage, signal: AbortSignal) {
    this.assertLive(signal);
    t.stage = stage;
    t.progress = STAGES.indexOf(stage) * 15;
    await this.save(t);
    await this.config(t, signal);
  }
  private async synthesize(t: Task, script: string, signal: AbortSignal) {
    const p = t.params;
    let voice = p.voice;
    const config = await this.config(t, signal);
    const synth = config.effectiveSelections.find(
      (s) => s.capabilityContract === 'audio.synthesize',
    );
    const speechInput =
      synth?.resource?.oneofKind === 'local'
        ? synth.resource.local.speechInput
        : synth?.resource?.oneofKind === 'cloud'
          ? synth.resource.cloud.target.speechInput
          : undefined;
    let identityAudio: { artifactId: string } | undefined;
    let performanceAudio: { artifactId: string; text: string } | undefined;
    const uploadReference = async (a: MediaAsset) => {
      validateAsset(a);
      // Explicit rate/channel conversion requires a canonical input. First
      // capture the owned App asset, then transform that returned artifact.
      const captured = await this.services.ai.artifacts.upload({
        mimeType: (a.mediaType === 'audio/x-wav' ? 'audio/wav' : a.mediaType) as 'audio/wav' | 'audio/mpeg' | 'audio/flac',
        source: { kind: 'app-asset', relativePath: a.relativePath },
        audioPreparation: { profile: 'canonical-pcm-v1' },
      });
      this.assertLive(signal);
      if (!captured.audioInfo) throw new Error('参考音频准备没有返回真实时间轴。');
      if (captured.audioInfo.frameCount > captured.audioInfo.sampleRateHz * speechInput!.maxReferenceDurationSeconds)
        throw new Error('参考音频时长超过所选资源的限制。');
      if (captured.audioInfo.sampleRateHz === 24000 && captured.audioInfo.channels === 1) return captured;
      return this.services.ai.artifacts.upload({
        mimeType: 'audio/wav',
        source: { kind: 'artifact', artifactId: captured.artifactId },
        audioPreparation: {
          profile: 'canonical-pcm-v1',
          targetSampleRateHz: 24000,
          channelMode: captured.audioInfo.channels === 2 ? 'STEREO_TO_MONO' : 'PRESERVE',
        },
      });
    };
    if (p.performanceReference) {
      if (!speechInput?.supportsPerformanceAudio)
        throw new Error('当前合成资源未声明独立演绎音频支持。请在Nimi选择支持该输入的资源。');
      if (
        !p.performanceText.trim() ||
        new TextEncoder().encode(p.performanceText).length > speechInput.maxPerformanceTextBytes
      )
        throw new Error('演绎示范需要在资源限值内的真实逐字稿。');
      const uploaded = await uploadReference(p.performanceReference);
      performanceAudio = { artifactId: uploaded.artifactId, text: p.performanceText };
    }
    if (p.voiceReference && speechInput?.supportsIdentityAudio) {
      if (voice) throw new Error('参考声音与既有声音不能同时选择。');
      if (p.referenceText.trim()) throw new Error('当前资源的声音身份条件只接受音频，身份逐字稿不能被忽略。演绎逐字稿请填写在独立演绎栏。');
      const uploaded = await uploadReference(p.voiceReference);
      identityAudio = { artifactId: uploaded.artifactId };
    }

    if (p.voiceReference && !identityAudio) {
      if (voice) throw new Error('参考声音与既有声音不能同时选择。');
      const selected = config.effectiveSelections.find(
        (s) => s.capabilityContract === 'voice.create',
      );
      const resource =
        selected?.resource?.oneofKind === 'local'
          ? selected.resource.local
          : selected?.resource?.oneofKind === 'cloud'
            ? selected.resource.cloud.target
            : undefined;
      const input = resource?.referenceAudioInput;
      if (!input?.supportsBytes)
        throw new Error('当前声音创建资源不接受此本地音频；不会自动发布私有音频作为URI。');
      if (!input.mimeTypes.length) throw new Error('当前声音创建资源未列举支持的音频格式，无法确认此输入。请选取已列明格式的资源。');
      if (!input.mimeTypes.includes(p.voiceReference.mediaType)) throw new Error('参考音频格式不在当前声音资源声明的列表中。');
      if (
        (input.textMode === 'unsupported' && p.referenceText.trim()) ||
        (input.textMode === 'required' && !p.referenceText.trim())
      )
        throw new Error('参考逐字稿与当前声音资源的输入要求不一致。');
      const file = await this.materialize(
        p.voiceReference,
        `${t.id}/voice-reference.${mimeExt[p.voiceReference.mediaType]}`,
        signal,
      );
      const { job, record } = await this.runJob(
        t,
        'voice-create',
        {
          type: 'voice-create',
          creationSource: 'reference-audio',
          referenceAudio: {
            type: 'bytes',
            bytes: new Uint8Array(await readFile(path.join(this.media.paths.scratchRoot, file))),
          },
          referenceAudioMime: p.voiceReference.mediaType,
          languageHints: [p.language],
          preferredName: p.topic.slice(0, 40),
          text: p.referenceText,
        },
        signal,
      );
      const result = await this.services.ai.scenarioJobs.get(job.jobId);
      this.assertLive(signal);
      if (!result.voiceReference) throw new Error('声音创建完成但没有可用引用。');
      voice = { type: 'voice-asset', id: result.voiceReference.voiceAssetId };
      record.state = 'consumed';
      await this.save(t);
    }
    const { job, record } = await this.runJob(
      t,
      'narration',
      {
        type: 'speech-synthesize',
        text: script,
        language: '',
        audioFormat: 'wav',
        emotion: p.emotion,
        voiceRef: voice,
        timingMode: 'none',
        voiceRenderHints: null,
        ...(identityAudio ? { identityAudio } : {}),
        ...(performanceAudio ? { performanceAudio } : {}),
      },
      signal,
    );
    const assets = await this.adopt(t, job, 'original-narration', signal);
    const audio = assets.find((a) => a.mediaType.startsWith('audio/'));
    if (!audio) throw new Error('合成完成但未返回音频。');
    record.state = 'consumed';
    await this.save(t);
    return audio;
  }
  private async pipeline(t: Task, signal: AbortSignal) {
    const p = t.params;
    const business = structuredClone((await this.settings()).business);
    await this.stage(t, 'script', signal);
    if (!t.script)
      t.script = await this.text(
        `Write ${p.paragraphs} paragraph(s) of concise spoken narration in ${p.language} for a short video about: ${p.topic}. ${p.scriptPrompt}`,
        signal,
        t,
        'text-script',
      );
    await this.document(t, 'script.txt', t.script, signal);
    await this.save(t);
    if (p.stopAt === 'script') return;
    await this.stage(t, 'terms', signal);
    if (!t.terms.length && p.materialSource !== 'local') {
      const terms = await this.text(
        `Return only 3 to 8 concise English visual search phrases, in the same order as this script. Use a JSON array or one phrase per line, without commentary:\n${t.script}`,
        signal,
        t,
        'text-terms',
      );
      t.terms = parseVisualTerms(terms);
    }
    await this.document(t, 'terms.json', t.terms, signal);
    await this.save(t);
    if (p.stopAt === 'terms') return;
    await this.stage(t, 'audio', signal);
    const audioFile = `${t.id}/audio.wav`;
    if (!t.audio) {
      if (p.narration === 'none') {
        const info = await this.media.call<{ duration: number }>(
          'silence',
          { duration: p.silentDuration, output: audioFile },
          signal,
        );
        t.audio = await this.consumeFile(t, audioFile, 'audio', 'audio/wav', signal);
        t.audio.duration = info.duration;
      } else {
        const original =
          p.narration === 'upload'
            ? p.audio!
            : p.preview &&
                p.previewKey === narrationKey(p, t.script, t.configIdentity || t.configRevision)
              ? p.preview
              : await this.synthesize(t, t.script, signal);
        const originalFile = await this.materialize(
          original,
          `${t.id}/source-audio.${mimeExt[original.mediaType]}`,
          signal,
        );
        if (p.narration === 'auto' && original === p.preview) {
          await this.materialize(original, audioFile, signal);
          const info = await this.media.call<Probe>('probe', { file: audioFile }, signal);
          t.audio = await this.consumeFile(t, audioFile, 'audio', 'audio/wav', signal);
          t.audio.duration = info.duration;
        } else {
          const info = await this.media.call<{ duration: number }>(
            'prepare-audio',
            { file: originalFile, output: audioFile, speed: p.voiceSpeed },
            signal,
          );
          t.audio = await this.consumeFile(t, audioFile, 'audio', 'audio/wav', signal);
          t.audio.duration = info.duration;
        }
      }
    } else await this.materialize(t.audio, audioFile, signal);
    await this.save(t);
    if (p.stopAt === 'audio') return;
    await this.stage(t, 'subtitle', signal);
    let subtitleFile = '';
    if (p.subtitle && p.narration !== 'none' && !t.cues.length) {
      const split = await this.media.call<{ chunks: { file: string; offset: number }[] }>(
        'split-audio',
        { file: audioFile, prefix: `${t.id}/stt` },
        signal,
      );
      const words: Task['words'] = [];
      const raw: unknown[] = [];
      for (const [i, chunk] of split.chunks.entries()) {
        const { job, record } = await this.runJob(
          t,
          `transcription-${i}`,
          {
            type: 'speech-transcribe',
            mimeType: 'audio/wav',
            language: p.language,
            timestamps: true,
            prompt: '',
            responseFormat: '',
            audioSource: {
              type: 'bytes',
              bytes: new Uint8Array(
                await readFile(path.join(this.media.paths.scratchRoot, chunk.file)),
              ),
            },
          },
          signal,
        );
        if (!job.transcription) throw new Error('转写结果缺少 typed transcription。');
        raw.push({ offset: chunk.offset, transcription: job.transcription });
        await this.document(t, 'transcription-original.json', raw, signal);
        if (job.transcription.status === 'transcribed' && !job.transcription.words.length)
          throw new Error('所选转写资源没有逐词时间轴。请在 AI 配置中选择支持对齐的资源。');
        for (const w of job.transcription.words)
          words.push({
            ...w,
            startSeconds: w.startSeconds + chunk.offset,
            endSeconds: w.endSeconds + chunk.offset,
          });
        record.state = 'consumed';
        await this.save(t);
      }
      t.words = words;
      t.cues = assembleCues(words, p.subtitleMode);
      await this.document(t, 'transcription-original.json', raw, signal);
      await this.document(t, 'words.json', words, signal);
      if (!t.cues.length) t.warnings.push('音频未检测到语音，未生成空字幕文件。');
    }
    if (p.subtitle && t.cues.length) {
      subtitleFile = `${t.id}/subtitle.srt`;
      await mkdir(path.dirname(path.join(this.media.paths.scratchRoot, subtitleFile)), {
        recursive: true,
      });
      const srt = toSrt(t.cues);
      await writeFile(path.join(this.media.paths.scratchRoot, subtitleFile), srt, 'utf8');
      await this.document(t, 'subtitle.srt', srt, signal);
    }
    await this.save(t);
    if (p.stopAt === 'subtitle') return;
    await this.stage(t, 'materials', signal);
    if (!t.materials.length) {
      if (p.materialSource === 'local') {
        if (!p.materials.length) throw new Error('请导入图片或视频素材。');
        t.materials = structuredClone(p.materials);
      } else if (['ai-image', 'ai-video'].includes(p.materialSource)) {
        for (const [i, term] of (t.terms.length ? t.terms : [p.topic]).entries()) {
          let spec: NimiLocalAppScenarioJobSpec;
          if (p.materialSource === 'ai-image')
            spec = {
              type: 'image-generate',
              prompt: `${term}. ${p.topic}`,
              negativePrompt: '',
              n: 1,
              size: '',
              aspectRatio: p.aspect,
              quality: '',
              style: '',
              referenceImages: [],
              referenceImageArtifactId: '',
              mask: '',
              responseFormat: '',
            };
          else {
            const content: Extract<
              NimiLocalAppScenarioJobSpec,
              { type: 'video-generate' }
            >['content'][number][] = [];
            const refs = p.videoMode === 't2v' ? [] : p.materials.filter((a) => a.mediaType.startsWith('image/'));
            if (p.videoMode !== 't2v' && !refs.length)
              throw new Error('图生视频需要导入参考图片。');
            if (p.videoMode === 'i2v-first-last' && refs.length !== 2)
              throw new Error('首尾帧视频需要按顺序导入两张参考图片。');
            for (const [j, a] of refs.entries()) {
              const read = await this.services.storage.assets.read({
                relativePath: a.relativePath,
              });
              const chunks: Uint8Array[] = [];
              for await (const c of read.body) chunks.push(c);
              const uploaded = await this.services.ai.artifacts.upload({
                mimeType: a.mediaType as 'image/png',
                bytes: new Uint8Array(Buffer.concat(chunks)),
              });
              content.push({
                type: 'artifact-ref',
                role:
                  p.videoMode === 'i2v-reference'
                    ? 'reference-image'
                    : j === 0
                      ? 'first-frame'
                      : 'last-frame',
                artifactId: uploaded.artifactId,
              });
              if (p.videoMode === 'i2v-first-frame') break;
            }
            spec = {
              type: 'video-generate',
              prompt: `${term}. ${p.topic}`,
              negativePrompt: '',
              mode: p.videoMode,
              content,
              options: {
                resolution: p.videoResolution,
                ratio: p.aspect,
                durationSec: p.videoDuration,
                generateAudio: p.generateAudio,
              },
            };
          }
          const { job, record } = await this.runJob(t, `material-${i}`, spec, signal);
          t.materials.push(
            ...(await this.adopt(t, job, `material-${i}`, signal)).filter((a) =>
              /^(image|video)\//.test(a.mediaType),
            ).map((asset) => ({ ...asset, source: `Nimi generation prompt: ${term}` })),
          );
          record.state = 'consumed';
          await this.save(t);
        }
      } else {
        const results = await searchStock(
          p.materialSource as 'pexels' | 'pixabay' | 'coverr',
          t.terms,
          business,
          p.aspect,
          signal,
        );
        for (const [i, source] of results.entries()) {
          const response = await fetch(source.url, { signal, redirect: 'error' });
          if (!response.ok) throw new Error(`素材下载失败 (${response.status})`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          const asset = await this.importAsset(source.name, 'video/mp4', bytes);
          asset.source = source.source;
          asset.duration = source.duration;
          t.materials.push(asset);
          await this.save(t);
        }
      }
    }
    if (!t.materials.length) throw new Error('没有可用素材。');
    if (p.matchMaterials) {
      await this.config(t, signal);
      const result = await this.services.ai.scenario.execute(
        { type: 'text-embed', inputs: [t.script, ...t.materials.map((a) => a.source || a.name)] },
        { signal },
      );
      if (
        result.output.type !== 'text-embed' ||
        result.output.vectors.length !== t.materials.length + 1 ||
        !result.output.spaceId
      )
        throw new Error('素材排序未返回同一 embedding space 的完整向量。');
      await this.config(t, signal);
      const [query, ...vectors] = result.output.vectors;
      if (!query.length || vectors.some((v) => v.length !== query.length || v.some((n) => !Number.isFinite(n))))
        throw new Error('素材向量维度或数值不一致。');
      const dot = (a: readonly number[], b: readonly number[]) =>
        a.reduce((s, x, i) => s + x * b[i], 0);
      const score = (v: readonly number[]) =>
        dot(query, v) / (Math.sqrt(dot(query, query) * dot(v, v)) || 1);
      const ranked = t.materials
        .map((a, i) => ({ a, s: score(vectors[i]) }))
        .sort((a, b) => b.s - a.s);
      t.materials = ranked.map((x) => x.a);
      await this.document(t, 'material-ranking.json', {
        spaceId: result.output.spaceId, traceId: result.traceId,
        materials: ranked.map(({ a, s }) => ({ relativePath: a.relativePath, description: a.source || a.name, score: s })),
      }, signal);
    }
    await this.document(t, 'materials.json', t.materials, signal);
    await this.save(t);
    if (p.stopAt === 'materials') return;
    await this.stage(t, 'video', signal);
    const materialFiles: string[] = [];
    const arranged = [
      ...t.materials.slice(t.variant % t.materials.length),
      ...t.materials.slice(0, t.variant % t.materials.length),
    ];
    for (const [i, a] of arranged.entries())
      materialFiles.push(
        await this.materialize(a, `local_videos/${t.id}/${i}.${mimeExt[a.mediaType]}`, signal),
      );
    let music = '';
    if (p.musicVolume > 0 && p.music !== 'none') {
      if (['upload', 'random'].includes(p.music)) {
        if (!p.musicAssets.length) throw new Error('请导入背景音乐。');
        const a =
          p.musicAssets[
            p.music === 'random' ? Math.floor(Math.random() * p.musicAssets.length) : 0
          ];
        music = await this.materialize(a, `${t.id}/music.${mimeExt[a.mediaType]}`, signal);
      } else {
        const snapshot = await this.config(t, signal);
        const profile = musicProfile(snapshot, p);
        let videoReference: { artifactId: string } | undefined;
        if (p.music === 'video') {
          const provisional = await this.media.call<RenderResult>(
            'render',
            {
              params: p,
              materials: materialFiles,
              audio: audioFile,
              subtitle: subtitleFile,
              music: '',
              combined: `${t.id}/condition-combined.mp4`,
              output: `${t.id}/condition.mp4`,
            },
            signal,
          );
          const original = await this.consumeFile(
            t,
            provisional.video,
            'video-condition',
            'video/mp4',
            signal,
          );
          original.duration = provisional.probe.duration;
          await this.save(t);
          const bytes = new Uint8Array(
            await readFile(path.join(this.media.paths.scratchRoot, provisional.video)),
          );
          if (bytes.length > profile.maxVideoReferenceBytes)
            throw new Error('真实条件视频超出所选资源的字节限值；原视频已保留。');
          const uploaded = await this.services.ai.artifacts.upload({
            mimeType: 'video/mp4',
            bytes,
          });
          videoReference = { artifactId: uploaded.artifactId };
        }
        const spec: NimiLocalAppScenarioJobSpec = {
          type: 'music-generate',
          prompt: p.musicPrompt || `Instrumental soundtrack for ${p.topic}`,
          lyrics: '',
          ...(videoReference
            ? { videoReference }
            : {
                instrumental: true,
                durationSeconds: Math.max(
                  3,
                  Math.min(
                    profile.maxDurationSeconds,
                    Math.ceil(t.audio!.duration || p.silentDuration),
                  ),
                ),
              }),
        };
        const { job, record } = await this.runJob(t, 'music', spec, signal);
        if (!job.musicGeneration) throw new Error('音乐完成但没有结束信息。');
        t.musicGeneration = job.musicGeneration;
        const all = await this.adopt(t, job, 'music-original', signal);
        const mixIndex = job.artifacts.findIndex(
          (a) => a.artifactId === job.musicGeneration!.mixArtifactId,
        );
        const mix = all[mixIndex];
        if (!mix) throw new Error('音乐 mix artifact 缺失。');
        music = await this.materialize(mix, `${t.id}/music.${mimeExt[mix.mediaType]}`, signal);
        record.state = 'consumed';
        await this.save(t);
      }
    }
    const render = await this.media.call<RenderResult>(
      'render',
      {
        params: p,
        materials: materialFiles,
        audio: audioFile,
        subtitle: subtitleFile,
        music,
        combined: `${t.id}/combined.mp4`,
        output: `${t.id}/final.mp4`,
      },
      signal,
    );
    const combined = await this.consumeFile(t, render.combined, 'combined', 'video/mp4', signal);
    const final = await this.consumeFile(t, render.video, 'final', 'video/mp4', signal);
    final.duration = render.probe.duration;
    await this.document(t, 'output-info.json', render.probe, signal);
    if (!render.musicMixed) throw new Error('视频已保留，但请求的配乐混音失败。');
    await this.save(t);
  }
  async preview(input: unknown, text: string) {
    await this.ready;
    const originalScript = String((input as ProductionParams).script || '').trim();
    text = text.trim();
    const p = validateParams({ ...(input as object), script: text });
    if (!this.media.availability().available) throw new Error('媒体运行条件不完整，请先准备 Python 与 FFmpeg。');
    const config = await this.services.aiConfig.get();
    const now = new Date().toISOString();
    const t: Task = {
      id: randomUUID(),
      params: p,
      configRevision: config.revision,
      configIdentity: aiIdentity(config),
      variant: 0,
      createdAt: now,
      updatedAt: now,
      state: 'running',
      stage: 'audio',
      progress: 0,
      script: text,
      terms: [],
      materials: [],
      cues: [],
      words: [],
      artifacts: [],
      jobs: [],
      warnings: [],
    };
    this.tasks.set(t.id, t);
    const control = new AbortController();
    this.previewWork.set(t.id, control);
    await this.save(t);
    try {
      const a = await this.synthesize(t, text, control.signal);
      const source = await this.materialize(
        a,
        `${t.id}/preview-source.${mimeExt[a.mediaType]}`,
        control.signal,
      );
      const file = `${t.id}/preview.wav`;
      const info = await this.media.call<{ duration: number }>(
        'prepare-audio',
        { file: source, output: file, speed: p.voiceSpeed },
        control.signal,
      );
      const asset = await this.consumeFile(t, file, 'preview', 'audio/wav', control.signal);
      asset.duration = info.duration;
      t.audio = asset;
      t.state = 'complete';
      t.progress = 100;
      await this.save(t);
      return {
        asset,
        key: narrationKey(p, text, aiIdentity(config)),
        fullScript: text === originalScript,
      };
    } catch (e) {
      if (this.alive) {
        t.state = control.signal.aborted ? 'stopped' : 'paused';
        t.error = String(e);
        await this.save(t);
      }
      throw e;
    } finally {
      this.previewWork.delete(t.id);
    }
  }
  async publish(id: string, title: string, platforms: string[], options: Record<string, unknown>) {
    await this.ready;
    const t = this.task(id);
    if (t.state !== 'complete') throw new Error('请先完成成片。');
    const video = t.artifacts.find((a) => a.name === 'final.mp4');
    if (!video) throw new Error('没有完整成片。');
    if (t.publish && ['submitting', 'unconfirmed', 'processing'].includes(t.publish.state))
      throw new Error('原上传尚未确认，请查询原 request_id。');
    const settings = (await this.settings()).business;
    validatePublication(title, platforms, options, settings);
    const requestId = randomUUID();
    const submission = { requestId, platforms, account: settings.uploadPostUser };
    t.publish = { state: 'submitting', results: submission };
    await this.save(t);
    try {
      const body = await this.services.storage.assets.read({ relativePath: video.relativePath });
      const chunks: Uint8Array[] = [];
      for await (const c of body.body) chunks.push(c);
      this.assertLive();
      t.publish = { state: 'unconfirmed', results: submission };
      await this.save(t);
      const results = await publishVideo(
        new Uint8Array(Buffer.concat(chunks)),
        title,
        platforms,
        options,
        settings,
        requestId,
      );
      this.assertLive();
      t.publish = { state: results.state, error: results.error, results: { ...results, account: submission.account } };
      await this.save(t);
      return t.publish;
    } catch (e) {
      t.publish = { ...t.publish!, state: 'unconfirmed', error: String(e) };
      if (this.alive) await this.save(t);
      throw e;
    }
  }
  async publicationStatus(id: string) {
    const t = this.task(id);
    const saved = t.publish?.results as { requestId?: string; platforms?: string[]; account?: string };
    if (!saved?.requestId || !saved.platforms?.length || !saved.account) throw new Error('没有完整上传请求记录。');
    const settings = (await this.settings()).business;
    if (settings.uploadPostUser !== saved.account) throw new Error('业务账号已变更，请恢复原上传账号再查询。');
    const result = await pollPublication(saved.requestId, saved.platforms, settings);
    this.assertLive();
    t.publish = { state: result.state, error: result.error, results: { ...saved, ...result } };
    await this.save(t);
    return t.publish;
  }
  async copyMetadata(id: string) {
    const t = this.task(id);
    return {
      text: await this.text(
        `Return a social post title and description in ${t.params.language}, based on this script: ${t.script}`,
        new AbortController().signal,
      ),
    };
  }
  async readArtifact(id: string, name: string, offset = 0, length = 32768) {
    await this.ready;
    this.assertLive();
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 32768)
      throw new Error('产物读取范围无效，单次最多32 KiB。');
    const asset = this.task(id).artifacts.find((a) => a.name === name);
    if (!asset) throw new Error('该文件不属于任务的已保存产物。');
    const record = await this.services.storage.assets.stat(asset.relativePath);
    this.assertLive();
    if (offset > record.sizeBytes) throw new Error('读取位置超过实际产物长度。');
    const take = Math.min(length, record.sizeBytes - offset);
    const chunks: Uint8Array[] = [];
    let received = 0;
    if (take) {
      const read = await this.services.storage.assets.read({ relativePath: record.relativePath, offset, length: take });
      if (read.asset.sha256 !== record.sha256) throw new Error('产物已改变，请重新读取。');
      for await (const chunk of read.body) {
        this.assertLive();
        received += chunk.length;
        if (received > take) throw new Error('产物流超过请求范围。');
        chunks.push(chunk);
      }
      if (received !== take) throw new Error('产物流未完整结束。');
    }
    this.assertLive();
    return { name: asset.name, relativePath: record.relativePath, mediaType: asset.mediaType,
      offset, length: received, totalSize: record.sizeBytes, sha256: record.sha256,
      dataBase64: Buffer.concat(chunks).toString('base64'), nextOffset: offset + received,
      eof: offset + received === record.sizeBytes };
  }
  invalidate() {
    this.alive = false;
    this.queue = [];
    for (const a of [...this.aborts.values(), ...this.previewWork.values()])
      a.abort(new Error('Nimi 会话已失效。'));
    void this.media.stop().catch(() => {});
  }
  async close() {
    this.invalidate();
    await this.media.dispose();
  }
}
