package io.github.bearbabybaby_ai.bearbao;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 桌面小工具：顯示 30 天內的重要資訊提醒，點一下打開熊寶系統 */
public class ReminderWidget extends AppWidgetProvider {
    private static final String PREFS = "io.github.bearbabybaby_ai.bearbao.reminders";
    private static final int DAYS = 30;
    private static final int[] ROW = {R.id.row1, R.id.row2, R.id.row3, R.id.row4};
    private static final int[] TITLE = {R.id.title1, R.id.title2, R.id.title3, R.id.title4};
    private static final int[] DUE = {R.id.due1, R.id.due2, R.id.due3, R.id.due4};
    private static final Pattern DATE = Pattern.compile("(\\d{4})\\D(\\d{1,2})\\D(\\d{1,2})");
    private static final Pattern TIME = Pattern.compile("(\\d{1,2})\\s*[:：]\\s*(\\d{2})");

    private static class Item {
        long day;
        long diff;
        int minutes;
        String cat;
        String title;
        String due;
    }

    /* 時段配色（與熊寶系統相同）：清晨 05–07、白天 07–17、傍晚 17–19、晚上 19–05 */
    private static final int DAWN = 0, DAY = 1, DUSK = 2, NIGHT = 3;
    private static final int[] BG = {R.drawable.widget_bg_dawn, R.drawable.widget_bg_day, R.drawable.widget_bg_dusk, R.drawable.widget_bg_night};
    private static final String[] HEAD = {"#C2577F", "#0A6FB3", "#6B2A5E", "#E0E7FF"};
    private static final String[] MUTED = {"#7A5563", "#4B6478", "#6E5468", "#A5B4CF"};

    private static int period(Calendar now) {
        int h = now.get(Calendar.HOUR_OF_DAY);
        return h >= 5 && h < 7 ? DAWN : h >= 7 && h < 17 ? DAY : h >= 17 && h < 19 ? DUSK : NIGHT;
    }

    /* 類別文字顏色：白天類時段用深色，晚上用亮色 */
    private static int catColor(String cat, boolean night) {
        String c;
        switch (cat) {
            case "繳費": case "機票搶票": c = night ? "#FDBA74" : "#C2410C"; break;
            case "證件": c = night ? "#C4B5FD" : "#6D28D9"; break;
            case "保險": c = night ? "#67E8F9" : "#0E7490"; break;
            case "車輛保養": c = night ? "#93C5FD" : "#1D4ED8"; break;
            case "稅務": c = night ? "#FCD34D" : "#92400E"; break;
            case "醫療": case "節日": c = night ? "#FCA5A5" : "#B91C1C"; break;
            case "預約": c = night ? "#86EFAC" : "#15803D"; break;
            case "生日紀念": c = night ? "#F9A8D4" : "#BE185D"; break;
            default: c = night ? "#E5E7EB" : "#1F2937";
        }
        return Color.parseColor(c);
    }

    private static int dueColor(long diff, boolean night) {
        if (diff == 0) return Color.parseColor(night ? "#F87171" : "#B91C1C");
        if (diff == 1) return Color.parseColor(night ? "#FB923C" : "#C2410C");
        return Color.parseColor(night ? "#5EEAD4" : "#0F766E");
    }

