package io.github.bearbabybaby_ai.bearbao;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.List;

/** 桌面小工具「熊寶貼心提醒」：30 天內提醒（可上下滑動）、今日分海、今日風浪 */
public class ReminderWidget extends AppWidgetProvider {
    private static final int[] ROOT_BG = {R.drawable.widget_bg_dawn, R.drawable.widget_bg_day, R.drawable.widget_bg_dusk, R.drawable.widget_bg_night};
    private static final int[] TIDE_BG = {R.drawable.widget_tide_dawn, R.drawable.widget_tide_day, R.drawable.widget_tide_dusk, R.drawable.widget_tide_night};
    private static final int[] WX_BG = {R.drawable.widget_wx_dawn, R.drawable.widget_wx_day, R.drawable.widget_wx_dusk, R.drawable.widget_wx_night};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context);
        if (WidgetData.needFetch(context)) {
            final PendingResult pending = goAsync();
            final Context app = context.getApplicationContext();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        WidgetData.fetchWeather(app);
                        render(app);
                    } finally {
                        pending.finish();
                    }
                }
            }).start();
        }
    }

    /** App 離開時、改選地區後呼叫 */
    public static void refresh(Context context) {
        final Context app = context.getApplicationContext();
        if (ids(app).length == 0) return;
        render(app);
        new Thread(new Runnable() {
            @Override
            public void run() {
                if (WidgetData.needFetch(app)) WidgetData.fetchWeather(app);
                render(app);
            }
        }).start();
    }

    private static int[] ids(Context context) {
        try {
            int[] ids = AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, ReminderWidget.class));
            return ids == null ? new int[0] : ids;
        } catch (Exception e) {
            return new int[0];
        }
    }

    private static int immutable() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    private static PendingIntent openApp(Context context, String view, int code) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (view != null) open.putExtra("xbView", view);
        return PendingIntent.getActivity(context, code, open, immutable());
    }

    private static void append(SpannableStringBuilder b, String text, int color, boolean bold) {
        int start = b.length();
        b.append(text);
        b.setSpan(new ForegroundColorSpan(color), start, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (bold) b.setSpan(new StyleSpan(Typeface.BOLD), start, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }

    private static String join(List<String> list) {
        StringBuilder b = new StringBuilder();
        for (String s : list) { if (b.length() > 0) b.append("、"); b.append(s); }
        return b.toString();
    }

    static void render(Context context) {
        int[] ids = ids(context);
        if (ids.length == 0) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int p = WidgetData.period();
        String today = "今日（" + WidgetData.monthDay(WidgetData.today()) + "）";

        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.reminder_widget);
            v.setInt(R.id.root, "setBackgroundResource", ROOT_BG[p]);
            v.setInt(R.id.tideBox, "setBackgroundResource", TIDE_BG[p]);
            v.setInt(R.id.wxBox, "setBackgroundResource", WX_BG[p]);
            v.setTextColor(R.id.head, WidgetData.head(p));

            /* 提醒清單：可上下滑動 */
            Intent svc = new Intent(context, ReminderListService.class);
            svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            svc.setData(Uri.parse("bearbao://widget/" + id + "/" + p));
            v.setRemoteAdapter(R.id.list, svc);
            v.setEmptyView(R.id.list, R.id.empty);
            List<WidgetData.Item> items = WidgetData.reminders(context);
            v.setTextViewText(R.id.empty, items == null ? "打開熊寶系統後就會顯示提醒" : "30 天內沒有提醒");
            v.setTextColor(R.id.empty, WidgetData.sub(p));
            int template = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
            Intent open = new Intent(context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            open.putExtra("xbView", "calendar");   /* 點提醒：開到「月曆」分頁 */
            v.setPendingIntentTemplate(R.id.list, PendingIntent.getActivity(context, 4, open, template));

            /* 今日分海 */
            v.setTextColor(R.id.tideTitle, WidgetData.text(p));
            v.setTextViewText(R.id.tideDate, today);
            v.setTextColor(R.id.tideDate, WidgetData.sub(p));
            SpannableStringBuilder t = new SpannableStringBuilder();
            List<List<String>> tide = WidgetData.tide(context);
            if (tide == null) {
                append(t, "打開熊寶系統後就會顯示", WidgetData.sub(p), false);
            } else if (tide.get(0).isEmpty() && tide.get(1).isEmpty() && tide.get(2).isEmpty()) {
                append(t, "今日暫無分海資料", WidgetData.sub(p), false);
            } else {
                if (!tide.get(0).isEmpty()) append(t, "緩慢分海 " + join(tide.get(0)), WidgetData.sep(p), true);
                if (!tide.get(1).isEmpty()) { if (t.length() > 0) t.append("\n"); append(t, "緩慢合海 " + join(tide.get(1)), WidgetData.mer(p), true); }
                List<String> safe = tide.get(2);
                for (int i = 0; i < safe.size(); i++) {
                    if (t.length() > 0) t.append("\n");
                    append(t, i == 0 ? "安全通行 " : "　　　　 ", WidgetData.sub(p), false);
                    append(t, safe.get(i), WidgetData.text(p), false);
                }
            }
            v.setTextViewText(R.id.tideBody, t);
            v.setOnClickPendingIntent(R.id.tideBox, openApp(context, "split", 1));

            /* 今日風浪 */
            v.setTextViewText(R.id.wxTitle, "🌬️ " + WidgetData.area(context) + "風浪▾");
            v.setTextColor(R.id.wxTitle, WidgetData.text(p));
            v.setTextViewText(R.id.wxDate, today);
            v.setTextColor(R.id.wxDate, WidgetData.sub(p));
            SpannableStringBuilder w = new SpannableStringBuilder();
            WidgetData.Weather wx = WidgetData.weather(context);
            if (wx == null) {
                append(w, "正在讀取風浪天氣…", WidgetData.sub(p), false);
            } else {
                append(w, wx.icon + " " + wx.sky + " " + wx.temp + "\n", WidgetData.text(p), false);
                append(w, wx.wind + (wx.rain >= 0 ? "・☔" + wx.rain + "%" : "") + "\n", WidgetData.text(p), false);
                append(w, wx.wave + "\n", WidgetData.text(p), false);
                append(w, wx.riskText, WidgetData.risk(wx.riskLevel, p), true);
            }
            v.setTextViewText(R.id.wxBody, w);
            v.setOnClickPendingIntent(R.id.wxBox, openApp(context, "wx", 2));
            Intent pick = new Intent(context, AreaPickerActivity.class);
            pick.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            v.setOnClickPendingIntent(R.id.wxTitle, PendingIntent.getActivity(context, 3, pick, immutable()));

            v.setOnClickPendingIntent(R.id.headRow, openApp(context, "calendar", 0));
            manager.updateAppWidget(id, v);
        }
        manager.notifyAppWidgetViewDataChanged(ids, R.id.list);
        scheduleNext(context, ids);
    }

    /* 到下一個時段交界（05、07、17、19 點）與午夜再更新一次，顏色與「今日」才會準時切換 */
    private static void scheduleNext(Context context, int[] ids) {
        try {
            Calendar now = Calendar.getInstance(WidgetData.TPE);
            Calendar next = (Calendar) now.clone();
            next.set(Calendar.MINUTE, 0);
            next.set(Calendar.SECOND, 5);
            next.set(Calendar.MILLISECOND, 0);
            int h = now.get(Calendar.HOUR_OF_DAY), target = -1;
            for (int m : new int[]{5, 7, 17, 19, 24}) if (m > h) { target = m; break; }
            if (target == 24) { next.add(Calendar.DAY_OF_MONTH, 1); target = 0; }
            next.set(Calendar.HOUR_OF_DAY, target);
            Intent intent = new Intent(context, ReminderWidget.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            PendingIntent pi = PendingIntent.getBroadcast(context, 7, intent, immutable());
            AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarm != null) alarm.set(AlarmManager.RTC, next.getTimeInMillis(), pi);
        } catch (Exception ignored) {
        }
    }
}
