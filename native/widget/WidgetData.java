package io.github.bearbabybaby_ai.bearbao;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.GregorianCalendar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 桌面小工具的資料與配色 */
final class WidgetData {
    static final String PREFS = "io.github.bearbabybaby_ai.bearbao.reminders";
    static final TimeZone TPE = TimeZone.getTimeZone("Asia/Taipei");
    private static final int DAYS = 30;
    private static final Pattern DATE = Pattern.compile("(\\d{4})\\D(\\d{1,2})\\D(\\d{1,2})");
    private static final Pattern TIME = Pattern.compile("(\\d{1,2})\\s*[:：]\\s*(\\d{2})");

    /* 五鄉一市：天氣用鄉市中心，浪高用外海格點（與熊寶系統相同） */
    static final Map<String, double[]> AREAS = new LinkedHashMap<>();
    static {
        AREAS.put("馬公市", new double[]{23.5667, 119.5833, 23.55, 119.54});
        AREAS.put("湖西鄉", new double[]{23.5833, 119.6600, 23.60, 119.72});
        AREAS.put("白沙鄉", new double[]{23.6660, 119.5860, 23.72, 119.60});
        AREAS.put("西嶼鄉", new double[]{23.6020, 119.5078, 23.60, 119.45});
        AREAS.put("望安鄉", new double[]{23.3697, 119.5039, 23.37, 119.46});
        AREAS.put("七美鄉", new double[]{23.2017, 119.4290, 23.20, 119.39});
    }

    private WidgetData() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /* ---------- 時段配色：清晨 05–07、白天 07–17、傍晚 17–19、晚上 19–05 ---------- */
    static final int DAWN = 0, DAY = 1, DUSK = 2, NIGHT = 3;

    static int period() {
        int h = Calendar.getInstance(TPE).get(Calendar.HOUR_OF_DAY);
        return h >= 5 && h < 7 ? DAWN : h >= 7 && h < 17 ? DAY : h >= 17 && h < 19 ? DUSK : NIGHT;
    }

    static boolean dark(int p) { return p == DUSK || p == NIGHT; }

    private static int c(String hex) { return Color.parseColor(hex); }

    static int head(int p) { return c(new String[]{"#7C2D12", "#075985", "#FBCFE8", "#E0E7FF"}[p]); }
    static int text(int p) { return c(dark(p) ? "#F1F5F9" : "#111827"); }
    static int sub(int p) { return c(dark(p) ? "#CBD5E1" : "#374151"); }
    static int sep(int p) { return c(dark(p) ? "#99F6E4" : "#115E59"); }
    static int mer(int p) { return c(dark(p) ? "#FED7AA" : "#92400E"); }

    static int category(String cat, int p) {
        boolean d = dark(p);
        switch (cat) {
            case "繳費": return c(d ? "#FDE68A" : "#854D0E");
            case "機票搶票": return c(d ? "#FED7AA" : "#C2410C");
            case "醫療": return c(d ? "#FECACA" : "#B91C1C");
            case "生日紀念": return c(d ? "#FBCFE8" : "#BE185D");
            case "車輛保養": return c(d ? "#BFDBFE" : "#1D4ED8");
            case "證件": return c(d ? "#DDD6FE" : "#6D28D9");
            case "保險": return c(d ? "#A5F3FC" : "#0E7490");
            case "預約": return c(d ? "#BBF7D0" : "#15803D");
            case "稅務": return c(d ? "#D9F99D" : "#4D7C0F");
            case "節日": return c(d ? "#F5D0FE" : "#A21CAF");
            default: return c(d ? "#E5E7EB" : "#1F2937");
        }
    }

    static int risk(int level, int p) {
        boolean d = dark(p);
        if (level == 2) return c(d ? "#FCA5A5" : "#991B1B");
        if (level == 1) return c(d ? "#FDBA74" : "#9A3412");
        return c(d ? "#86EFAC" : "#166534");
    }

    /* ---------- 日期 ---------- */
    static long dayNumber(int y, int m, int d) {
        GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        g.clear();
        g.set(y, m - 1, d);
        return g.getTimeInMillis() / 86400000L;
    }

