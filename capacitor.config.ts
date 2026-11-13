import type { CapacitorConfig } from '@capacitor/cli';
import type { NimiRemoteAppConfig } from '@nimiplatform/kit/core/app-session';
import { resolveDevelopmentRealm } from '@nimiplatform/app-tools/development';

const realm = resolveDevelopmentRealm();
if (realm.name !== 'local') throw new Error('MoneyPrinterTurbo Android currently has only a local test source. Select --realm local; official App Links are not admitted.');
export const mobileAccess: Omit<NimiRemoteAppConfig, 'fetch'> = {
  appId: 'moneyprinterturbo.studio',
  clientId: 'moneyprinterturbo.studio.android.dev',
  realmEnvironmentId: realm.environmentId,
  realmBaseUrl: realm.apiOrigin,
  officialWebBaseUrl: realm.webOrigin,
  redirectUri: 'ai.nimi.apps.moneyprinterturbo.dev:/oauth/callback',
};
const config: CapacitorConfig = {
  appId: 'ai.nimi.apps.moneyprinterturbo.dev', appName: 'MoneyPrinterTurbo（测试）', webDir: 'dist-mobile', loggingBehavior: 'none',
  server: { androidScheme: 'https' },
  plugins: { NimiAppAccess: { realmBaseUrl: mobileAccess.realmBaseUrl, clientId: mobileAccess.clientId, redirectUri: mobileAccess.redirectUri } },
};
export default config;
