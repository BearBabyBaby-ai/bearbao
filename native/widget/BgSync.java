package io.github.bearbabybaby_ai.bearbao;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 背景自己抓資料（不用開 App）：分海、特殊日期、活動列表、重要資訊提醒，整理成鎖屏月曆要用的格式 */
final class BgSync {
    private static final String HUB = "1LOr4_3ugTHvTIi4UIfgVz2atVFh2K32zh7YKrrHxTwk";
    private static final String GID_TIDE = "1122135459", GID_SPECIAL = "2116605762", GID_ACTIVITY = "1977832611";
    private static final long CAL_EVERY = 25 * 60000L, REMIND_EVERY = 55 * 60000L, TIDE_EVERY = 6 * 3600000L;
    private static final Pattern DATES = Pattern.compile("(\\d{4})\\s*[/\\-.年]\\s*(\\d{1,2})\\s*[/\\-.月]\\s*(\\d{1,2})");
    private static final Pattern FRACTION = Pattern.compile("^0?\\.\\d+$");

    private BgSync() {}

    /** 在背景執行緒呼叫；回傳是否有資料更新 */
    static synchronized boolean run(Context c) {
        SharedPreferences p = WidgetData.prefs(c);
        long now = System.currentTimeMillis();
        boolean changed = false;
        if (now - p.getLong("bg.tideAt", 0) > TIDE_EVERY) {
            String t = syncTide();
            if (t != null) { changed |= !t.equals(p.getString("xb.tide", "")); p.edit().putString("xb.tide", t).putLong("bg.tideAt", now).apply(); }
        }
        if (now - p.getLong("bg.remAt", 0) > REMIND_EVERY) {
            String r = syncReminders(p.getString("xb.url", ""), p.getString("xb.token", ""));
            if (r != null) { changed |= !r.equals(p.getString("xb.reminders", "")); p.edit().putString("xb.reminders", r).putLong("bg.remAt", now).apply(); }
        }
        if (now - p.getLong("bg.calAt", 0) > CAL_EVERY || changed) {
            String cal = buildCal(p);
            if (cal != null) { changed |= !cal.equals(p.getString("xb.cal", "")); p.edit().putString("xb.cal", cal).putLong("bg.calAt", now).apply(); }
        }
        return changed;
    }

    /* ---------- 網路 ---------- */
    private static String read(HttpURLConnection con) throws Exception {
        InputStream in = con.getInputStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        in.close();
        return b.toString("UTF-8");
    }

    private static String get(String url) {
        try {
            HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(10000);
            con.setReadTimeout(15000);
            con.setInstanceFollowRedirects(true);
            try {
                if (con.getResponseCode() != 200) return null;
                String t = read(con);
                return t.trim().startsWith("<") ? null : t;
            } finally { con.disconnect(); }
        } catch (Exception e) {
            return null;
        }
    }

    private static String post(String url, String body) {
        try {
            HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(10000);
            con.setReadTimeout(25000);
            con.setInstanceFollowRedirects(false);
            con.setRequestMethod("POST");
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
            OutputStream o = con.getOutputStream();
            o.write(body.getBytes("UTF-8"));
            o.close();
            int code = con.getResponseCode();
            if (code >= 300 && code < 400) {   /* 雲端程式回應會轉址，改用 GET 取結果 */
                String loc = con.getHeaderField("Location");
                con.disconnect();
                return loc == null ? null : get(loc);
            }
            try { return code == 200 ? read(con) : null; } finally { con.disconnect(); }
        } catch (Exception e) {
            return null;
        }
    }

    private static List<List<String>> sheet(String gid, String name) {
        String t = get("https://docs.google.com/spreadsheets/d/" + HUB + "/export?format=csv&gid=" + gid);
        if (t == null) {
            try { t = get("https://docs.google.com/spreadsheets/d/" + HUB + "/gviz/tq?tqx=out:csv&headers=1&sheet=" + URLEncoder.encode(name, "UTF-8")); } catch (Exception ignored) {}
        }
        return t == null ? null : csv(t);
    }

