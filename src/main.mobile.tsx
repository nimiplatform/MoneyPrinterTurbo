import { createMobileNimiAppSession } from '@nimiplatform/kit/auth/app/mobile';
import type { NimiRemoteAppConfig } from '@nimiplatform/kit/core/app-session';
import { mountRemoteStudio } from './shell/remote-app.js';
declare const __NIMI_APP_MOBILE_CONFIG__: Omit<NimiRemoteAppConfig, 'fetch'>;
const dispose = mountRemoteStudio(createMobileNimiAppSession(__NIMI_APP_MOBILE_CONFIG__), 'android');
if (import.meta.hot) import.meta.hot.dispose(dispose);
