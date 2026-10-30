package io.github.bearbabybaby_ai.bearbao;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.WallpaperManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** 鎖屏月曆：在使用者挑選的照片上畫出國曆＋農曆月曆、今日分海、近期提醒・活動，設成鎖屏畫面 */
final class LockCalendar {
    private static final String BG = "lock_bg.jpg";

    private LockCalendar() {}

    static boolean enabled(Context c) { return "1".equals(WidgetData.prefs(c).getString("xb.lockOn", "")); }

    static File bgFile(Context c) { return new File(c.getFilesDir(), BG); }

    static void setEnabled(Context c, boolean on) {
        WidgetData.prefs(c).edit().putString("xb.lockOn", on ? "1" : "").remove("xb.lockSig").apply();
    }

    /** 關閉：鎖屏改回跟桌面相同的桌布 */
    static void disable(Context c) {
        setEnabled(c, false);
        if (Build.VERSION.SDK_INT >= 24) {
            try { WallpaperManager.getInstance(c).clear(WallpaperManager.FLAG_LOCK); } catch (Exception ignored) {}
        }
    }

    static void refreshAsync(Context c) {
        final Context app = c.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try { refresh(app, false); } catch (Throwable ignored) {}
            }
        }).start();
    }

    /* ---------- 底圖：依手機畫面大小縮小後存起來 ---------- */
    static void saveBackground(Context c, Uri uri) throws Exception {
        int[] wh = screenSize(c);
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        InputStream in = c.getContentResolver().openInputStream(uri);
        BitmapFactory.decodeStream(in, null, o);
        if (in != null) in.close();
        int sample = 1;
        while (o.outWidth / (sample * 2) >= wh[0] && o.outHeight / (sample * 2) >= wh[1]) sample *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        in = c.getContentResolver().openInputStream(uri);
        Bitmap bmp = BitmapFactory.decodeStream(in, null, o2);
        if (in != null) in.close();
        if (bmp == null) throw new Exception("無法讀取照片");
        int rotate = 0;
        if (Build.VERSION.SDK_INT >= 24) {
            try {
                InputStream ex = c.getContentResolver().openInputStream(uri);
                if (ex != null) {
                    android.media.ExifInterface exif = new android.media.ExifInterface(ex);
                    int ori = exif.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_NORMAL);
                    rotate = ori == android.media.ExifInterface.ORIENTATION_ROTATE_90 ? 90 : ori == android.media.ExifInterface.ORIENTATION_ROTATE_180 ? 180 : ori == android.media.ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
                    ex.close();
                }
            } catch (Exception ignored) {}
        }
        if (rotate != 0) {
            Matrix m = new Matrix();
            m.postRotate(rotate);
            Bitmap r = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            bmp.recycle();
            bmp = r;
        }
        FileOutputStream out = new FileOutputStream(bgFile(c));
        bmp.compress(Bitmap.CompressFormat.JPEG, 92, out);
        out.close();
        bmp.recycle();
        WidgetData.prefs(c).edit().remove("xb.lockSig").apply();
    }

    @SuppressWarnings("deprecation")
    static int[] screenSize(Context c) {
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics dm = new DisplayMetrics();
        if (wm != null) wm.getDefaultDisplay().getRealMetrics(dm);
        else dm = c.getResources().getDisplayMetrics();
        int w = Math.min(dm.widthPixels, dm.heightPixels), h = Math.max(dm.widthPixels, dm.heightPixels);
        return new int[]{Math.max(w, 720), Math.max(h, 1280)};
    }

    /* ---------- 顯示這個月（每月 1 日換月） ---------- */
    private static int[] shownMonth() {
        Calendar now = Calendar.getInstance(WidgetData.TPE);
        return new int[]{now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1};
    }

    /** 資料沒變就不重設鎖屏，避免畫面閃動 */
    static synchronized boolean refresh(Context c, boolean force) {
        if (Build.VERSION.SDK_INT < 24 || !enabled(c) || !bgFile(c).exists()) return false;
        SharedPreferences p = WidgetData.prefs(c);
        int[] wh = screenSize(c);
        int[] ym = shownMonth();
        String sig = WidgetData.dateKey(WidgetData.today()) + "|" + ym[0] + ym[1] + "|" + wh[0] + "x" + wh[1] + "|" + bgFile(c).lastModified()
            + "|" + p.getString("xb.cal", "").hashCode() + "|" + p.getString("xb.tide", "").hashCode();
        schedule(c);
        if (!force && sig.equals(p.getString("xb.lockSig", ""))) return true;
        try {
            Bitmap bmp = draw(c, wh[0], wh[1], ym[0], ym[1]);
            if (Build.VERSION.SDK_INT >= 24) WallpaperManager.getInstance(c).setBitmap(bmp, null, true, WallpaperManager.FLAG_LOCK);
            bmp.recycle();
            p.edit().putString("xb.lockSig", sig).apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /* ---------- 每天午夜、約每 30 分鐘檢查一次 ---------- */
    static void schedule(Context c) {
        try {
            AlarmManager alarm = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (alarm == null) return;
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            Intent midnight = new Intent(c, LockCalReceiver.class).setAction("io.github.bearbabybaby_ai.bearbao.LOCK_MIDNIGHT");
            Intent repeat = new Intent(c, LockCalReceiver.class).setAction("io.github.bearbabybaby_ai.bearbao.LOCK_REPEAT");
            if (!enabled(c)) {
                alarm.cancel(PendingIntent.getBroadcast(c, 21, midnight, flags));
                alarm.cancel(PendingIntent.getBroadcast(c, 22, repeat, flags));
                return;
            }
            Calendar next = Calendar.getInstance(WidgetData.TPE);
            next.add(Calendar.DAY_OF_MONTH, 1);
            next.set(Calendar.HOUR_OF_DAY, 0);
            next.set(Calendar.MINUTE, 0);
            next.set(Calendar.SECOND, 30);
            next.set(Calendar.MILLISECOND, 0);
            alarm.set(AlarmManager.RTC, next.getTimeInMillis(), PendingIntent.getBroadcast(c, 21, midnight, flags));
            if (PendingIntent.getBroadcast(c, 22, repeat, PendingIntent.FLAG_NO_CREATE | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)) == null) {
                long every = AlarmManager.INTERVAL_HALF_HOUR;
                alarm.setInexactRepeating(AlarmManager.RTC, System.currentTimeMillis() + every, every, PendingIntent.getBroadcast(c, 22, repeat, flags));
            }
        } catch (Exception ignored) {}
    }

    /* ---------- 繪製 ---------- */
    private static int col(String hex, int fallback) {
        try { return Color.parseColor(hex); } catch (Exception e) { return fallback; }
    }

    private static TextPaint text(float size, int color, boolean bold) {
        TextPaint t = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        t.setTextSize(size);
        t.setColor(color);
        t.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        return t;
    }

    private static Paint fill(int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        return p;
    }

    private static final class Line {
        final List<String> parts = new ArrayList<>();
        final List<Integer> colors = new ArrayList<>();
        final List<Boolean> bolds = new ArrayList<>();
        Line add(String s, int c, boolean b) { parts.add(s); colors.add(c); bolds.add(b); return this; }
    }

    static Bitmap draw(Context c, int w, int h, int year, int month) {
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        cv.drawColor(Color.parseColor("#DDE7EE"));
        Bitmap bg = BitmapFactory.decodeFile(bgFile(c).getAbsolutePath());
        if (bg != null) {
            float sc = Math.max(w / (float) bg.getWidth(), h / (float) bg.getHeight());
            Matrix m = new Matrix();
            m.postScale(sc, sc);
            m.postTranslate((w - bg.getWidth() * sc) / 2f, (h - bg.getHeight() * sc) / 2f);
            cv.drawBitmap(bg, m, new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG));
            bg.recycle();
        }
        float s = w / 910f;
        float L = 41 * s, RX = w - 41 * s, cardW = RX - L;
        float top = h * 0.3727f;

        /* 資料 */
        JSONObject cal = null;
        try { cal = new JSONObject(WidgetData.prefs(c).getString("xb.cal", "{}")); } catch (Exception ignored) {}
        JSONObject marks = cal == null ? null : cal.optJSONObject("marks");
        JSONArray list = cal == null ? null : cal.optJSONArray("list");
        long today = WidgetData.today();
        String todayKey = WidgetData.dateKey(today);

        /* 月曆格子 */
        long first = WidgetData.dayNumber(year, month, 1);
        GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        g.clear();
        g.set(year, month - 1, 1);
        int lead = g.get(Calendar.DAY_OF_WEEK) - 1;   /* 週日開始 */
        int days = g.getActualMaximum(Calendar.DAY_OF_MONTH);
        int rows = (lead + days + 6) / 7;
        float pad = 20 * s, gap = 5 * s, cellH = 112 * s, headH = 54 * s, weekH = 36 * s;
        float cellW = (cardW - pad * 2 - gap * 6) / 7f;
        float cardH = pad + headH + 10 * s + weekH + rows * (cellH + gap) - gap + 18 * s;
        cv.drawRoundRect(new RectF(L, top, RX, top + cardH), 40 * s, 40 * s, fill(Color.argb(205, 255, 255, 255)));

        /* 標題列 */
        float hx = L + pad, hy = top + pad;
        try {
            Drawable icon = c.getResources().getDrawable(R.mipmap.ic_launcher, null);
            icon.setBounds((int) hx, (int) (hy + 5 * s), (int) (hx + 44 * s), (int) (hy + 49 * s));
            icon.draw(cv);
        } catch (Exception ignored) {}
        TextPaint title = text(38 * s, col("#075985", Color.BLUE), true);
        cv.drawText(String.format(Locale.ROOT, "國曆 %d 年 %d 月", year, month), hx + 56 * s, hy + 41 * s, title);
        TextPaint mine = text(24 * s, col("#475569", Color.DKGRAY), true);
        mine.setTextAlign(Paint.Align.RIGHT);
        cv.drawText("熊寶專屬", RX - pad, hy + 38 * s, mine);

        /* 星期 */
        float wy = hy + headH + 10 * s;
        String[] wk = {"日", "一", "二", "三", "四", "五", "六"};
        for (int i = 0; i < 7; i++) {
            TextPaint t = text(25 * s, col(i == 0 || i == 6 ? "#DC2626" : "#334155", Color.BLACK), true);
            t.setTextAlign(Paint.Align.CENTER);
            cv.drawText(wk[i], L + pad + i * (cellW + gap) + cellW / 2f, wy + 27 * s, t);
        }

        /* 日期格 */
        float gy = wy + weekH;
        for (int d = 1; d <= days; d++) {
            int idx = lead + d - 1, r = idx / 7, ci = idx % 7;
            float x = L + pad + ci * (cellW + gap), y = gy + r * (cellH + gap);
            long dayNo = first + d - 1;
            boolean isToday = dayNo == today, weekend = ci == 0 || ci == 6;
            cv.drawRoundRect(new RectF(x, y, x + cellW, y + cellH), 14 * s, 14 * s, fill(isToday ? col("#0A6FB3", Color.BLUE) : Color.argb(191, 255, 255, 255)));
            float cx = x + cellW / 2f;
            TextPaint num = text(28 * s, isToday ? Color.WHITE : col(weekend ? "#DC2626" : "#1F2937", Color.BLACK), true);
            num.setTextAlign(Paint.Align.CENTER);
            cv.drawText(String.valueOf(d), cx, y + 33 * s, num);
            TextPaint lun = text(19 * s, isToday ? col("#DBEAFE", Color.WHITE) : col("#64748B", Color.GRAY), false);
            lun.setTextAlign(Paint.Align.CENTER);
            cv.drawText(Lunar.label(dayNo), cx, y + 57 * s, lun);
            JSONArray mk = marks == null ? null : marks.optJSONArray(WidgetData.dateKey(dayNo));
            JSONObject m0 = mk == null ? null : mk.optJSONObject(0);
            if (m0 != null) {
                String tag = m0.optString("t");
                TextPaint tp = text(20 * s, Color.WHITE, true);
                tp.setTextAlign(Paint.Align.CENTER);
                float tw = Math.min(tp.measureText(tag) + 12 * s, cellW - 6 * s);
                float ty = y + 66 * s;
                cv.drawRoundRect(new RectF(cx - tw / 2f, ty, cx + tw / 2f, ty + 27 * s), 7 * s, 7 * s, fill(col(m0.optString("c"), Color.GRAY)));
                cv.drawText(TextUtils.ellipsize(tag, tp, tw - 8 * s, TextUtils.TruncateAt.END).toString(), cx, ty + 21 * s, tp);
            }
        }

        /* 下方兩塊：今日分海、近期提醒・活動 */
        float py = top + cardH + 17 * s, pw = (cardW - 16 * s) / 2f, lh = 37.5f * s, ip = 18 * s;
        String todayMD = "今日（" + WidgetData.monthDay(today) + "）";

        List<Line> tideLines = new ArrayList<>();
        List<List<String>> tide = WidgetData.tide(c);
        int grey = col("#374151", Color.DKGRAY), ink = col("#111827", Color.BLACK);
        if (tide == null) tideLines.add(new Line().add("打開熊寶系統後就會顯示", grey, false));
        else if (tide.get(0).isEmpty() && tide.get(1).isEmpty() && tide.get(2).isEmpty()) tideLines.add(new Line().add("今日暫無分海資料", grey, false));
        else {
            if (!tide.get(0).isEmpty()) tideLines.add(new Line().add("緩慢分海 " + TextUtils.join("、", tide.get(0)), col("#115E59", ink), true));
            if (!tide.get(1).isEmpty()) tideLines.add(new Line().add("緩慢合海 " + TextUtils.join("、", tide.get(1)), col("#92400E", ink), true));
            List<String> safe = tide.get(2);
            for (int i = 0; i < safe.size(); i++) tideLines.add(new Line().add(i == 0 ? "安全通行 " : "　　　　 ", grey, false).add(safe.get(i), ink, false));
        }

        List<Line> listLines = new ArrayList<>();
        if (list != null) {
            for (int i = 0; i < list.length() && listLines.size() < 4; i++) {
                JSONObject it = list.optJSONObject(i);
                if (it == null || it.optString("d").compareTo(todayKey) < 0) continue;
                String d = it.optString("d");
                String md = d.length() >= 10 ? d.substring(5, 7) + "/" + d.substring(8, 10) : d;
                String tm = it.optString("tm");
                listLines.add(new Line().add(md + " " + it.optString("n") + (tm.isEmpty() ? "" : " " + tm), col(it.optString("c"), ink), true));
            }
        }
        if (listLines.isEmpty()) listLines.add(new Line().add(cal == null || list == null ? "打開熊寶系統後就會顯示" : "近期沒有提醒或活動", grey, false));

        int n = Math.max(4, Math.max(tideLines.size(), listLines.size()));
        float ph = 16 * s + 36 * s + n * lh + 14 * s;
        drawPanel(cv, s, L, py, pw, ph, col("#E1F3EF", Color.WHITE), 235, "🌊 奎壁山分海", todayMD, tideLines, lh, ip);
        drawPanel(cv, s, L + pw + 16 * s, py, pw, ph, Color.WHITE, 224, "📋 近期提醒・活動", null, listLines, lh, ip);
        return out;
    }

    private static void drawPanel(Canvas cv, float s, float x, float y, float w, float h, int bg, int alpha, String title, String right, List<Line> lines, float lh, float ip) {
        cv.drawRoundRect(new RectF(x, y, x + w, y + h), 32 * s, 32 * s, fill(Color.argb(alpha, Color.red(bg), Color.green(bg), Color.blue(bg))));
        TextPaint tp = text(27 * s, Color.parseColor("#111827"), true);
        float by = y + 16 * s + 28 * s;
        cv.drawText(title, x + ip, by, tp);
        if (right != null) {
            TextPaint rp = text(21 * s, Color.parseColor("#475569"), false);
            rp.setTextAlign(Paint.Align.RIGHT);
            cv.drawText(right, x + w - ip, by, rp);
        }
        float ly = by + 8 * s + lh - 8 * s;
        float maxW = w - ip * 2;
        for (Line ln : lines) {
            float lx = x + ip;
            for (int i = 0; i < ln.parts.size(); i++) {
                TextPaint t = text(25 * s, ln.colors.get(i), ln.bolds.get(i));
                String str = TextUtils.ellipsize(ln.parts.get(i), t, Math.max(0, x + ip + maxW - lx), TextUtils.TruncateAt.END).toString();
                cv.drawText(str, lx, ly, t);
                lx += t.measureText(str);
            }
            ly += lh;
        }
    }
}