    static long today() {
        Calendar now = Calendar.getInstance(TPE);
        return dayNumber(now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
    }

    static String monthDay(long day) {
        GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        g.setTimeInMillis(day * 86400000L);
        return String.format(Locale.ROOT, "%02d/%02d", g.get(Calendar.MONTH) + 1, g.get(Calendar.DAY_OF_MONTH));
    }

    static String dateKey(long day) {
        GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        g.setTimeInMillis(day * 86400000L);
        return String.format(Locale.ROOT, "%04d/%02d/%02d", g.get(Calendar.YEAR), g.get(Calendar.MONTH) + 1, g.get(Calendar.DAY_OF_MONTH));
    }

    /* ---------- 重要資訊提醒（30 天內） ---------- */
    static final class Item {
        long day;
        int minutes;
        String cat, title, when;
    }

    static String icon(String cat) {
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

    /** 沒有資料時回傳 null */
    static List<Item> reminders(Context context) {
        String raw = prefs(context).getString("xb.reminders", null);
        if (raw == null) return null;
        List<Item> out = new ArrayList<>();
        long today = today();
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
                    GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
                    g.clear();
                    g.set(y, mo - 1 + step, d);
                    y = g.get(Calendar.YEAR);
                    mo = g.get(Calendar.MONTH) + 1;
                    d = g.get(Calendar.DAY_OF_MONTH);
                    day = dayNumber(y, mo, d);
                }
                long diff = day - today;
                if (diff < 0 || diff > DAYS) continue;
                String cat = r.optString("類別").trim();
                Matcher t = TIME.matcher(r.optString("時間"));
                boolean allDay = "生日紀念".equals(cat) || "節日".equals(cat);
                boolean hasTime = !allDay && t.find();
                Item it = new Item();
                it.day = day;
                it.cat = cat;
                it.minutes = hasTime ? Integer.parseInt(t.group(1)) * 60 + Integer.parseInt(t.group(2)) : -1;
                it.title = icon(cat) + " " + r.optString("標題").trim() + ("機票搶票".equals(cat) ? " 開搶" : "");
                it.when = monthDay(day) + (hasTime ? String.format(Locale.ROOT, " %02d:%02d", it.minutes / 60, it.minutes % 60) : "");
                out.add(it);
            }
        } catch (Exception ignored) {
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

    /* ---------- 今日分海（App 開著時存下未來 30 天） ---------- */
    /** 回傳 [分海時間, 合海時間, 安全通行時段]；沒有資料回傳 null */
    static List<List<String>> tide(Context context) {
        String raw = prefs(context).getString("xb.tide", null);
        if (raw == null) return null;
        try {
            JSONObject all = new JSONObject(raw);
            JSONObject day = all.optJSONObject(dateKey(today()));
            List<List<String>> out = new ArrayList<>();
            for (String k : new String[]{"sep", "mer", "safe"}) {
                List<String> v = new ArrayList<>();
                JSONArray a = day == null ? null : day.optJSONArray(k);
                if (a != null) for (int i = 0; i < a.length(); i++) v.add(a.optString(i));
                out.add(v);
            }
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    /* ---------- 風浪地區 ---------- */
    static boolean autoArea(Context context) {
        return prefs(context).getString("xb.widgetArea", "").isEmpty();
    }

    static String area(Context context) {
        SharedPreferences p = prefs(context);
        String chosen = p.getString("xb.widgetArea", "");
        if (AREAS.containsKey(chosen)) return chosen;
        String auto = p.getString("xb.autoArea", "");
        if (AREAS.containsKey(auto)) return auto;
        String app = p.getString("xb.appArea", "");
        return AREAS.containsKey(app) ? app : "馬公市";
    }

    /* ---------- 今日風浪（直接向公開氣象資料取得，每小時最多一次） ---------- */
    static final class Weather {
        String icon, sky, temp, wind, wave, riskText;
        int rain = -1, riskLevel;
    }

    private static final double[] LIM = {0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7};
    private static final String[] DIRS = {"北", "東北", "東", "東南", "南", "西南", "西", "西北"};

    static int bft(double ms) {
        for (int i = 0; i < LIM.length; i++) if (ms < LIM[i]) return i;
        return 12;
    }

    static Weather weather(Context context) {
        String raw = prefs(context).getString("xb.wxCache", null);
        if (raw == null) return null;
        try {
            JSONObject o = new JSONObject(raw);
            if (!area(context).equals(o.optString("area")) || !dateKey(today()).equals(o.optString("date"))) return null;
            return parse(o.getJSONObject("fc"), o.optJSONObject("ma"));
        } catch (Exception e) {
            return null;
        }
    }

    static boolean needFetch(Context context) {
        String raw = prefs(context).getString("xb.wxCache", null);
        if (raw == null) return true;
        try {
            JSONObject o = new JSONObject(raw);
            return !area(context).equals(o.optString("area")) || !dateKey(today()).equals(o.optString("date"))
                || System.currentTimeMillis() - o.optLong("at") > 3600000L;
        } catch (Exception e) {
            return true;
        }
    }

    private static String get(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(10000);
        con.setReadTimeout(10000);
        try {
            BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"));
            StringBuilder b = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) b.append(line);
            r.close();
            return b.toString();
        } finally {
            con.disconnect();
        }
    }

    /** 在背景執行緒呼叫 */
    static void fetchWeather(Context context) {
        String name = area(context);
        double[] a = AREAS.get(name);
        try {
            String fc = get(String.format(Locale.ROOT, "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&timezone=Asia%%2FTaipei&wind_speed_unit=ms&forecast_days=1"
                + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant", a[0], a[1]));
            String ma = null;
            try {
                ma = get(String.format(Locale.ROOT, "https://marine-api.open-meteo.com/v1/marine?latitude=%.2f&longitude=%.2f&timezone=Asia%%2FTaipei&forecast_days=1&daily=wave_height_max", a[2], a[3]));
            } catch (Exception ignored) {
            }
            JSONObject o = new JSONObject();
            o.put("area", name);
            o.put("date", dateKey(today()));
            o.put("at", System.currentTimeMillis());
            o.put("fc", new JSONObject(fc));
            if (ma != null) o.put("ma", new JSONObject(ma));
            prefs(context).edit().putString("xb.wxCache", o.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private static double first(JSONObject daily, String key) {
        JSONArray a = daily.optJSONArray(key);
        return a == null || a.isNull(0) ? Double.NaN : a.optDouble(0);
    }

    private static Weather parse(JSONObject fc, JSONObject ma) {
        JSONObject d = fc.optJSONObject("daily");
        if (d == null) return null;
        Weather w = new Weather();
        int code = (int) first(d, "weather_code");
        String[] sky = code == 0 ? new String[]{"☀️", "晴"} : code <= 2 ? new String[]{"🌤️", "晴時多雲"} : code == 3 ? new String[]{"☁️", "陰"}
            : code <= 48 ? new String[]{"🌫️", "有霧"} : code <= 57 ? new String[]{"🌦️", "毛毛雨"} : code <= 67 ? new String[]{"🌧️", "雨"}
            : code <= 77 ? new String[]{"🌨️", "雪"} : code <= 82 ? new String[]{"🌦️", "陣雨"} : new String[]{"⛈️", "雷雨"};
        w.icon = sky[0];
        w.sky = sky[1];
        w.temp = Math.round(first(d, "temperature_2m_min")) + "～" + Math.round(first(d, "temperature_2m_max")) + "°C";
        double rain = first(d, "precipitation_probability_max");
        w.rain = Double.isNaN(rain) ? -1 : (int) Math.round(rain);
        double ws = first(d, "wind_speed_10m_max"), gs = first(d, "wind_gusts_10m_max"), dir = first(d, "wind_direction_10m_dominant");
        String dn = DIRS[(int) Math.round((((dir % 360) + 360) % 360) / 45.0) % 8];
        int wb = bft(ws), gb = bft(gs);
        w.wind = dn + "風" + wb + "級・陣風" + gb + "級";
        JSONObject md = ma == null ? null : ma.optJSONObject("daily");
        double wave = md == null ? Double.NaN : first(md, "wave_height_max");
        if (Double.isNaN(wave)) {
            w.wave = "浪高 —";
        } else {
            String t = wave < 0.5 ? "平穩" : wave < 1.25 ? "小浪" : wave < 2.5 ? "中浪" : wave < 4 ? "大浪" : "巨浪";
            w.wave = String.format(Locale.ROOT, "浪高 %.1f m（%s）", wave, t);
        }
        double wv = Double.isNaN(wave) ? 0 : wave;
        if (wb >= 6 || gb >= 8 || wv >= 2.5) { w.riskLevel = 2; w.riskText = "⛔ 風浪大・不宜出海"; }
        else if (wb >= 5 || gb >= 7 || wv >= 1.25) { w.riskLevel = 1; w.riskText = "⚠️ 注意風浪"; }
        else { w.riskLevel = 0; w.riskText = "✅ 適合出海"; }
        return w;
    }
}
