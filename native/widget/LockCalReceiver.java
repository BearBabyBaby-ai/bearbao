package io.github.bearbabybaby_ai.bearbao;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 午夜、約每 30 分鐘、開機後：背景抓資料並更新鎖屏月曆 */
public class LockCalReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    boolean changed = BgSync.run(app);   /* 先自己去抓最新資料（不用開 App） */
                    LockCalendar.refresh(app, false);
                    if (changed) ReminderWidget.render(app);
                } catch (Throwable ignored) {
                } finally {
                    pending.finish();
                }
            }
        }).start();
    }
}
