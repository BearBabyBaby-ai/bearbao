package io.github.bearbabybaby_ai.bearbao;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 網頁呼叫：鎖屏月曆的狀態、選照片、開關 */
@CapacitorPlugin(name = "BearLock")
public class BearLockPlugin extends Plugin {
    private JSObject state() {
        JSObject r = new JSObject();
        r.put("on", LockCalendar.enabled(getContext()));
        r.put("hasPhoto", LockCalendar.bgFile(getContext()).exists());
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) { call.resolve(state()); }

    @PluginMethod
    public void pick(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("image/*");
        startActivityForResult(call, i, "picked");
    }

    @ActivityCallback
    private void picked(final PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("沒有選擇照片");
            return;
        }
        final Uri uri = result.getData().getData();
        final Context ctx = getContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    LockCalendar.saveBackground(ctx, uri);
                    LockCalendar.setEnabled(ctx, true);
                    if (!LockCalendar.refresh(ctx, true)) { call.reject("鎖屏設定失敗"); return; }
                    call.resolve(state());
                } catch (Exception e) {
                    call.reject("照片讀取失敗");
                }
            }
        }).start();
    }

    @PluginMethod
    public void enable(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        final Context ctx = getContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                if (on) {
                    if (!LockCalendar.bgFile(ctx).exists()) { call.reject("請先選擇鎖屏照片"); return; }
                    LockCalendar.setEnabled(ctx, true);
                    if (!LockCalendar.refresh(ctx, true)) { call.reject("鎖屏設定失敗"); return; }
                } else {
                    LockCalendar.disable(ctx);
                    LockCalendar.schedule(ctx);
                }
                call.resolve(state());
            }
        }).start();
    }
}
