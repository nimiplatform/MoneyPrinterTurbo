import { createWebNimiAppSession, type NimiRemoteAppConfig } from '@nimiplatform/kit/auth/app/web';
import { mountRemoteStudio } from './shell/remote-app.js';
declare const __NIMI_APP_WEB_CONFIG__: NimiRemoteAppConfig;
const dispose = mountRemoteStudio(createWebNimiAppSession(__NIMI_APP_WEB_CONFIG__), 'web');
if (import.meta.hot) import.meta.hot.dispose(dispose);