    static List<List<String>> csv(String t) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder f = new StringBuilder();
        boolean q = false;
        for (int i = 0; i < t.length(); i++) {
            char ch = t.charAt(i);
            if (q) {
                if (ch == '"') { if (i + 1 < t.length() && t.charAt(i + 1) == '"') { f.append('"'); i++; } else q = false; }
                else f.append(ch);
            } else if (ch == '"') q = true;
            else if (ch == ',') { row.add(f.toString()); f.setLength(0); }
            else if (ch == '\n') { row.add(f.toString()); f.setLength(0); addRow(rows, row); row = new ArrayList<>(); }
            else if (ch != '\r') f.append(ch);
        }
        if (f.length() > 0 || !row.isEmpty()) { row.add(f.toString()); addRow(rows, row); }
        return rows;
    }

    private static void addRow(List<List<String>> rows, List<String> row) {
        for (String v : row) if (!v.trim().isEmpty()) { rows.add(row); return; }
    }

    private static String cell(List<String> r, int i) { return i >= 0 && i < r.size() ? r.get(i).trim() : ""; }

    private static List<String> dates(String v) {
        List<String> out = new ArrayList<>();
        Matcher m = DATES.matcher(v == null ? "" : v);
        while (m.find()) out.add(String.format(Locale.ROOT, "%s/%02d/%02d", m.group(1), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3))));
        return out;
    }

    private static String fmtTime(String v) {
        String s = v == null ? "" : v.trim();
        if (FRACTION.matcher(s).matches()) {
            int m = (int) Math.round(Double.parseDouble(s) * 1440);
            return String.format(Locale.ROOT, "%02d:%02d", (m / 60) % 24, m % 60);
        }
        return s;
    }

    /* ---------- 分海（與熊寶系統相同的計算） ---------- */
    private static int toMin(String t) {
        if (t == null || !t.contains(":")) return 0;
        String[] p = t.split(":");
        try { return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim().substring(0, Math.min(2, p[1].trim().length()))); } catch (Exception e) { return 0; }
    }

    private static String fromMin(double m) {
        int v = (int) Math.max(0, Math.min(1439, Math.round(m)));
        return String.format(Locale.ROOT, "%02d:%02d", v / 60, v % 60);
    }

    private static Double calc(double t1, double h1, double t2, double h2, double target) {
        if (t1 >= t2) return null;
        double amp = Math.abs(h2 - h1) / 2, mid = (h1 + h2) / 2;
        if (amp == 0 || target < Math.min(h1, h2) || target > Math.max(h1, h2)) return null;
        double ratio = h1 <= h2 ? (mid - target) / amp : (target - mid) / amp;
        ratio = Math.max(-1, Math.min(1, ratio));
        return t1 + ((t2 - t1) / Math.PI) * Math.acos(ratio);
    }

    private static String syncTide() {
        String t = get("https://docs.google.com/spreadsheets/d/" + HUB + "/gviz/tq?tqx=out:csv&gid=" + GID_TIDE);
        if (t == null) return null;
        List<List<String>> all = csv(t);
        if (all.size() < 2) return null;
        List<List<String>> rows = all.subList(1, all.size());
        double th = 3.75;
        try { double v = Double.parseDouble(cell(rows.get(0), 11)); if (v > 0) th = v; } catch (Exception ignored) {}
        Pattern nd = Pattern.compile("(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})");
        Map<String, List<List<String>>> byDate = new LinkedHashMap<>();
        for (List<String> r : rows) {
            Matcher m = nd.matcher(cell(r, 0));
            if (!m.find()) continue;
            String k = String.format(Locale.ROOT, "%s/%02d/%02d", m.group(1), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
            List<List<String>> l = byDate.get(k);
            if (l == null) byDate.put(k, l = new ArrayList<>());
            l.add(r);
        }
        try {
            JSONObject out = new JSONObject();
            long today = WidgetData.today();
            for (int i = 0; i < 31; i++) {
                String k = WidgetData.dateKey(today + i);
                List<List<String>> l = byDate.get(k);
                if (l == null) continue;
                List<double[]> tides = new ArrayList<>();
                List<String> safe = new ArrayList<>();
                for (List<String> r : l) {
                    String tm = cell(r, 1);
                    try { double h = Double.parseDouble(cell(r, 2)); if (!tm.isEmpty() && !Double.isNaN(h)) tides.add(new double[]{toMin(tm), h}); } catch (Exception ignored) {}
                    String sf = cell(r, 10);
                    if (safe.isEmpty() && !sf.isEmpty() && !"0".equals(sf)) for (String x : sf.split("\\s+")) if (!x.isEmpty()) safe.add(x);
                }
                Collections.sort(tides, new Comparator<double[]>() { @Override public int compare(double[] a, double[] b) { return Double.compare(a[0], b[0]); } });
                List<double[]> pts = new ArrayList<>();   /* [分鐘, 1=分海 / 2=合海] */
                for (int j = 0; j < tides.size() - 1; j++) {
                    double[] a = tides.get(j), b = tides.get(j + 1);
                    boolean rising = a[1] <= b[1];
                    Double v = calc(a[0], a[1], b[0], b[1], rising ? -th : th);
                    if (v != null) pts.add(new double[]{v, rising ? 2 : 1});
                }
                Collections.sort(pts, new Comparator<double[]>() { @Override public int compare(double[] a, double[] b) { return Double.compare(a[0], b[0]); } });
                JSONArray sep = new JSONArray(), mer = new JSONArray(), sa = new JSONArray();
                for (double[] p : pts) (p[1] == 1 ? sep : mer).put(fromMin(p[0]));
                for (String x : safe) sa.put(x);
                JSONObject d = new JSONObject();
                d.put("sep", sep); d.put("mer", mer); d.put("safe", sa);
                out.put(k, d);
            }
            return out.length() == 0 ? null : out.toString();
        } catch (Exception e) {
            return null;
        }
    }

    /* ---------- 重要資訊提醒 ---------- */
    private static String syncReminders(String url, String token) {
        if (url.isEmpty() || token.isEmpty()) return null;
        try {
            JSONObject body = new JSONObject();
            body.put("action", "bootstrap");
            body.put("token", token);
            String t = post(url, body.toString());
            if (t == null) return null;
            JSONObject o = new JSONObject(t);
            if (!o.optBoolean("ok")) return null;
            JSONArray r = o.getJSONObject("data").optJSONArray("reminders");
            return r == null ? null : r.toString();
        } catch (Exception e) {
            return null;
        }
    }

    /* ---------- 月曆：特殊日期＋活動列表＋重要資訊提醒（與熊寶系統月曆相同的合併規則） ---------- */
    private static final class Item {
        String src, cat, name, start, end, time, remCat = "";
        boolean yearly;
    }

    private static int colIndex(List<String> head, String[] names, int fallback) {
        for (String n : names) for (int i = 0; i < head.size(); i++) if (head.get(i).trim().equals(n)) return i;
        return fallback;
    }

    private static List<Item> parseSheet(List<List<String>> rows, boolean special) {
        List<Item> out = new ArrayList<>();
        if (rows == null || rows.isEmpty()) return out;
        List<String> head = rows.get(0);
        int ic = colIndex(head, new String[]{"類別"}, 0), in = colIndex(head, new String[]{"名稱"}, 1);
        int id = colIndex(head, special ? new String[]{"日期"} : new String[]{"適用日期", "日期"}, 2), it = colIndex(head, new String[]{"時間"}, 3);
        for (List<String> r : rows.subList(1, rows.size())) {
            String cat = cell(r, ic), name = cell(r, in);
            List<String> ds = dates(cell(r, id));
            if (cat.isEmpty() || name.isEmpty() || ds.isEmpty()) continue;
            Item x = new Item();
            x.src = special ? "special" : "activity";
            x.cat = cat; x.name = name.replaceAll("(?i)<br\\s*/?>", " ").trim();
            String a = ds.get(0), b = ds.size() > 1 ? ds.get(1) : a;
            if (b.compareTo(a) < 0) { String t = a; a = b; b = t; }
            x.start = a; x.end = b; x.time = fmtTime(cell(r, it));
            x.yearly = special && name.contains("生日");
            out.add(x);
        }
        return out;
    }

    private static List<Item> parseReminders(String raw, String today) {
        List<Item> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(raw);
            int ty = Integer.parseInt(today.substring(0, 4)), tm = Integer.parseInt(today.substring(5, 7));
            for (int i = 0; i < a.length(); i++) {
                JSONObject r = a.optJSONObject(i);
                if (r == null || "已完成".equals(r.optString("狀態").trim())) continue;
                List<String> ds = dates(r.optString("提醒日期"));
                String title = r.optString("標題").trim();
                if (ds.isEmpty() || title.isEmpty()) continue;
                String d = ds.get(0), rep = r.optString("重複").trim();
                List<String> starts = new ArrayList<>();
                boolean yearly = "每年".equals(rep);
                if ("每月".equals(rep)) {
                    int dd = Integer.parseInt(d.substring(8, 10));
                    for (int k = -12; k <= 12; k++) {
                        int mm = tm - 1 + k, y = ty + (mm >= 0 ? mm / 12 : (mm - 11) / 12);
                        mm = ((mm % 12) + 12) % 12 + 1;
                        java.util.GregorianCalendar g = new java.util.GregorianCalendar(y, mm - 1, 1);
                        String key = String.format(Locale.ROOT, "%04d/%02d/%02d", y, mm, Math.min(dd, g.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)));
                        if (key.compareTo(d) >= 0) starts.add(key);
                    }
                } else starts.add(d);
                for (String s : starts) {
                    Item x = new Item();
                    x.src = "remind"; x.cat = "重要提醒"; x.name = title; x.start = s; x.end = s;
                    x.time = r.optString("時間").trim(); x.yearly = yearly; x.remCat = r.optString("類別").trim();
                    out.add(x);
                }
            }
        } catch (Exception ignored) {}
        return out;
    }

    private static boolean occurs(Item it, String key) {
        if (it.yearly) return key.substring(5).equals(it.start.substring(5)) && key.substring(0, 4).compareTo(it.start.substring(0, 4)) >= 0;
        return it.start.compareTo(key) <= 0 && key.compareTo(it.end) <= 0;
    }

    private static long dayNo(String k) {
        return WidgetData.dayNumber(Integer.parseInt(k.substring(0, 4)), Integer.parseInt(k.substring(5, 7)), Integer.parseInt(k.substring(8, 10)));
    }

    /** 回傳 {標籤, 顏色, 圖示, 類別} */
    private static String[] look(Item it) {
        if ("remind".equals(it.src)) {
            switch (it.remCat) {
                case "繳費": return new String[]{"繳費", "#854D0E", "💳", it.remCat};
                case "機票搶票": return new String[]{"搶票", "#C2410C", "🎫", it.remCat};
                case "醫療": return new String[]{"醫療", "#B91C1C", "🏥", it.remCat};
                case "生日紀念": return new String[]{"生日", "#BE185D", "🎂", it.remCat};
                case "車輛保養": return new String[]{"保養", "#1D4ED8", "🔧", it.remCat};
                case "證件": return new String[]{"證件", "#6D28D9", "🪪", it.remCat};
                case "保險": return new String[]{"保險", "#0E7490", "🛡️", it.remCat};
                case "預約": return new String[]{"預約", "#15803D", "📌", it.remCat};
                case "稅務": return new String[]{"稅務", "#4D7C0F", "🧾", it.remCat};
                case "節日": return new String[]{"節日", "#A21CAF", "🎉", it.remCat};
                default: return new String[]{"提醒", "#1F2937", "🔔", it.remCat};
            }
        }
        if ("activity".equals(it.src)) return new String[]{"活動", "#1D4ED8", "📅", "活動"};
        String two = it.name.length() > 2 ? it.name.substring(0, 2) : it.name;
        if (it.name.contains("生日")) return new String[]{"生日", "#BE185D", "🎂", "生日紀念"};
        if ("節日".equals(it.cat)) return new String[]{two, "#A21CAF", "🎉", "節日"};
        if ("機票搶票".equals(it.cat)) return new String[]{"搶票", "#C2410C", "🎫", "機票搶票"};
        if (it.name.contains("回診")) return new String[]{"回診", "#B91C1C", "🏥", "醫療"};
        return new String[]{two, "#0F766E", "📌", it.cat};
    }

    private static String buildCal(SharedPreferences p) {
        List<List<String>> sp = sheet(GID_SPECIAL, "特殊日期"), ac = sheet(GID_ACTIVITY, "活動列表");
        if (sp == null && ac == null) return null;   /* 沒網路：沿用舊資料 */
        String today = WidgetData.dateKey(WidgetData.today());
        List<Item> base = new ArrayList<>();
        base.addAll(parseSheet(sp, true));
        base.addAll(parseSheet(ac, false));
        Set<String> yearlyNames = new HashSet<>(), keys = new HashSet<>();
        for (Item it : base) { if (it.yearly) yearlyNames.add(it.name); keys.add(it.name + "|" + it.start); }
        List<Item> items = new ArrayList<>(base);
        for (Item x : parseReminders(p.getString("xb.reminders", "[]"), today)) if (!yearlyNames.contains(x.name) && !keys.contains(x.name + "|" + x.start)) items.add(x);
        Set<String> hidden = new HashSet<>();
        for (String h : p.getString("xb.calHidden", "").split("[,，、\\s]+")) if (!h.trim().isEmpty()) hidden.add(h.trim());
        List<Item> vis = new ArrayList<>();
        for (Item it : items) if (!hidden.contains(it.cat) && !"縣府政策".equals(it.cat) && (it.yearly || it.end.compareTo(today) >= 0)) vis.add(it);
        Collections.sort(vis, new Comparator<Item>() {
            @Override public int compare(Item a, Item b) { int c = a.start.compareTo(b.start); return c != 0 ? c : (a.time == null ? "" : a.time).compareTo(b.time == null ? "" : b.time); }
        });
        try {
            JSONObject marks = new JSONObject();
            JSONArray list = new JSONArray();
            long t0 = dayNo(today.substring(0, 8) + "01"), tEnd = dayNo(today) + 70, tToday = dayNo(today);
            for (long d = t0; d <= tEnd; d++) {
                String k = WidgetData.dateKey(d);
                JSONArray cell = new JSONArray();
                for (Item it : vis) {
                    if (!occurs(it, k)) continue;
                    boolean shown = it.yearly || dayNo(it.end) - dayNo(it.start) < 7 || it.start.equals(k);
                    String[] l = look(it);
                    if (shown && cell.length() < 2) { JSONObject m = new JSONObject(); m.put("t", l[0]); m.put("c", l[1]); cell.put(m); }
                    if (d >= tToday && list.length() < 8 && (it.yearly || it.start.equals(k))) {
                        boolean allDay = "生日紀念".equals(l[3]) || "節日".equals(l[3]);
                        JSONObject e = new JSONObject();
                        e.put("d", k);
                        e.put("n", l[2] + " " + it.name + ("機票搶票".equals(l[3]) ? " 開搶" : ""));
                        e.put("tm", allDay || it.time == null ? "" : it.time);
                        e.put("c", l[1]);
                        list.put(e);
                    }
                }
                if (cell.length() > 0) marks.put(k, cell);
            }
            JSONObject out = new JSONObject();
            out.put("marks", marks);
            out.put("list", list);
            return out.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
