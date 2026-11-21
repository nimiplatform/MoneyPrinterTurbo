import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import {
  Film,
  Plus,
  SlidersHorizontal,
  Settings,
  History,
  Play,
  StopCircle,
  ChevronUp,
  ChevronDown,
  Upload,
  Volume2,
  ArrowUpRight,
  RefreshCw,
  FileText,
  Trash2,
  Music2,
  Captions,
  FolderOpen,
} from 'lucide-react';
import { ModelConfigAIConfigSurface } from '@nimiplatform/kit/features/model-config';
import type { NimiAIConfigSnapshot } from '@nimiplatform/sdk/ai';
import { useStudioPlatform } from './platform.js';
import { saveCreationDefaults, submitProductionBatch } from './actions.js';
import type { StudioSnapshot, TaskSummary, BusinessReadiness } from './task-summary.js';
import {
  defaultParams,
  defaultBusiness,
  STAGES,
  type BusinessSettings,
  type Cue,
  type MediaAsset,
  type ProductionParams,
  type Task,
} from './types.js';
const stageLabels = {
  script: '脚本',
  terms: '关键词',
  audio: '配音',
  subtitle: '字幕',
  materials: '素材',
  video: '成片',
};
const stateLabels = {
  queued: '排队中',
  running: '制作中',
  complete: '已完成',
  failed: '失败',
  paused: '已暂停',
  stopped: '已停止',
};
const contracts = [
  'text.generate',
  'text.embed',
  'audio.synthesize',
  'audio.transcribe',
  'voice.create',
  'image.generate',
  'video.generate',
  'music.generate',
];
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-label'?: string }>, { 'aria-label': label })
    : children;
  return (
    <label className="field">
      <span>{label}</span>
      {control}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function MediaPlayer({ asset }: { asset: MediaAsset }) {
  const { openMedia } = useStudioPlatform();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setUrl(''); setError('');
    let alive = true;
    let handle: Awaited<ReturnType<typeof openMedia>> | undefined;
    void openMedia(asset)
      .then((result) => {
        handle = result;
        if (alive) setUrl(result.url);
        else void result.revoke();
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
      void handle?.revoke();
    };
  }, [asset.relativePath, openMedia]);
  if (error) return <p role="alert">预览无法打开：{error}</p>;
  if (!url) return <p className="muted">加载预览…</p>;
  return asset.mediaType.startsWith('video/') ? (
    <video src={url} controls playsInline preload="metadata" aria-label={asset.name} />
  ) : asset.mediaType.startsWith('audio/') ? (
    <audio src={url} controls preload="metadata" aria-label={asset.name} />
  ) : (
    <img src={url} alt={asset.name} />
  );
}
function UploadInput({
  label,
  accept,
  multiple = false,
  onFiles,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => Promise<void>;
}) {
  const { connected } = useStudioPlatform();
  return (
    <label className="file-action">
      <Upload size={16} />
      <span>{label}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={!connected}
        onChange={(event) => {
          const files = [...(event.currentTarget.files || [])];
          void onFiles(files);
          event.currentTarget.value = '';
        }}
      />
    </label>
  );
}
type StudioView = 'create' | 'history' | 'settings' | 'ai';
export function Studio() {
  const platform = useStudioPlatform();
  const { command, client } = platform;
  const [view, setView] = useState<StudioView>('create');
  const viewRef = useRef(view);
  viewRef.current = view;
  const [p, setP] = useState<ProductionParams>(structuredClone(defaultParams));
  const [business, setBusiness] = useState<BusinessSettings>({ ...defaultBusiness });
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [current, setCurrent] = useState<Task>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [taskCount, setTaskCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [voiceRevision, setVoiceRevision] = useState('');
  const [businessStatus, setBusinessStatus] = useState<BusinessReadiness>();
  const settingsLoaded = useRef(false);
  const [selected, setSelected] = useState<string>('');
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const loadedMore = useRef(false);
  const resultPanel = useRef<HTMLElement>(null);
  const showResults = () => resultPanel.current?.scrollIntoView({ block: 'start' });
  const selectTask = (id: string) => {
    setSelected(id);
    if (matchMedia('(max-width: 700px)').matches) showResults();
  };
  const [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  const [errorScope, setErrorScope] = useState<StudioView | null>(null);
  const [notice, updateNotice] = useState<{ message: string; scope: StudioView } | null>(null);
  const setNotice = (message: string, scope = view) => updateNotice({ message, scope });
  const navigate = (next: StudioView) => {
    setError('');
    updateNotice(null);
    setView(next);
  };
  const [pending, setPending] = useState(false);
  const [media, setMedia] = useState<{ available: boolean; missing: string[] }>();
  const [config, setConfig] = useState<NimiAIConfigSnapshot>();
  const [termDraft, setTermDraft] = useState('');
  const [voices, setVoices] = useState<
    { type: 'preset' | 'voice-asset'; id: string; name: string }[]
  >([]);
  const [revision, setRevision] = useState('');
  const [cueDraft, setCueDraft] = useState<Cue[]>([]);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [privacy, setPrivacy] = useState('private');
  const [madeForKids, setMadeForKids] = useState(false);
  const [jobDetails, setJobDetails] = useState('');
  useEffect(() => setTermDraft(p.terms.join(', ')), [p.terms]);
  const patch = <K extends keyof ProductionParams>(key: K, value: ProductionParams[K]) =>
    setP((previous) => ({ ...previous, [key]: value }));
  const act = useCallback(async (fn: () => Promise<void>) => {
    if (!platform.connected) { setErrorScope(null); setError('PC 已断开。请先连接；未提交的编辑仍保留在此页面。'); return; }
    const origin = viewRef.current;
    setPending(true);
    setError('');
    updateNotice(null);
    try {
      await fn();
    } catch (e) {
      setErrorScope(origin);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }, [platform.connected]);
  const refresh = useCallback(async () => {
    if (!settingsLoaded.current) {
      const settings = await command<{ params: ProductionParams; business?: BusinessSettings; businessStatus?: BusinessReadiness }>('settings');
      setP({ ...structuredClone(defaultParams), ...settings.params });
      if (settings.business) setBusiness(settings.business);
      setBusinessStatus(settings.businessStatus);
      settingsLoaded.current = true;
    }
    const result = await command<StudioSnapshot>('snapshot');
    setTasks(previous => [...result.tasks, ...previous.filter(task => !result.tasks.some(next => next.id === task.id))]);
    if (!loadedMore.current) setNextCursor(result.nextCursor);
    setTaskCount(result.taskCount);
    setActiveCount(result.activeCount);
    setVoiceRevision(result.voiceRevision);
    setMedia(result.media);
    const id = selectedRef.current;
    if (id) {
      const task = await command<Task>('task', { id });
      if (selectedRef.current === id) setCurrent(task);
    }
    setReadError('');
  }, [command]);
  const loadMore = async () => {
    if (!nextCursor) return;
    const page = await command<StudioSnapshot>('snapshot', { cursor: nextCursor, limit: 50 });
    loadedMore.current = true;
    setTasks(previous => [...previous, ...page.tasks.filter(task => !previous.some(saved => saved.id === task.id))]);
    setNextCursor(page.nextCursor);
  };
  useEffect(() => {
    if (!selected) { setCurrent(undefined); return; }
    if (current?.id !== selected) setCurrent(undefined);
    if (!platform.connected) return;
    let active = true;
    void command<Task>('task', { id: selected }).then(task => { if (active) setCurrent(task); }, cause => {
      if (active) { setErrorScope(null); setError(String(cause)); }
    });
    return () => { active = false; };
  }, [selected, command, platform.connected]);
  const refreshConfig = useCallback(async () => {
    const result = await client.aiConfig.get();
    setConfig(result);
    setRevision(result.revision);
  }, [client]);
  const speechSelection = config?.effectiveSelections.find((s) => s.capabilityContract === 'audio.synthesize');
  const speechSelectionKey = JSON.stringify([config?.revision, speechSelection?.state, speechSelection?.resource]);
  const voiceAssetsKey = voiceRevision;
  useEffect(() => {
    if (!config) return;
    let active = true;
    setVoices([]);
    void Promise.allSettled([
      client.aiConfig.listOptions({ kind: 'preset-voices' }),
      client.ai.voiceAssets.list({ pageSize: 100 }),
    ]).then((results) => {
      if (!active) return;
      const presets = results[0].status === 'fulfilled' && results[0].value.kind === 'preset-voices'
        ? results[0].value.options.map((v) => ({ type: 'preset' as const, id: v.voiceId, name: v.name })) : [];
      const assets = results[1].status === 'fulfilled' ? results[1].value.assets
        .filter((v) => v.status === 'active')
        .map((v) => ({ type: 'voice-asset' as const, id: v.voiceAssetId, name: v.voiceAssetId })) : [];
      setVoices([...presets, ...assets]);
    });
    return () => { active = false; };
  }, [speechSelectionKey, voiceAssetsKey]);
  useEffect(() => {
    if (!platform.connected) return;
    let active = true;
    let refreshing = false;
    void refresh().catch(cause => { if (active) setReadError(String(cause)); });
    void refreshConfig().catch(cause => { if (active) setReadError(String(cause)); });
    const timer = setInterval(() => {
      if (active && !refreshing && document.visibilityState === 'visible') {
        refreshing = true;
        void refresh().catch((e) => { if (active) setReadError(String(e)); }).finally(() => { refreshing = false; });
      }
    }, platform.kind === 'desktop' ? 1500 : 5000);
    const focused = () => {
      void refreshConfig().catch((e) => { setErrorScope(null); setError(String(e)); });
    };
    window.addEventListener('focus', focused);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', focused);
    };
  }, [act, refresh, refreshConfig, platform.connected]);
  useEffect(() => {
    setCueDraft(current ? structuredClone(current.cues) : []);
    setPublishTitle(current?.params.topic || '');
    setPublishConfirm(false);
    setJobDetails('');
  }, [selected, current?.state, current?.cues.length]);
  const importFiles = async (files: File[]) => {
    const assets: MediaAsset[] = [];
    for (const file of files) {
      if (file.size > 256 * 1024 * 1024) throw new Error('媒体文件不能超过 256 MB。');
      const ext = file.name.split('.').pop()?.toLowerCase();
      const type =
        file.type ||
        (
          {
            wav: 'audio/wav',
            mp3: 'audio/mpeg',
            m4a: 'audio/mp4',
            flac: 'audio/flac',
            mp4: 'video/mp4',
            webm: 'video/webm',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
          } as Record<string, string>
        )[ext || ''];
      assets.push(await platform.importMedia(file, type));
    }
    return assets;
  };
  const fileAction = (fn: (assets: MediaAsset[]) => void) => (files: File[]) =>
    act(async () => {
      fn(await importFiles(files));
      setNotice('素材已保存到 App 项目资产。');
    });
  const start = () =>
    act(async () => {
      const result = await submitProductionBatch(command, p);
      await refresh();
      selectTask(result.taskIds[0]);
      setNotice(`已提交 ${result.taskIds.length} 条制作任务。`);
    });
  const move = (index: number, delta: number) => {
    const list = [...p.materials];
    if (index + delta < 0 || index + delta >= list.length) return;
    [list[index], list[index + delta]] = [list[index + delta], list[index]];
    patch('materials', list);
  };
  const number = (
    key: keyof ProductionParams,
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={p[key] as number}
        onChange={(e) => patch(key, Number(e.target.value) as never)}
      />
    </Field>
  );
  const choose = (key: keyof ProductionParams, label: string, options: [string, string][]) => (
    <Field label={label}>
      <select value={p[key] as string} onChange={(e) => patch(key, e.target.value as never)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
  const final = current?.artifacts.find((a) => a.name === 'final.mp4');
  const audio = current?.audio || p.preview;
  const startLabel = pending ? '正在处理…' : p.stopAt === 'video' ? '制作视频' : `生成${stageLabels[p.stopAt]}阶段结果`;
  const visibleError = (error && (errorScope === null || errorScope === view) ? error : '') || (platform.connected ? readError : '');
  const visibleNotice = notice?.scope === view ? notice.message : '';
  return (
    <div className="studio">
      <aside className="rail">
        <div className="brand">
          <Film size={25} />
          <div>
            MoneyPrinter<span>Turbo for Nimi</span>
          </div>
        </div>
        <nav aria-label="主导航">
          {(
            [
              ['create', '创作', Plus],
              ['history', '制作记录', History],
              ['ai', 'AI 配置', SlidersHorizontal],
              ['settings', '业务设置', Settings],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? 'nav-active' : ''}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <span className="connection-dot" />
          {platform.connected ? platform.kind === 'desktop' ? 'Nimi Host 已连接' : 'Runtime 已连接' : '连接已断开'}
          <p>
            {platform.kind === 'desktop' ? '项目与生成素材保存在' : '制作在电脑上执行，素材保存在'}
            <br />
            {platform.kind === 'desktop' ? '当前 App 的 Nimi 存储中。' : '同一 PC 工作区。'}
          </p>
        </div>
      </aside>
      <div className="studio-body">
        <header className="topbar">
          <h1>
            {view === 'create'
              ? '新视频'
              : view === 'history'
                ? '制作记录'
                : view === 'ai'
                  ? 'AI 配置'
                  : '业务设置'}
          </h1>
          <div>
            <span className="queue-label">
              {view === 'create' && <>{`${p.aspect} · ${p.batch} 条 · 到${stageLabels[p.stopAt]}`}<br /></>}
              {activeCount ? `${activeCount} 条任务进行中` : ''}
            </span>
            {['create','history'].includes(view) && <button className="mobile-results" onClick={showResults}>任务与结果</button>}
            {view === 'create' && <><button
              className="quiet"
              disabled={!platform.connected || pending || !settingsLoaded.current}
              onClick={() =>
                void act(async () => {
                  await saveCreationDefaults(command, p);
                  setNotice('创作参数已保存。');
                })
              }
            >
              <FolderOpen size={16} />
              保存创作参数
            </button>
            <button className="primary" disabled={!platform.connected || pending || !settingsLoaded.current || !media?.available} onClick={start}>
              <Film size={18} />{startLabel}
            </button></>}
          </div>
        </header>
        {(visibleError || visibleNotice) && (
          <div className={visibleError ? 'feedback error' : 'feedback'} role={visibleError ? 'alert' : 'status'}>
            {visibleError || visibleNotice}
            <button
              aria-label="关闭提示"
              onClick={() => {
                setError('');
                setReadError('');
                updateNotice(null);
              }}
            >
              ×
            </button>
          </div>
        )}
        {media && !media.available && (
          <div className="feedback error">
            媒体环境尚缺少：{media.missing.join('、')}。开发者请运行{' '}
            <code>pnpm run media:prepare</code>，完成后刷新状态。
          </div>
        )}
        {view === 'ai' ? (
          <section className="settings-page">
            <p className="intro">
              为脚本、配音、字幕和素材选择 Nimi 资源。资源、模型与 AI 凭据由 Nimi
              管理。字幕需要提供逐词时间轴的转写资源。
            </p>
            <ModelConfigAIConfigSurface
              context={{ owner: 'app-ai-config', appId: 'moneyprinterturbo.studio' }}
              capabilityContracts={contracts}
              capabilities={config?.config?.capabilities ?? null}
              revision={config?.revision}
              effectiveSelections={config?.effectiveSelections}
              listOptions={(query) => client.aiConfig.listOptions(query)}
              onOverwrite={async (input) => {
                const result = await client.aiConfig.overwrite(input);
                await refreshConfig();
                return result;
              }}
              language="zh"
              onRetry={() => void act(refreshConfig)}
              loading={!config}
              showTitle={false}
            />
          </section>
        ) : view === 'settings' ? (
          <section className="settings-page">
            {platform.kind !== 'desktop' ? <>
              <h2>PC 业务账户</h2>
              <p className="intro">这些账户与密钥由电脑上的 MoneyPrinterTurbo 管理；此处只显示是否已配置。社交发布也请在 PC 完成。</p>
              <dl className="business-grid">{(['pexels', 'pixabay', 'coverr', 'uploadPost'] as const).map(key => <div key={key}>
                <dt>{({ pexels: 'Pexels', pixabay: 'Pixabay', coverr: 'Coverr', uploadPost: 'Upload-Post' })[key]}</dt>
                <dd>{businessStatus === undefined ? '尚未读取' : businessStatus[key] ? '已配置' : '未配置'}</dd>
              </div>)}</dl>
            </> : <>
            <p className="intro">
              库存素材与 Upload-Post 的业务账号由本 App 管理。仅在使用对应服务时需要填写，AI
              凭据请在 Nimi 管理。
            </p>
            <div className="business-grid">
              {(
                ['pexelsKey', 'pixabayKey', 'coverrKey', 'uploadPostKey', 'uploadPostUser'] as const
              ).map((key) => (
                <Field
                  key={key}
                  label={
                    {
                      pexelsKey: 'Pexels API key',
                      pixabayKey: 'Pixabay API key',
                      coverrKey: 'Coverr API key',
                      uploadPostKey: 'Upload-Post API key',
                      uploadPostUser: 'Upload-Post 用户名',
                    }[key]
                  }
                >
                  <input
                    type={key.endsWith('Key') ? 'password' : 'text'}
                    autoComplete="off"
                    value={business[key]}
                    onChange={(e) => setBusiness({ ...business, [key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <fieldset className="platforms">
              <legend>发布平台</legend>
              {[
                'youtube',
                'tiktok',
                'instagram',
                'facebook',
                'linkedin',
                'x',
                'pinterest',
                'threads',
              ].map((platform) => (
                <label key={platform}>
                  <input
                    type="checkbox"
                    checked={business.uploadPlatforms.includes(platform)}
                    onChange={(e) =>
                      setBusiness({
                        ...business,
                        uploadPlatforms: e.target.checked
                          ? [...business.uploadPlatforms, platform]
                          : business.uploadPlatforms.filter((x) => x !== platform),
                      })
                    }
                  />
                  {platform}
                </label>
              ))}
            </fieldset>
            <button
              className="primary"
              disabled={!platform.connected || pending || !settingsLoaded.current}
              onClick={() =>
                void act(async () => {
                  await command('settings.save', { scope: 'business', value: business });
                  setNotice('业务设置已保存。');
                })
              }
            >
              保存业务设置
            </button>
            </>}
            <section className="support-copy">
              <h2>支持与恢复</h2>
              <p>
                失败时保留任务 ID、阶段、Job ID 和错误信息，联系本 fork
                的维护者。停止任务后可检查已有结果；重开 App 会暂停未完成队列。无 ID
                的不确定提交需先确认原请求。
              </p>
              <a
                href="https://github.com/nimiplatform/MoneyPrinterTurbo/issues"
                target="_blank"
                rel="noreferrer"
              >
                问题反馈
                <ArrowUpRight size={14} />
              </a>
            </section>
          </section>
        ) : (
          <div className="workspace">
            <main className="editor">
              {view === 'history' ? (
                <section>
                  <h2>已保存的任务</h2>
                  <p className="muted">
                    未完成的任务重开后会暂停。选择记录查看阶段结果、校对字幕或继续已知任务。
                  </p>
                  {!tasks.length ? (
                    <div className="empty">
                      <History size={32} />
                      <p>还没有制作记录</p>
                      <button onClick={() => setView('create')}>开始第一个视频</button>
                    </div>
                  ) : (
                    tasks.map((t) => (
                      <button
                        key={t.id}
                        className={`history-row ${selected === t.id ? 'selected' : ''}`}
                        onClick={() => selectTask(t.id)}
                      >
                        <span>
                          <strong>{t.topic || '未命名任务'}</strong>
                          <small>
                            {new Date(t.createdAt).toLocaleString('zh-CN')} · {t.aspect} ·
                            变体 {t.variant + 1}
                          </small>
                        </span>
                        <span className={`state ${t.state}`}>
                          {stateLabels[t.state]} · {stageLabels[t.stage]}
                        </span>
                      </button>
                    ))
                  )}
                  {nextCursor && <button disabled={!platform.connected || pending} onClick={() => void act(loadMore)}>读取更早的记录（已显示 {tasks.length} / {taskCount}）</button>}
                </section>
              ) : (
                <>
                  <section className="form-section">
                    <h2>
                      <FileText size={20} />
                      脚本
                    </h2>
                    <Field label="视频主题">
                      <input
                        placeholder="例如：城市里的一次慢行"
                        value={p.topic}
                        onChange={(e) => patch('topic', e.target.value)}
                      />
                    </Field>
                    <Field
                      label="手工脚本"
                      hint="留空时由 Nimi 根据主题生成；填写后直接使用，也可改写。"
                    >
                      <textarea
                        className="script-editor"
                        placeholder="写下想讲的故事…"
                        value={p.script}
                        onChange={(e) => patch('script', e.target.value)}
                      />
                    </Field>
                    <div className="inline-actions">
                      <button
                        disabled={!platform.connected || pending || !p.script}
                        onClick={() =>
                          void act(async () => {
                            const result = await command<{ script: string }>('rewrite', {
                              params: p,
                              instruction: '更简洁、自然，适合口播；保留事实与原意。',
                            });
                            patch('script', result.script);
                            setNotice('脚本已改写，可继续编辑。');
                          })
                        }
                      >
                        <RefreshCw size={15} />
                        改写脚本
                      </button>
                      <span className="muted">{p.script.length} 字</span>
                    </div>
                    <details>
                      <summary>脚本设置</summary>
                      <div className="fields-grid">
                        {choose('language', '语言', [
                          ['zh', '中文'],
                          ['en', 'English'],
                          ['ja', '日本語'],
                          ['ko', '한국어'],
                          ['es', 'Español'],
                        ])}
                        {number('paragraphs', '段落数', 1, 10)}
                      </div>
                      <Field label="创作要求">
                        <textarea
                          value={p.scriptPrompt}
                          onChange={(e) => patch('scriptPrompt', e.target.value)}
                          placeholder="希望保留的事实、语气、目标观众…"
                        />
                      </Field>
                    </details>
                  </section>
                  <section className="form-section">
                    <h2>
                      <Film size={20} />
                      画面与素材
                    </h2>
                    <div className="aspect-options" role="group" aria-label="输出画幅">
                      {(['9:16', '16:9', '1:1'] as const).map((aspect) => (
                        <button
                          key={aspect}
                          className={p.aspect === aspect ? 'selected' : ''}
                          onClick={() => patch('aspect', aspect)}
                        >
                          <span className={`aspect-shape ratio-${aspect.replace(':', '-')}`} />
                          <span>
                            {aspect}
                            <small>
                              {aspect === '9:16' ? '竖屏' : aspect === '16:9' ? '横屏' : '方形'}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                    {choose('materialSource', '素材来源', [
                      ['local', '本地图片 / 视频'],
                      ['pexels', 'Pexels 库存视频'],
                      ['pixabay', 'Pixabay 库存视频'],
                      ['coverr', 'Coverr 库存视频'],
                      ['ai-image', 'Nimi AI 图片'],
                      ['ai-video', 'Nimi AI 视频'],
                    ])}
                    <Field
                      label="关键词与顺序"
                      hint="以逗号分隔，按脚本画面顺序排列。在线或 AI 素材留空时自动生成。"
                    >
                      <input
                        value={termDraft}
                        onChange={(e) => setTermDraft(e.target.value)}
                        onBlur={(e) =>
                          patch(
                            'terms',
                            e.target.value
                              .split(/[,，]/)
                              .map((x) => x.trim())
                              .filter(Boolean),
                          )
                        }
                      />
                    </Field>
                    {(p.materialSource === 'local' || p.materialSource === 'ai-video') && (
                      <>
                        <UploadInput
                          label={
                            p.materialSource === 'local' ? '导入图片与视频' : '导入图生视频参考图'
                          }
                          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                          multiple
                          onFiles={fileAction((assets) =>
                            patch('materials', [...p.materials, ...assets]),
                          )}
                        />
                        <ol className="material-list">
                          {p.materials.map((a, i) => (
                            <li key={a.relativePath}>
                              <span className="material-index">{i + 1}</span>
                              <span className="file-name">
                                {a.name}
                                <small>{(a.sizeBytes / 1024 / 1024).toFixed(1)} MB</small>
                              </span>
                              <button aria-label={`上移 ${a.name}`} onClick={() => move(i, -1)}>
                                <ChevronUp size={16} />
                              </button>
                              <button aria-label={`下移 ${a.name}`} onClick={() => move(i, 1)}>
                                <ChevronDown size={16} />
                              </button>
                              <button
                                aria-label={`删除 ${a.name}`}
                                onClick={() =>
                                  patch(
                                    'materials',
                                    p.materials.filter((_, j) => j !== i),
                                  )
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                    {p.materialSource === 'ai-video' && (
                      <div className="fields-grid">
                        {choose('videoMode', '视频生成模式', [
                          ['t2v', '文字生成视频'],
                          ['i2v-first-frame', '首帧图生视频'],
                          ['i2v-first-last', '首尾帧图生视频'],
                          ['i2v-reference', '参考图视频'],
                        ])}
                        {choose('videoResolution', '生成素材分辨率', [
                          ['480p', '480p'],
                          ['720p', '720p'],
                          ['1080p', '1080p'],
                        ])}
                        {number('videoDuration', '生成片段时长（秒）', 1, 30)}
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={p.generateAudio}
                            onChange={(e) => patch('generateAudio', e.target.checked)}
                          />
                          请求素材原声（资源需支持）
                        </label>
                      </div>
                    )}
                    <details>
                      <summary>剪辑设置</summary>
                      <div className="fields-grid">
                        {choose('order', '素材顺序', [
                          ['sequential', '按顺序'],
                          ['random', '随机'],
                        ])}
                        {choose('fit', '画面适配', [
                          ['cover', '裁剪填满'],
                          ['contain', '完整保留 / 黑边'],
                        ])}
                        {choose('imageMotion', '图片动效', [
                          ['zoom', '缓慢放大'],
                          ['static', '静止画面'],
                        ])}
                        {number('clipDuration', '每个片段最长（秒）', 1, 30)}
                        {number('clipSpeed', '画面速度', 0.25, 4, 0.25)}
                        {choose('transition', '转场', [
                          ['', '无转场'],
                          ['FadeIn', '淡入'],
                          ['FadeOut', '淡出'],
                          ['SlideIn', '滑入'],
                          ['SlideOut', '滑出'],
                          ['ZoomIn', '放大'],
                          ['ZoomOut', '缩小'],
                          ['Shuffle', '随机转场'],
                        ])}
                      </div>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={p.matchMaterials}
                          onChange={(e) => patch('matchMaterials', e.target.checked)}
                        />
                        按素材描述、文件名与脚本的相似度排序（Nimi）
                      </label>
                    </details>
                    {p.materialSource === 'pexels' && (
                      <p className="muted">
                        素材由{' '}
                        <a href="https://www.pexels.com" target="_blank" rel="noreferrer">
                          Pexels
                        </a>{' '}
                        提供。来源信息保留在任务素材记录中。
                      </p>
                    )}
                  </section>
                  <section className="form-section">
                    <h2>
                      <Volume2 size={20} />
                      配音
                    </h2>
                    {choose('narration', '配音方式', [
                      ['auto', 'Nimi 自动配音'],
                      ['upload', '上传配音'],
                      ['none', '无配音'],
                    ])}
                    {p.narration === 'upload' && (
                      <>
                        <UploadInput
                          label="上传配音音频"
                          accept="audio/wav,audio/mpeg,audio/flac,audio/mp4"
                          onFiles={fileAction((assets) => patch('audio', assets[0] || null))}
                        />
                        {p.audio && <p className="file-note">{p.audio.name}</p>}
                      </>
                    )}
                    {p.narration === 'none' ? (
                      number('silentDuration', '成片时长（秒）', 0.2, 600, 0.1)
                    ) : (
                      <div className="fields-grid">
                        {number('voiceSpeed', '配音速度', 0.5, 2, 0.1)}
                        {number('voiceVolume', '配音音量', 0, 2, 0.1)}
                      </div>
                    )}
                    {p.narration === 'auto' && (
                      <>
                        <Field label="声音">
                          <select
                            value={p.voice ? `${p.voice.type}:${p.voice.id}` : ''}
                            onChange={(e) => {
                              const v = voices.find((v) => `${v.type}:${v.id}` === e.target.value);
                              patch('voice', v ? { type: v.type, id: v.id } : null);
                            }}
                          >
                            <option value="">使用资源默认声音 / 创建参考声音</option>
                            {p.voice && !voices.some((v) => v.type === p.voice!.type && v.id === p.voice!.id) && (
                              <option value={`${p.voice.type}:${p.voice.id}`}>既有声音（当前资源未确认）：{p.voice.id}</option>
                            )}
                            {voices.map((v) => (
                              <option key={`${v.type}:${v.id}`} value={`${v.type}:${v.id}`}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <div className="inline-actions">
                          <button
                            disabled={!platform.connected || pending || !p.script || !media?.available}
                            onClick={() =>
                              void act(async () => {
                                const result = await command<{ asset: MediaAsset }>('preview', {
                                  params: p,
                                  text: Array.from(p.script).slice(0, 30).join(''),
                                });
                                patch('preview', result.asset);
                                patch('previewKey', '');
                                setNotice('试听已生成。');
                              })
                            }
                          >
                            <Play size={15} />
                            试听
                          </button>
                          <button
                            disabled={!platform.connected || pending || !p.script || !media?.available}
                            onClick={() =>
                              void act(async () => {
                                const result = await command<{ asset: MediaAsset; key: string }>(
                                  'preview',
                                  { params: p, text: p.script },
                                );
                                setP((old) => ({
                                  ...old,
                                  preview: result.asset,
                                  previewKey: result.key,
                                }));
                                setNotice(
                                  '完整配音预览已保存。参数与 AI 配置一致时，制作会复用它。',
                                );
                              })
                            }
                          >
                            完整配音预览
                          </button>
                        </div>
                        {p.preview && <MediaPlayer asset={p.preview} />}
                        <details>
                          <summary>参考声音与演绎</summary>
                          <Field label="情绪要求">
                            <input
                              value={p.emotion}
                              onChange={(e) => patch('emotion', e.target.value)}
                              placeholder="所选资源需支持该要求"
                            />
                          </Field>
                          <UploadInput
                            label="上传声音身份参考"
                            accept="audio/wav,audio/mpeg,audio/flac"
                            onFiles={fileAction((assets) =>
                              setP((old) => ({
                                ...old,
                                voiceReference: assets[0] || null,
                                voice: null,
                              })),
                            )}
                          />
                          {p.voiceReference && (
                            <p className="file-note">
                              {p.voiceReference.name}
                              <button onClick={() => patch('voiceReference', null)}>移除</button>
                            </p>
                          )}
                          <Field label="参考音频逐字稿">
                            <textarea
                              value={p.referenceText}
                              onChange={(e) => patch('referenceText', e.target.value)}
                            />
                          </Field>
                          <UploadInput
                            label="上传独立演绎示范"
                            accept="audio/wav,audio/mpeg,audio/flac"
                            onFiles={fileAction((assets) =>
                              patch('performanceReference', assets[0] || null),
                            )}
                          />
                          {p.performanceReference && (
                            <p className="file-note">
                              {p.performanceReference.name}
                              <button onClick={() => patch('performanceReference', null)}>
                                移除
                              </button>
                            </p>
                          )}
                          <Field label="演绎示范逐字稿">
                            <textarea
                              value={p.performanceText}
                              onChange={(e) => patch('performanceText', e.target.value)}
                            />
                          </Field>
                          <p className="muted">
                            独立演绎音频与声音身份参考分别进入合成；当前资源需明确支持，不会用声音克隆替代演绎。
                          </p>
                        </details>
                      </>
                    )}
                  </section>
                  <section className="form-section">
                    <h2>
                      <Captions size={20} />
                      字幕
                    </h2>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={p.subtitle}
                        onChange={(e) => patch('subtitle', e.target.checked)}
                      />
                      生成字幕
                    </label>
                    <p className="muted">
                      字幕读取真实音频的逐词时间轴。无配音时不自动编造字幕，可在阶段结果中手工校对。
                    </p>
                    {p.subtitle && (
                      <>
                        <div className="fields-grid">
                          {choose('subtitleMode', '显示方式', [
                            ['sentence', '句级'],
                            ['word_by_word', '逐词'],
                          ])}
                          {choose('animation', '字幕动效', [
                            ['none', '无'],
                            ['pop_spring', '弹跳出现'],
                          ])}
                          {choose('subtitlePosition', '字幕位置', [
                            ['bottom', '底部'],
                            ['center', '居中'],
                            ['top', '顶部'],
                            ['custom', '自定义'],
                          ])}
                          {p.subtitlePosition === 'custom' &&
                            number('subtitleY', '垂直位置 %', 0, 100)}
                        </div>
                        <details>
                          <summary>字幕样式</summary>
                          <div className="fields-grid">
                            {number('fontSize', '字号', 12, 160)}
                            {number('strokeWidth', '描边宽度', 0, 10, 0.5)}
                            <Field label="文字颜色">
                              <input
                                type="color"
                                value={p.textColor}
                                onChange={(e) => patch('textColor', e.target.value)}
                              />
                            </Field>
                            <Field label="描边颜色">
                              <input
                                type="color"
                                value={p.strokeColor}
                                onChange={(e) => patch('strokeColor', e.target.value)}
                              />
                            </Field>
                            <Field label="字幕背景">
                              <select
                                value={p.background}
                                onChange={(e) => patch('background', e.target.value)}
                              >
                                <option value="">透明</option>
                                <option value="#000000">黑色</option>
                                <option value="#103D37">深绿</option>
                              </select>
                            </Field>
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={p.roundedBackground}
                                onChange={(e) => patch('roundedBackground', e.target.checked)}
                              />
                              圆角背景
                            </label>
                          </div>
                        </details>
                      </>
                    )}
                  </section>
                  <section className="form-section">
                    <h2>
                      <Music2 size={20} />
                      背景音乐
                    </h2>
                    {choose('music', '音乐来源', [
                      ['none', '不使用'],
                      ['upload', '上传 / 本地音乐'],
                      ['random', '从已导入音乐随机选择'],
                      ['ai', 'Nimi 生成纯音乐'],
                      ['video', '根据真实成片画面配乐'],
                    ])}
                    {p.music !== 'none' && number('musicVolume', '音乐音量', 0, 2, 0.05)}
                    {['upload', 'random'].includes(p.music) && (
                      <>
                        <UploadInput
                          label="导入背景音乐"
                          accept="audio/wav,audio/mpeg,audio/flac,audio/mp4"
                          multiple
                          onFiles={fileAction((assets) =>
                            patch('musicAssets', [...p.musicAssets, ...assets]),
                          )}
                        />
                        {p.musicAssets.map((a) => (
                          <p className="file-note" key={a.relativePath}>
                            {a.name}
                            <button
                              onClick={() =>
                                patch(
                                  'musicAssets',
                                  p.musicAssets.filter((x) => x !== a),
                                )
                              }
                            >
                              移除
                            </button>
                          </p>
                        ))}
                      </>
                    )}
                    {['ai', 'video'].includes(p.music) && (
                      <Field label="配乐要求">
                        <textarea
                          value={p.musicPrompt}
                          onChange={(e) => patch('musicPrompt', e.target.value)}
                          placeholder="节奏、情绪、乐器…"
                        />
                      </Field>
                    )}
                    {p.music === 'video' && (
                      <p className="muted">
                        将实际组装的视频作为配乐条件；Nimi资源需明确支持视频输入，普通prompt音乐不能替代。
                      </p>
                    )}
                  </section>
                  <section className="form-section output-controls">
                    <h2>输出</h2>
                    <div className="fields-grid">
                      {number('batch', '批量变体', 1, 8)}
                      {choose(
                        'stopAt',
                        '完成到哪一步',
                        STAGES.map((s) => [s, stageLabels[s]]),
                      )}
                    </div>
                    <p className="muted">
                      输出 1080p · H.264 / AAC MP4。批量按队列制作，每条保留独立参数和阶段结果。
                    </p>
                    <button
                      className="primary start-button"
                      disabled={!platform.connected || pending || !settingsLoaded.current || !media?.available}
                      onClick={start}
                    >
                      <Film size={18} />
                      {startLabel}
                    </button>
                  </section>
                </>
              )}
            </main>
            <aside className="result-panel" ref={resultPanel}>
              <div className="result-heading">
                <h2>制作与预览</h2>
                <button
                  className="icon-button"
                  aria-label="刷新任务状态"
                  onClick={() => void act(refresh)}
                >
                  <RefreshCw size={17} />
                </button>
              </div>
              <Field label="当前任务">
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">选择制作记录</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.topic || '未命名任务'} · {stateLabels[t.state]} ·{' '}
                      {t.id.slice(0, 6)}
                    </option>
                  ))}
                </select>
              </Field>
              {current ? (
                <>
                  <div className={`task-state ${current.state}`}>
                    <strong>{stateLabels[current.state]}</strong>
                    <span>
                      {stageLabels[current.stage]} · {Math.round(current.progress)}%
                    </span>
                  </div>
                  <div className="stage-track" aria-label="制作阶段">
                    {STAGES.map((s) => (
                      <span
                        key={s}
                        className={STAGES.indexOf(s) <= STAGES.indexOf(current.stage) ? 'done' : ''}
                      >
                        {stageLabels[s]}
                      </span>
                    ))}
                  </div>
                  <details>
                    <summary>脚本与关键词</summary>
                    <p className="saved-script">{current.script}</p>
                    <p className="muted">{current.terms.join(' · ') || '未使用搜索关键词'}</p>
                  </details>
                  {current.error && (
                    <p className="task-error" role="alert">
                      {current.error}
                    </p>
                  )}
                  {current.warnings.map((warning, i) => (
                    <p className="muted" key={i}>
                      {warning}
                    </p>
                  ))}
                  <div className="task-actions">
                    {['running', 'queued'].includes(current.state) ? (
                      <button
                        className="danger"
                        onClick={() =>
                          void act(async () => {
                            await command('cancel', { id: current.id });
                            await refresh();
                          })
                        }
                      >
                        <StopCircle size={16} />
                        停止任务
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={!platform.connected || pending || !settingsLoaded.current}
                          onClick={() =>
                            void act(async () => {
                              setP({
                                ...structuredClone(current.params),
                                script: current.script,
                                terms: current.terms,
                              });
                              setView('create');
                              setNotice('已载入参数，可以编辑后创建新任务。', 'create');
                            })
                          }
                        >
                          载入参数
                        </button>
                        {['paused', 'failed', 'stopped'].includes(current.state) && (
                          <button
                            disabled={!platform.connected || pending || !settingsLoaded.current}
                            onClick={() =>
                              void act(async () => {
                                await command('resume', { id: current.id });
                                await refresh();
                              })
                            }
                          >
                            显式继续
                          </button>
                        )}
                        <button
                          disabled={!platform.connected || pending || !current.audio || !current.materials.length}
                          onClick={() =>
                            void act(async () => {
                              const result = await command<{ taskIds: string[] }>('regenerate', {
                                id: current.id,
                              });
                              await refresh();
                              setSelected(result.taskIds[0]);
                            })
                          }
                        >
                          用校对结果重新成片
                        </button>
                      </>
                    )}
                  </div>
                  {final ? (
                    <div className="video-preview">
                      <MediaPlayer asset={final} />
                      <div className="file-note">
                        成片 · {final.duration?.toFixed(2)} 秒
                        <button
                          disabled={!platform.connected || pending}
                          aria-label={`${platform.kind === 'desktop' ? '打开' : '保存'} ${final.name}`}
                          onClick={() =>
                            void act(async () => {
                              await platform.deliverAsset(final);
                            })
                          }
                        >
                          <FolderOpen size={15} />
                            {platform.kind === 'desktop' ? '打开文件' : '保存成片'}
                        </button>
                        {platform.shareAsset && <button disabled={!platform.connected || pending}
                          onClick={() => void act(() => platform.shareAsset!(final))}>分享</button>}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`preview-empty aspect-${current.params.aspect.replace(':', '-')}`}
                    >
                      <Film size={35} />
                      <p>
                        {current.state === 'running'
                          ? '正在制作，完成后在这里预览'
                          : '阶段结果保留在下面'}
                      </p>
                    </div>
                  )}
                  {audio && (
                    <div className="audio-preview">
                      <h3>配音结果</h3>
                      <MediaPlayer asset={audio} />
                    </div>
                  )}
                  <details open>
                    <summary>阶段产物（{current.artifacts.length}）</summary>
                    <div className="artifact-list">
                      {current.artifacts.map((a) => (
                        <div key={a.relativePath} className="artifact-delivery">
                        <button
                          disabled={!platform.connected || pending}
                          aria-label={`${platform.kind === 'desktop' ? '打开' : '保存'} ${a.name}`}
                          onClick={() =>
                            void act(async () => {
                              await platform.deliverAsset(a);
                            })
                          }
                        >
                          <FileText size={15} />
                          <span>{a.name}</span>
                          <ArrowUpRight size={14} />
                        </button>
                        {platform.shareAsset && <button disabled={!platform.connected || pending}
                          aria-label={`分享 ${a.name}`} onClick={() => void act(() => platform.shareAsset!(a))}>分享</button>}
                        </div>
                      ))}
                    </div>
                  </details>
                  <details>
                    <summary>字幕校对（{current.cues.length} 条）</summary>
                    <p className="muted">
                      保留原始转写文字与时间轴。修改只用于此任务的校对版本；停止后可保存并重新成片。
                    </p>
                    <div className="cue-editor">
                      {cueDraft.map((c, i) => (
                        <div key={i}>
                          <div>
                            <input
                              aria-label={`字幕 ${i + 1} 开始时间`}
                              type="number"
                              step="0.01"
                              value={c.start}
                              onChange={(e) =>
                                setCueDraft((old) =>
                                  old.map((x, j) =>
                                    j === i ? { ...x, start: Number(e.target.value) } : x,
                                  ),
                                )
                              }
                            />
                            <span>—</span>
                            <input
                              aria-label={`字幕 ${i + 1} 结束时间`}
                              type="number"
                              step="0.01"
                              value={c.end}
                              onChange={(e) =>
                                setCueDraft((old) =>
                                  old.map((x, j) =>
                                    j === i ? { ...x, end: Number(e.target.value) } : x,
                                  ),
                                )
                              }
                            />
                            <button
                              aria-label={`删除字幕 ${i + 1}`}
                              onClick={() => setCueDraft((old) => old.filter((_, j) => j !== i))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <textarea
                            aria-label={`字幕 ${i + 1} 文字`}
                            value={c.text}
                            onChange={(e) =>
                              setCueDraft((old) =>
                                old.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() =>
                        setCueDraft([
                          ...cueDraft,
                          {
                            text: '新字幕',
                            start: cueDraft.at(-1)?.end || 0,
                            end: (cueDraft.at(-1)?.end || 0) + 1,
                          },
                        ])
                      }
                    >
                      添加字幕
                    </button>
                    <button
                      disabled={!platform.connected || pending || ['running', 'queued'].includes(current.state)}
                      onClick={() =>
                        void act(async () => {
                          await command('cues.save', { id: current.id, cues: cueDraft });
                          await refresh();
                          setNotice('字幕校对已保存。重新成片后生效。');
                        })
                      }
                    >
                      保存字幕校对
                    </button>
                  </details>
                  {current.jobs.length > 0 && (
                    <details>
                      <summary>AI 执行与恢复</summary>
                      <p className="muted">已知 Job ID 查询原任务。同步文字保存原响应和 trace；无 ID 的不确定提交不会自动重试。</p>
                      {current.jobs.map((j, i) => (
                        <p className="job-row" key={i}>
                          <span>
                            {j.stage} · {j.state}
                          </span>
                          <code>{j.id || j.submissionId || (j.traceId ? `trace ${j.traceId}` : '无 ID')}</code>
                        </p>
                      ))}
                      <button
                        disabled={!platform.connected || pending || !settingsLoaded.current}
                        onClick={() =>
                          void act(async () => {
                            setJobDetails(
                              JSON.stringify(await command('jobs', { id: current.id }), null, 2),
                            );
                          })
                        }
                      >
                        查询原 Job
                      </button>
                      {jobDetails && <pre>{jobDetails}</pre>}
                    </details>
                  )}
                  {final && platform.kind === 'desktop' && (
                    <details>
                      <summary>Upload-Post 发布</summary>
                      <p className="muted">发布与制作分开。先核对文案、平台和账户，再明确提交。</p>
                      <button
                        disabled={!platform.connected || pending || !settingsLoaded.current}
                        onClick={() =>
                          void act(async () => {
                            const result = await command<{ text: string }>('metadata', {
                              id: current.id,
                            });
                            setPublishTitle(result.text);
                          })
                        }
                      >
                        生成发布文案
                      </button>
                      <Field label="标题与文案">
                        <textarea
                          value={publishTitle}
                          onChange={(e) => setPublishTitle(e.target.value)}
                        />
                      </Field>
                      <p>平台：{business.uploadPlatforms.join('、') || '请在业务设置中选择'}</p>
                      {business.uploadPlatforms.includes('youtube') && (
                        <>
                          <Field label="YouTube 隐私">
                            <select value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                              <option value="private">私密</option>
                              <option value="unlisted">不公开列出</option>
                              <option value="public">公开</option>
                            </select>
                          </Field>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={madeForKids}
                              onChange={(e) => setMadeForKids(e.target.checked)}
                            />
                            内容面向儿童
                          </label>
                        </>
                      )}
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={publishConfirm}
                          onChange={(e) => setPublishConfirm(e.target.checked)}
                        />
                        确认使用所选业务账号发布这条成片
                      </label>
                      <button
                        className="primary"
                        disabled={!platform.connected || pending || !publishConfirm || !business.uploadPlatforms.length}
                        onClick={() =>
                          void act(async () => {
                            await command('publish', {
                              id: current.id,
                              title: publishTitle,
                              platforms: business.uploadPlatforms,
                              options: { privacy, madeForKids },
                            });
                            await refresh();
                            setPublishConfirm(false);
                          })
                        }
                      >
                        提交发布
                      </button>
                      {current.publish && (
                        <>
                          <p>发布状态：{current.publish.state}</p>
                          <button
                            disabled={!platform.connected || pending || !settingsLoaded.current}
                            onClick={() =>
                              void act(async () => {
                                await command('publish.status', { id: current.id });
                                await refresh();
                              })
                            }
                          >
                            查询原发布回执
                          </button>
                          <pre>{JSON.stringify(current.publish, null, 2)}</pre>
                        </>
                      )}
                    </details>
                  )}
                  {final && platform.kind !== 'desktop' && <p className="muted">社交发布保留在 PC。请在电脑上核对业务账号、平台与文案后提交。</p>}
                </>
              ) : (
                <div className="empty result-empty">
                  <Film size={35} />
                  <h3>{selected ? '正在读取任务' : '从一个故事开始'}</h3>
                  <p>
                    {selected ? platform.connected ? '任务摘要与详细产物分开读取，请稍候。' : '重新连接后可继续读取此任务，原任务不会重交。' : '填写主题或脚本，选择画面与声音。完成后，可在这里预览成片和检查每个阶段的产物。'}
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
        <footer className="studio-footer">
          MoneyPrinterTurbo · AI 通过 Nimi 执行 · {platform.kind === 'desktop' ? 'Windows x86_64' : '制作由 PC 执行'}
        </footer>
      </div>
    </div>
  );
}
