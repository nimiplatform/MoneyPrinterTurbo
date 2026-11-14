package ai.nimi.apps.moneyprinterturbo.dev;

import com.getcapacitor.BridgeActivity;
import androidx.webkit.WebViewFeature;
import android.widget.TextView;

public class MainActivity extends BridgeActivity {
    @Override protected void load() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            TextView notice = new TextView(this);
            notice.setText("请更新 Android System WebView。文件保存需要仅限主页面的安全通道。");
            notice.setPadding(32, 64, 32, 32); setContentView(notice); return;
        }
        registerPlugin(MoneyPrinterTurboFilesPlugin.class);
        super.load();
        bridge.getWebView().removeJavascriptInterface("androidBridge");
    }
}
