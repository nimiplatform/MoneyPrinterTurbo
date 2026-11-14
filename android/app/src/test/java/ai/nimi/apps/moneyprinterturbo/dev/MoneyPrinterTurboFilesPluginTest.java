package ai.nimi.apps.moneyprinterturbo.dev;
import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public class MoneyPrinterTurboFilesPluginTest {
    @Test public void exactJsonIntegersDoNotSilentlyDefaultOrCoerce() {
        assertEquals(65536L, MoneyPrinterTurboFilesPlugin.exactInteger(Integer.valueOf(65536)));
        assertEquals(268435456L, MoneyPrinterTurboFilesPlugin.exactInteger(Long.valueOf(268435456)));
        for (Object value : new Object[] { "0", 1.5, 1.0, -1, null }) {
            assertThrows(IllegalArgumentException.class, () -> MoneyPrinterTurboFilesPlugin.exactInteger(value));
        }
    }
    @Test public void originalUnicodeNamesAndMimeParametersStaySafeForSystemSave() {
        assertEquals("原始字幕.srt", MoneyPrinterTurboFilesPlugin.exportName("原始字幕.srt"));
        assertEquals("application/x-subrip", MoneyPrinterTurboFilesPlugin.mimeEssence("application/x-subrip;charset=utf-8"));
        assertEquals("video/mp4", MoneyPrinterTurboFilesPlugin.mimeEssence("Video/MP4"));
        assertThrows(IllegalArgumentException.class, () -> MoneyPrinterTurboFilesPlugin.exportName("../final.mp4"));
        assertThrows(IllegalArgumentException.class, () -> MoneyPrinterTurboFilesPlugin.mimeEssence("text/plain\r\nother"));
    }
    @Test public void theActualByteDigestMustMatchBeforeSaving() throws Exception {
        byte[] actual = MessageDigest.getInstance("SHA-256").digest("hello".getBytes(StandardCharsets.UTF_8));
        String expected = MoneyPrinterTurboFilesPlugin.exportDigest("sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
        MoneyPrinterTurboFilesPlugin.verifyDigest(expected, actual);
        assertThrows(IllegalArgumentException.class, () -> MoneyPrinterTurboFilesPlugin.verifyDigest("0".repeat(64), actual));
        assertThrows(IllegalArgumentException.class, () -> MoneyPrinterTurboFilesPlugin.exportDigest(expected));
    }
}
