export type Stage = 'script' | 'terms' | 'audio' | 'subtitle' | 'materials' | 'video';
export const STAGES: Stage[] = ['script', 'terms', 'audio', 'subtitle', 'materials', 'video'];
export type MediaAsset = {
  relativePath: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  duration?: number;
  source?: string;
};
export type Cue = { text: string; start: number; end: number };
export type ProductionParams = {
  topic: string;
  script: string;
  language: string;
  paragraphs: number;
  scriptPrompt: string;
  terms: string[];
  order: 'sequential' | 'random';
  matchMaterials: boolean;
  materialSource: 'local' | 'pexels' | 'pixabay' | 'coverr' | 'ai-image' | 'ai-video';
  materials: MediaAsset[];
  aspect: '9:16' | '16:9' | '1:1';
  clipDuration: number;
  clipSpeed: number;
  fit: 'cover' | 'contain';
  transition: string;
  videoMode: 't2v' | 'i2v-first-frame' | 'i2v-first-last' | 'i2v-reference';
  videoResolution: string;
  videoDuration: number;
  generateAudio: boolean;
  narration: 'auto' | 'upload' | 'none';
  audio: MediaAsset | null;
  silentDuration: number;
  voice: { type: 'preset' | 'voice-asset'; id: string } | null;
  voiceSpeed: number;
  voiceVolume: number;
  emotion: string;
  voiceReference: MediaAsset | null;
  referenceText: string;
  performanceReference: MediaAsset | null;
  performanceText: string;
  subtitle: boolean;
  subtitleMode: 'sentence' | 'word_by_word';
  animation: 'none' | 'pop_spring';
  subtitlePosition: 'top' | 'center' | 'bottom' | 'custom';
  subtitleY: number;
  fontSize: number;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  background: string;
  roundedBackground: boolean;
  music: 'none' | 'upload' | 'random' | 'ai' | 'video';
  musicAssets: MediaAsset[];
  musicVolume: number;
  musicPrompt: string;
  batch: number;
  stopAt: Stage;
  preview: MediaAsset | null;
  previewKey: string;
};
export const defaultParams: ProductionParams = {
  topic: '',
  script: '',
  language: 'zh',
  paragraphs: 1,
  scriptPrompt: '',
  terms: [],
  order: 'sequential',
  matchMaterials: false,
  materialSource: 'local',
  materials: [],
  aspect: '9:16',
  clipDuration: 5,
  clipSpeed: 1,
  fit: 'cover',
  transition: '',
  videoMode: 't2v',
  videoResolution: '720p',
  videoDuration: 5,
  generateAudio: false,
  narration: 'auto',
  audio: null,
  silentDuration: 15,
  voice: null,
  voiceSpeed: 1,
  voiceVolume: 1,
  emotion: '',
  voiceReference: null,
  referenceText: '',
  performanceReference: null,
  performanceText: '',
  subtitle: true,
  subtitleMode: 'sentence',
  animation: 'none',
  subtitlePosition: 'bottom',
  subtitleY: 75,
  fontSize: 60,
  textColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 2,
  background: '',
  roundedBackground: false,
  music: 'none',
  musicAssets: [],
  musicVolume: 0.2,
  musicPrompt: '',
  batch: 1,
  stopAt: 'video',
  preview: null,
  previewKey: '',
};
export type BusinessSettings = {
  pexelsKey: string;
  pixabayKey: string;
  coverrKey: string;
  uploadPostKey: string;
  uploadPostUser: string;
  uploadPlatforms: string[];
};
export const defaultBusiness: BusinessSettings = {
  pexelsKey: '',
  pixabayKey: '',
  coverrKey: '',
  uploadPostKey: '',
  uploadPostUser: '',
  uploadPlatforms: [],
};
export type JobRecord = {
  stage: string;
  id?: string;
  submissionId?: string;
  reasonCode?: string;
  traceId?: string;
  state: 'submitting' | 'known' | 'consumed' | 'uncertain' | 'rejected';
  type: string;
};
export type Task = {
  id: string;
  createdAt: string;
  updatedAt: string;
  params: ProductionParams;
  configRevision: string;
  configIdentity?: string;
  variant: number;
  state: 'queued' | 'running' | 'complete' | 'failed' | 'paused' | 'stopped';
  stage: Stage;
  progress: number;
  script: string;
  terms: string[];
  audio?: MediaAsset;
  materials: MediaAsset[];
  cues: Cue[];
  words: { text: string; startSeconds: number; endSeconds: number }[];
  artifacts: MediaAsset[];
  jobs: JobRecord[];
  error?: string;
  warnings: string[];
  musicGeneration?: unknown;
  publish?: { state: string; results?: unknown; error?: string };
};
export function narrationKey(p: ProductionParams, script: string, configRevision: string) {
  return JSON.stringify([
    script,
    p.language,
    p.voice,
    p.voiceSpeed,
    p.emotion,
    p.voiceReference?.relativePath,
    p.referenceText,
    p.performanceReference?.relativePath,
    p.performanceText,
    configRevision,
  ]);
}
export function validateParams(input: unknown): ProductionParams {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('请填写创作参数。');
  if (Object.keys(input).some((key) => !Object.hasOwn(defaultParams, key)))
    throw new Error('创作参数包含未支持的字段。');
  const p = structuredClone(input) as ProductionParams;
  for (const [key, choices] of Object.entries({
    aspect: ['9:16', '16:9', '1:1'],
    narration: ['auto', 'upload', 'none'],
    materialSource: ['local', 'pexels', 'pixabay', 'coverr', 'ai-image', 'ai-video'],
    order: ['sequential', 'random'],
    fit: ['cover', 'contain'],
    subtitleMode: ['sentence', 'word_by_word'],
    animation: ['none', 'pop_spring'],
    subtitlePosition: ['top', 'center', 'bottom', 'custom'],
    music: ['none', 'upload', 'random', 'ai', 'video'],
    stopAt: STAGES,
    videoMode: ['t2v', 'i2v-first-frame', 'i2v-first-last', 'i2v-reference'],
    transition: ['', 'Shuffle', 'FadeIn', 'FadeOut', 'SlideIn', 'SlideOut', 'ZoomIn', 'ZoomOut'],
  })) {
    if (!(choices as readonly string[]).includes(String(p[key as keyof ProductionParams])))
      throw new Error(`无效创作选项：${key}`);
  }
  for (const [key, min, max] of [
    ['batch', 1, 8],
    ['paragraphs', 1, 10],
    ['silentDuration', 0.2, 600],
    ['clipDuration', 1, 30],
    ['clipSpeed', 0.25, 4],
    ['voiceSpeed', 0.5, 2],
    ['voiceVolume', 0, 2],
    ['musicVolume', 0, 2],
    ['fontSize', 12, 160],
    ['strokeWidth', 0, 10],
    ['subtitleY', 0, 100],
    ['videoDuration', 1, 30],
  ] as const) {
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max)
      throw new Error(`${key} 必须在 ${min}–${max} 之间。`);
  }
  if (!Number.isInteger(p.batch) || !Number.isInteger(p.paragraphs))
    throw new Error('批量和段落数必须为整数。');
  for (const key of ['matchMaterials', 'generateAudio', 'subtitle', 'roundedBackground'] as const)
    if (typeof p[key] !== 'boolean') throw new Error(`无效开关参数：${key}`);
  for (const key of [
    'topic',
    'script',
    'language',
    'scriptPrompt',
    'musicPrompt',
    'referenceText',
    'performanceText',
    'emotion',
    'videoResolution',
    'previewKey',
  ] as const) {
    if (typeof p[key] !== 'string' || p[key].length > 16000)
      throw new Error(`无效文字参数：${key}`);
  }
  if (!p.topic.trim() && !p.script.trim()) throw new Error('请填写主题或手工脚本。');
  if (
    !Array.isArray(p.terms) ||
    p.terms.length > 50 ||
    p.terms.some((x) => typeof x !== 'string' || x.length > 200)
  )
    throw new Error('关键词最多 50 个，每个最多 200 字。');
  for (const key of ['materials', 'musicAssets'] as const) {
    if (!Array.isArray(p[key]) || p[key].length > 100) throw new Error('素材数量超限。');
    p[key].forEach(validateAsset);
  }
  for (const asset of [p.audio, p.voiceReference, p.performanceReference, p.preview])
    if (asset) validateAsset(asset);
  for (const color of [p.textColor, p.strokeColor, p.background])
    if (typeof color !== 'string' || (color && !/^#[0-9a-f]{6}$/i.test(color))) throw new Error('颜色须为 #RRGGBB。');
  if (!p.textColor || !p.strokeColor) throw new Error('请指定字幕文字与描边颜色。');
  if (p.materials.some((a) => !/^(image|video)\//.test(a.mediaType))) throw new Error('画面素材需要图片或视频。');
  if ([p.audio, p.voiceReference, p.performanceReference, p.preview, ...p.musicAssets].some((a) => a && !a.mediaType.startsWith('audio/')))
    throw new Error('配音、参考音频和背景音乐需要音频素材。');
  if (STAGES.indexOf(p.stopAt) >= STAGES.indexOf('audio') && p.narration === 'upload' && !p.audio)
    throw new Error('请上传配音音频。');
  if (
    p.voice &&
    (!['preset', 'voice-asset'].includes(p.voice.type) ||
      typeof p.voice.id !== 'string' ||
      !p.voice.id.trim())
  )
    throw new Error('无效声音引用。');
  return p;
}
export function validateAsset(a: MediaAsset) {
  if (
    !a ||
    typeof a.relativePath !== 'string' ||
    !/^(imports|tasks|previews)\/[a-zA-Z0-9_./-]+$/.test(a.relativePath) ||
    a.relativePath.split('/').includes('..')
  )
    throw new Error('素材路径不属于本 App 项目资产。');
  if (
    !/^(image|audio|video)\//.test(a.mediaType) &&
    !['application/json', 'application/x-subrip', 'text/plain'].includes(a.mediaType)
  )
    throw new Error('不支持的媒体格式。');
}
