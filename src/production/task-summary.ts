import { defaultParams, type Task, type ProductionParams, type MediaAsset } from './types.js';

/** Project only creation fields, never adjacent/unknown settings or credentials. */
export function publicCreationParams(value: ProductionParams): ProductionParams {
  const params = Object.fromEntries(Object.keys(defaultParams).map(key => [key, value[key as keyof ProductionParams]])) as ProductionParams;
  const asset = (a: MediaAsset): MediaAsset => ({ relativePath: a.relativePath, name: a.name, mediaType: a.mediaType, sizeBytes: a.sizeBytes,
    ...(a.duration === undefined ? {} : { duration: a.duration }), ...(a.source === undefined ? {} : { source: a.source }) });
  params.materials = params.materials.map(asset);
  params.musicAssets = params.musicAssets.map(asset);
  for (const field of ['audio','voiceReference','performanceReference','preview'] as const) if (params[field]) params[field] = asset(params[field]);
  if (params.voice) params.voice = { type: params.voice.type, id: params.voice.id };
  return structuredClone(params);
}

/** App-owned list projection; full scripts, timelines and media are read on selection. */
export function summarizeTask(t: Task) {
  return {
    id: t.id, topic: t.params.topic.slice(0, 256), createdAt: t.createdAt, updatedAt: t.updatedAt,
    state: t.state, stage: t.stage, progress: t.progress, variant: t.variant,
    aspect: t.params.aspect, stopAt: t.params.stopAt,
    artifactCount: t.artifacts.length, hasFinalVideo: t.artifacts.some(a => a.name === 'final.mp4'),
    ...(t.error ? { error: t.error.slice(0, 512) } : {}),
  };
}
export type TaskSummary = ReturnType<typeof summarizeTask>;
export type BusinessReadiness = Readonly<{ pexels: boolean; pixabay: boolean; coverr: boolean; uploadPost: boolean }>;
export type StudioSnapshot = Readonly<{
  tasks: TaskSummary[]; nextCursor: string | null; taskCount: number; activeCount: number;
  voiceRevision: string; media: { available: boolean; missing: string[] };
}>;
