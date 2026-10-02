import type { BusinessSettings } from '../src/production/types.js';
type Stock = { url: string; name: string; source: string; duration: number };
const record = (v: unknown): Record<string, any> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('业务服务返回了无效响应。');
  return v as Record<string, any>;
};
export async function searchStock(
  provider: 'pexels' | 'pixabay' | 'coverr',
  terms: string[],
  settings: BusinessSettings,
  aspect: string,
  signal: AbortSignal,
): Promise<Stock[]> {
  const key = settings[`${provider}Key`];
  if (!key) throw new Error(`请在业务设置中填写 ${provider} API key。`);
  const results: Stock[] = [];
  const orientation = aspect === '9:16' ? 'portrait' : aspect === '16:9' ? 'landscape' : 'square';
  const matches = (w: number, h: number) =>
    w >= 470 &&
    h >= 470 &&
    (aspect === '9:16' ? h > w : aspect === '16:9' ? w > h : Math.abs(w / h - 1) < 0.12);
  for (const term of terms.slice(0, 20)) {
    let url: URL;
    const headers: Record<string, string> = {};
    if (provider === 'pexels') {
      url = new URL('https://api.pexels.com/v1/videos/search');
      url.search = new URLSearchParams({ query: term, per_page: '20', orientation }).toString();
      headers.Authorization = key;
    } else if (provider === 'pixabay') {
      url = new URL('https://pixabay.com/api/videos/');
      url.search = new URLSearchParams({
        q: term,
        key,
        per_page: '20',
        video_type: 'all',
      }).toString();
    } else {
      url = new URL('https://api.coverr.co/videos');
      url.search = new URLSearchParams({
        query: term,
        page_size: '20',
        urls: 'true',
        sort: 'popular',
        ...(aspect !== '1:1' ? { filter: `is_vertical:${aspect === '9:16'}` } : {}),
      }).toString();
      headers.Authorization = `Bearer ${key}`;
    }
    let response: Response;
    try {
      response = await fetch(url, { headers, signal, redirect: 'error' });
    } catch {
      signal.throwIfAborted();
      throw new Error(`${provider} 网络请求失败，请检查账户与网络。`);
    }
    if (!response.ok) throw new Error(`${provider} 搜索失败 (${response.status})。`);
    const body = record(await response.json());
    const list = provider === 'pexels' ? body.videos : body.hits;
    if (!Array.isArray(list)) throw new Error(`${provider} 搜索响应缺少素材列表。`);
    for (const value of list) {
      const v = record(value);
      let link = '',
        w = 0,
        h = 0;
      if (provider === 'pexels') {
        const files = Array.isArray(v.video_files) ? v.video_files : [];
        const file = files
          .filter(
            (x: any) => x.file_type === 'video/mp4' && matches(Number(x.width), Number(x.height)),
          )
          .sort((a: any, b: any) => a.width * a.height - b.width * b.height)[0];
        if (file) {
          link = file.link;
          w = file.width;
          h = file.height;
        }
      } else if (provider === 'pixabay') {
        const files = Object.values(v.videos || {}) as any[];
        const file = files
          .filter((x) => matches(Number(x.width), Number(x.height)))
          .sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (file) {
          link = file.url;
          w = file.width;
          h = file.height;
        }
      } else {
        link = v.urls?.mp4_download;
        w = Number(v.max_width);
        h = Number(v.max_height);
      }
      const duration = Number(v.duration);
      if (typeof link !== 'string' || !Number.isFinite(duration) || duration <= 0 || !matches(w, h))
        continue;
      const parsed = new URL(link);
      if (parsed.protocol !== 'https:') continue;
      const page =
        provider === 'pexels' ? v.url : provider === 'pixabay' ? v.pageURL : v.canonical_url;
      let credit = '';
      if (typeof page === 'string') {
        try {
          const publicPage = new URL(page);
          if (publicPage.protocol === 'https:' && !publicPage.username && !publicPage.password)
            credit = ` · ${publicPage.origin}${publicPage.pathname}`;
        } catch { /* A download is usable without a public credit URL. */ }
      }
      // Signed download URLs remain transient; project metadata retains public credit only.
      results.push({
        url: link,
        name: `${term}-${String(v.id)}.mp4`,
        source: `${provider} · ${term}${credit}`,
        duration,
      });
      if (results.filter((x) => x.name.startsWith(term + '-')).length >= 2) break;
    }
  }
  if (!results.length)
    throw new Error(`${provider} 没有返回匹配画幅的可用素材，请调整关键词或选择本地素材。`);
  return results;
}
const platformsAllowed = [
  'youtube',
  'tiktok',
  'instagram',
  'facebook',
  'linkedin',
  'x',
  'pinterest',
  'threads',
];
export function publicationOutcome(body: Record<string, any>, expected: string[]) {
  const entries = Array.isArray(body.results)
    ? body.results
    : Object.entries(body.results || {}).map(([platform, value]) => ({
        ...record(value),
        platform,
      }));
  const failures = expected.filter(
    (p) => !entries.some((e: any) => e.platform === p && e.success === true &&
      e.skipped !== true && e.fallback_to_inbox !== true && e.status !== 'skipped' &&
      !['failed', 'retryable', 'queued', 'processing'].includes(e.status)),
  );
  return failures.length
    ? { state: 'failed', error: `发布失败、跳过、送入草稿或缺少回执：${failures.join('、')}` }
    : { state: 'complete', error: '' };
}
export function validatePublication(title: string, platforms: string[],
  options: Record<string, unknown>, settings: BusinessSettings) {
  if (!settings.uploadPostKey || !settings.uploadPostUser)
    throw new Error('请填写 Upload-Post 业务账号。');
  if (!platforms.length || platforms.some((p) => !platformsAllowed.includes(p)) ||
      new Set(platforms).size !== platforms.length || !title.trim() || title.length > 2200)
    throw new Error('发布平台或标题无效。');
  if (platforms.includes('youtube') && (typeof options.madeForKids !== 'boolean' ||
      !['public', 'private', 'unlisted'].includes(String(options.privacy))))
    throw new Error('请填写 YouTube 隐私和儿童受众声明。');
}
export async function publishVideo(
  bytes: Uint8Array,
  title: string,
  platforms: string[],
  options: Record<string, unknown>,
  settings: BusinessSettings,
  requestId: string,
) {
  validatePublication(title, platforms, options, settings);
  const form = new FormData();
  form.append(
    'video',
    new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }),
    'MoneyPrinterTurbo.mp4',
  );
  form.append('user', settings.uploadPostUser);
  form.append('request_id', requestId);
  form.append('title', title);
  form.append('async_upload', 'true');
  for (const p of platforms) form.append('platform[]', p);
  if (platforms.includes('youtube')) {
    form.append('selfDeclaredMadeForKids', String(options.madeForKids));
    form.append('privacyStatus', String(options.privacy));
    form.append('containsSyntheticMedia', 'true');
  }
  const response = await fetch('https://api.upload-post.com/api/upload', {
    method: 'POST',
    headers: { Authorization: `Apikey ${settings.uploadPostKey}` },
    body: form,
    redirect: 'error',
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok)
    throw new Error(`Upload-Post 请求未确认 (${response.status})，查询原 request_id。`);
  const body = record(await response.json());
  if (body.success !== true) throw new Error('Upload-Post 未确认成功，请查询原 request_id。');
  return {
    requestId: typeof body.request_id === 'string' ? body.request_id : requestId,
    platforms,
    ...(body.results ? publicationOutcome(body, platforms) : { state: 'processing', error: '' }),
    output: body,
  };
}
export async function pollPublication(requestId: string, platforms: string[], settings: BusinessSettings) {
  if (!settings.uploadPostKey) throw new Error('请填写 Upload-Post API key。');
  const url = new URL('https://api.upload-post.com/api/uploadposts/status');
  url.searchParams.set('request_id', requestId);
  const response = await fetch(url, {
    headers: { Authorization: `Apikey ${settings.uploadPostKey}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Upload-Post 状态查询失败 (${response.status})。`);
  const body = record(await response.json());
  return {
    requestId,
    ...(body.status === 'completed' ? publicationOutcome(body, platforms) :
      { state: body.status === 'failed' ? 'failed' : 'processing', error: body.status === 'failed' ? String(body.message || '发布失败。') : '' }),
    output: body,
  };
}