    /* 到下一個時段交界時再更新一次，顏色才會準時切換 */
    private static void scheduleNext(Context context, Calendar now) {
        try {
            int[] marks = {5, 7, 17, 19};
            Calendar next = (Calendar) now.clone();
            next.set(Calendar.MINUTE, 0);
            next.set(Calendar.SECOND, 5);
            next.set(Calendar.MILLISECOND, 0);
            int h = now.get(Calendar.HOUR_OF_DAY), target = -1;
            for (int m : marks) if (m > h) { target = m; break; }
            if (target < 0) { next.add(Calendar.DAY_OF_MONTH, 1); target = 5; }
            next.set(Calendar.HOUR_OF_DAY, target);
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, ReminderWidget.class));
            Intent intent = new Intent(context, ReminderWidget.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(context, 7, intent, flags);
            AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarm != null) alarm.set(AlarmManager.RTC, next.getTimeInMillis(), pi);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    /** App 離開前呼叫，讓桌面上的內容跟著更新 */
    public static void refresh(Context context) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, ReminderWidget.class));
            if (ids == null || ids.length == 0) return;
            RemoteViews views = build(context);
            for (int id : ids) manager.updateAppWidget(id, views);
        } catch (Exception ignored) {
        }
    }

    private static String icon(String cat) {
        switch (cat) {
            case "機票搶票": return "🎫";
            case "生日紀念": return "🎂";
            case "節日": return "🎉";
            case "繳費": return "💳";
            case "證件": return "🪪";
            case "保險": return "🛡️";
            case "車輛保養": return "🔧";
            case "稅務": return "🧾";
            case "醫療": return "🏥";
            case "預約": return "📌";
            case "其他": return "📎";
            default: return "🔔";
        }
    }

    private static long dayNumber(int y, int m, int d) {
        GregorianCalendar c = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        c.clear();
        c.set(y, m - 1, d);
        return c.getTimeInMillis() / 86400000L;
    }

    private static String monthDay(long day) {
        GregorianCalendar c = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        c.setTimeInMillis(day * 86400000L);
        return (c.get(Calendar.MONTH) + 1) + "/" + c.get(Calendar.DAY_OF_MONTH);
    }

    private static List<Item> items(Context context) {
        List<Item> out = new ArrayList<>();
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("xb.reminders", null);
        if (raw == null) return null;
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("Asia/Taipei"));
        long today = dayNumber(now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
        try {
            JSONArray list = new JSONArray(raw);
            for (int i = 0; i < list.length(); i++) {
                JSONObject r = list.optJSONObject(i);
                if (r == null || "已完成".equals(r.optString("狀態").trim())) continue;
                Matcher m = DATE.matcher(r.optString("提醒日期"));
                if (!m.find()) continue;
                int y = Integer.parseInt(m.group(1)), mo = Integer.parseInt(m.group(2)), d = Integer.parseInt(m.group(3));
                String rep = r.optString("重複").trim();
                int step = "每月".equals(rep) ? 1 : "每年".equals(rep) ? 12 : 0;
                long day = dayNumber(y, mo, d);
                int guard = 0;
                while (step > 0 && day < today && guard++ < 1200) {
                    GregorianCalendar c = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
                    c.clear();
                    c.set(y, mo - 1 + step, d);
                    y = c.get(Calendar.YEAR);
                    mo = c.get(Calendar.MONTH) + 1;
                    d = c.get(Calendar.DAY_OF_MONTH);
                    day = dayNumber(y, mo, d);
                }
                long diff = day - today;
                if (diff < 0 || diff > DAYS) continue;
                Matcher t = TIME.matcher(r.optString("時間"));
                boolean hasTime = t.find();
                String cat = r.optString("類別").trim();
                Item it = new Item();
                it.day = day;
                it.diff = diff;
                it.cat = cat;
                it.minutes = hasTime ? Integer.parseInt(t.group(1)) * 60 + Integer.parseInt(t.group(2)) : 9 * 60;
                it.title = icon(cat) + " " + r.optString("標題").trim() + ("機票搶票".equals(cat) ? " 開搶" : "");
                String when = diff == 0 ? "今天" : diff == 1 ? "明天" : diff + " 天後";
                it.due = monthDay(day) + "・" + when + (hasTime ? " " + t.group(1) + ":" + t.group(2) : "");
                out.add(it);
            }
        } catch (Exception e) {
            return out;
        }
        Collections.sort(out, new Comparator<Item>() {
            @Override
            public int compare(Item a, Item b) {
                if (a.day != b.day) return a.day < b.day ? -1 : 1;
                return Integer.compare(a.minutes, b.minutes);
            }
        });
        return out;
    }

    private static RemoteViews build(Context context) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.reminder_widget);
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("Asia/Taipei"));
        int p = period(now);
        boolean night = p == NIGHT;
        v.setInt(R.id.root, "setBackgroundResource", BG[p]);
        v.setTextColor(R.id.head, Color.parseColor(HEAD[p]));
        v.setTextColor(R.id.empty, Color.parseColor(MUTED[p]));
        scheduleNext(context, now);
        List<Item> list = items(context);
        int n = list == null ? 0 : Math.min(ROW.length, list.size());
        for (int i = 0; i < ROW.length; i++) {
            if (i < n) {
                Item it = list.get(i);
                v.setViewVisibility(ROW[i], View.VISIBLE);
                v.setTextViewText(TITLE[i], it.title);
                v.setTextViewText(DUE[i], it.due);
                v.setTextColor(TITLE[i], catColor(it.cat, night));
                v.setTextColor(DUE[i], dueColor(it.diff, night));
            } else {
                v.setViewVisibility(ROW[i], View.GONE);
            }
        }
        if (n == 0) {
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setTextViewText(R.id.empty, list == null ? "打開熊寶系統後就會顯示提醒" : "30 天內沒有提醒");
        } else {
            v.setViewVisibility(R.id.empty, View.GONE);
        }
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(context, 0, open, flags));
        return v;
    }
}
