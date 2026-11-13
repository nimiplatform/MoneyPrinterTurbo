import { StrictMode, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { NimiAppAccessGate, NimiAppSessionProvider, NimiAccountControl, useNimiAppSession, type NimiAppScope, type NimiAppSession } from '@nimiplatform/kit/auth/app';
import { NimiThemeProvider, TooltipProvider, NimiToaster, Popover, PopoverContent, PopoverTrigger, Button } from '@nimiplatform/kit/ui';
import { Studio } from '../production/Studio.js';
import { StudioPlatformProvider } from '../production/platform.js';
import { remoteProductionPlatform } from './remote-production.js';
import '../styles.css';

function Workspace({ kind }: { kind: 'web' | 'android' }) {
  const { session, snapshot } = useNimiAppSession();
  const retained = useRef<NimiAppScope | undefined>(undefined);
  const connected = snapshot.runtime.status === 'connected';
  if (snapshot.runtime.status === 'connected') retained.current = snapshot.runtime.scope;
  const scope = retained.current;
  const base = useMemo(() => scope ? remoteProductionPlatform(scope, kind) : undefined, [scope, kind]);
  const platform = useMemo(() => base ? { ...base, connected } : undefined, [base, connected]);
  return <>
    {!connected && <section className="mpt-connect">
      {!scope ? <><p>请在 PC 打开 MoneyPrinterTurbo。首次连接需在 Home 确认来源，并允许此应用使用制作集成。</p><NimiAppAccessGate title="MoneyPrinterTurbo" language="zh" externalAccountControl>{() => null}</NimiAppAccessGate></>
        : <><p>{snapshot.runtime.status === 'connecting' ? '正在连接 PC…' : 'PC 已断开。编辑和已读取结果保留，任务不会重新提交。'}</p>
          <button type="button" onClick={() => snapshot.runtime.status === 'connecting' ? session.disconnectRuntime() : void session.connectRuntime()}>{snapshot.runtime.status === 'connecting' ? '取消连接' : '连接 PC'}</button>
          {snapshot.issue && <p>{snapshot.issue.message}</p>}</>}
    </section>}
    {platform && <StudioPlatformProvider platform={platform}><Studio /></StudioPlatformProvider>}
  </>;
}
function AccountMenu() {
  const { snapshot } = useNimiAppSession();
  if (snapshot.identity.status !== 'signed-in') return null;
  return <Popover><PopoverTrigger asChild><Button tone="secondary" size="sm" aria-label="账号与连接">{snapshot.identity.user?.displayName || 'Nimi 账号'}</Button></PopoverTrigger>
    <PopoverContent align="end" className="max-w-[calc(100vw-2rem)] w-80 p-4"><div className="mpt-account-controls"><NimiAccountControl language="zh" /></div></PopoverContent></Popover>;
}
export function mountRemoteStudio(session: NimiAppSession, kind: 'web' | 'android') {
  document.body.classList.add('nimi-ui-module--lab', 'mpt-remote');
  const root = createRoot(document.getElementById('root')!);
  root.render(<StrictMode><NimiThemeProvider accentPack="nimi-accent"><TooltipProvider><NimiAppSessionProvider session={session}>
    <header className="mpt-account-header"><strong>MoneyPrinterTurbo</strong><AccountMenu /></header>
    <NimiAppAccessGate title="MoneyPrinterTurbo" language="zh" requireRuntime={false} externalAccountControl>
      <Workspace kind={kind} />
    </NimiAppAccessGate>
    <NimiToaster />
  </NimiAppSessionProvider></TooltipProvider></NimiThemeProvider></StrictMode>);
  void session.start();
  return () => { root.unmount(); session.dispose(); };
}
