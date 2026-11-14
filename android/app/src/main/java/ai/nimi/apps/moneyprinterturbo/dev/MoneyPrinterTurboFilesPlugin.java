package ai.nimi.apps.moneyprinterturbo.dev;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.StatFs;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** App-owned export sink. It accepts bytes and public media metadata, never PC paths or credentials. */
@CapacitorPlugin(name = "MoneyPrinterTurboFiles")
public class MoneyPrinterTurboFilesPlugin extends Plugin {
    private static final long LIMIT = 256L * 1024 * 1024;
    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    private PendingExport active;

    private static final class PendingExport {
        final String id = UUID.randomUUID().toString();
        final String name, mime, expectedHash;
        final long expectedBytes;
        final File file;
        final MessageDigest digest;
        OutputStream output;
        long received;
        boolean choosing;
        PendingExport(File file, String name, String mime, long bytes, String hash) throws Exception {
            this.file = file; this.name = name; this.mime = mime; expectedBytes = bytes; expectedHash = hash;
            digest = MessageDigest.getInstance("SHA-256"); output = new FileOutputStream(file);
        }
    }

    public static long exactInteger(Object value) {
        if (!(value instanceof Integer) && !(value instanceof Long)) throw new IllegalArgumentException("文件大小或位置必须是整数。");
        long result = ((Number) value).longValue();
        if (result < 0 || result > 9007199254740991L) throw new IllegalArgumentException("文件大小或位置超出精确范围。");
        return result;
    }
    public static String exportName(String value) {
        if (value == null || value.isBlank() || value.length() > 240 || value.equals(".") || value.equals("..")
            || value.indexOf('/') >= 0 || value.indexOf('\\') >= 0 || value.chars().anyMatch(c -> c < 32 || c == 127))
            throw new IllegalArgumentException("导出文件名无效。");
        return value;
    }
    public static String mimeEssence(String value) {
        if (value == null || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0 || value.indexOf('\0') >= 0)
            throw new IllegalArgumentException("文件类型无效。");
        String result = value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!result.matches("[a-z0-9.+-]+/[a-z0-9.+-]+")) throw new IllegalArgumentException("文件类型无效。");
        return result;
    }
    public static String exportDigest(String value) {
        if (value == null || !value.matches("sha256:[a-f0-9]{64}")) throw new IllegalArgumentException("媒体摘要无效。");
        return value.substring(7);
    }
    public static void verifyDigest(String expected, byte[] digest) {
        StringBuilder actual = new StringBuilder(64);
        for (byte value : digest) actual.append(String.format(Locale.ROOT, "%02x", value & 255));
        if (!expected.equals(actual.toString())) throw new IllegalArgumentException("媒体完整性校验失败，未完成保存。");
    }

    @Override public void load() {
        File[] leftovers = getContext().getCacheDir().listFiles((directory, name) -> name.startsWith("mpt-saf-") && name.endsWith(".tmp"));
        if (leftovers != null) for (File file : leftovers) file.delete();
    }
    @PluginMethod public synchronized void beginExport(PluginCall call) {
        File file = null;
        try {
            if (active != null) throw new IllegalStateException("请先完成当前文件的保存。");
            String name = exportName(call.getString("name"));
            String mime = mimeEssence(call.getString("mimeType"));
            String hash = exportDigest(call.getString("sha256"));
            long bytes = exactInteger(call.getData().opt("size"));
            if (bytes > LIMIT) throw new IllegalArgumentException("远端媒体上限为 256 MB，请在 PC 打开原文件。");
            if (bytes > new StatFs(getContext().getCacheDir().getAbsolutePath()).getAvailableBytes()) throw new IllegalStateException("设备空间不足，PC 原件仍保留。");
            file = File.createTempFile("mpt-saf-", ".tmp", getContext().getCacheDir());
            active = new PendingExport(file, name, mime, bytes, hash);
            JSObject result = new JSObject(); result.put("id", active.id); call.resolve(result);
        } catch (Exception error) { if (file != null && active == null) file.delete(); call.reject(error.getMessage(), "MPT_EXPORT_UNAVAILABLE"); }
    }
    @PluginMethod public synchronized void appendExport(PluginCall call) {
        try {
            PendingExport transfer = require(call);
            String data = call.getString("data", "");
            if (transfer.choosing || transfer.output == null || data.isEmpty() || data.length() > 87384
                || !data.matches("(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?")) throw new IllegalArgumentException("文件块无效。");
            byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
            if (bytes.length == 0 || bytes.length > 65536 || transfer.received + bytes.length > transfer.expectedBytes
                || exactInteger(call.getData().opt("offset")) != transfer.received || !Base64.encodeToString(bytes, Base64.NO_WRAP).equals(data))
                throw new IllegalArgumentException("文件块大小或顺序不正确。");
            transfer.output.write(bytes); transfer.digest.update(bytes); transfer.received += bytes.length;
            JSObject result = new JSObject(); result.put("received", transfer.received); call.resolve(result);
        } catch (Exception error) { call.reject(error.getMessage(), "MPT_EXPORT_WRITE_FAILED"); }
    }
    @PluginMethod public synchronized void saveExport(PluginCall call) {
        PendingExport transfer;
        try { transfer = require(call); }
        catch (Exception error) { call.reject(error.getMessage(), "MPT_EXPORT_SAVE_FAILED"); return; }
        if (transfer.choosing) { call.reject("请先完成已打开的保存操作。", "MPT_EXPORT_SAVE_FAILED"); return; }
        try {
            if (transfer.output == null || transfer.received != transfer.expectedBytes) throw new IllegalStateException("媒体文件尚未完整传输。");
            transfer.output.close(); transfer.output = null;
            verifyDigest(transfer.expectedHash, transfer.digest.digest());
            transfer.choosing = true;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(transfer.mime).putExtra(Intent.EXTRA_TITLE, transfer.name);
            startActivityForResult(call, intent, "destinationChosen");
        } catch (Exception error) { discard(transfer); call.reject(error.getMessage(), "MPT_EXPORT_SAVE_FAILED"); }
    }
    @ActivityCallback private synchronized void destinationChosen(PluginCall call, ActivityResult result) {
        if (call == null) { discard(active); return; }
        final PendingExport transfer;
        try { transfer = require(call); }
        catch (Exception error) { call.reject(error.getMessage(), "MPT_EXPORT_SAVE_FAILED"); return; }
        Uri destination = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || destination == null) {
            discard(transfer); call.reject("已取消保存，PC 原件仍保留。", "MPT_EXPORT_CANCELED"); return;
        }
        writer.execute(() -> {
            try {
                long copied = 0;
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (FileInputStream input = new FileInputStream(transfer.file); OutputStream output = getContext().getContentResolver().openOutputStream(destination)) {
                    if (output == null) throw new IllegalStateException("所选保存位置不可用。");
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (Thread.currentThread().isInterrupted()) throw new IllegalStateException("保存已中断。");
                        output.write(buffer, 0, count); digest.update(buffer, 0, count); copied += count;
                    }
                    output.flush();
                }
                if (copied != transfer.expectedBytes) throw new IllegalStateException("文件复制未完整完成。");
                verifyDigest(transfer.expectedHash, digest.digest());
                synchronized (this) { discard(transfer); }
                JSObject saved = new JSObject(); saved.put("bytesWritten", copied);
                String displayName = savedDisplayName(destination);
                if (displayName != null) saved.put("name", displayName);
                call.resolve(saved);
            } catch (Exception error) {
                synchronized (this) { discard(transfer); }
                call.reject("文件未完整保存，请检查所选位置的文件；PC 原件仍保留。", "MPT_EXPORT_SAVE_FAILED");
            }
        });
    }
    private String savedDisplayName(Uri destination) {
        try (Cursor cursor = getContext().getContentResolver().query(destination, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                String value = column < 0 ? null : cursor.getString(column);
                if (value != null && !value.isBlank()) return value;
            }
        } catch (Exception ignored) { }
        // Saving is complete even when the document provider withholds its
        // display name. The suggested name is not the saved document's name.
        return null;
    }
    @PluginMethod public synchronized void abortExport(PluginCall call) {
        if (active != null && active.id.equals(call.getString("id")) && !active.choosing) discard(active);
        call.resolve();
    }
    private PendingExport require(PluginCall call) {
        if (active == null || !active.id.equals(call.getString("id"))) throw new IllegalArgumentException("文件传输已结束或不属于当前保存操作。");
        return active;
    }
    private void discard(PendingExport transfer) {
        if (transfer == null) return;
        try { if (transfer.output != null) transfer.output.close(); } catch (Exception ignored) {}
        transfer.output = null; transfer.file.delete();
        if (active == transfer) active = null;
    }
    @Override protected synchronized void handleOnDestroy() { writer.shutdownNow(); discard(active); }
}
