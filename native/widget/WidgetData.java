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

    /* ---------- 小工具與鎖屏用的資料：只放在執行中的記憶體，不寫進手機（每次直接向雲端讀） ---------- */
    static volatile String memTide, memReminders, memCal, memWx;
    static volatile long tideAt, remAt, calAt;
    private static volatile boolean purged;
    /** 清掉舊版存在手機裡的資料（只做一次） */
    static void purgeStored(Context c) {
        if (purged) return;
        purged = true;
        prefs(c).edit().remove("xb.tide").remove("xb.reminders").remove("xb.cal").remove("xb.wxCache")
            .remove("bg.tideAt").remove("bg.remAt").remove("bg.calAt").apply();
    }
    /** 記憶體裡還沒有資料（例如程式剛被系統重新啟動）時要先讀一次 */
    static boolean needSync() { return memTide == null || memCal == null; }

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
        String raw = memReminders;
        if (raw == null) return null;
        List<Item> out = new ArrayList<>();
        long today = today();
        try {
            JSONArray list = new JSONArray(raw);
            for (int i = 0; i < list.length(); i++) {
                JSONObject r = list.optJSONObject(i);
                if (r == null || "已完成".equals(r.optString("狀態").trim())) continue;
                List<String> ds = RemDates.expand(r.optString("提醒日期"), RemDates.fire(r.optString("類別"), r.optString("標題")));   // 多天／區間／民國年／每週幾
                if (ds.isEmpty()) continue;
                for (String dk : ds) {
                int y = Integer.parseInt(dk.substring(0, 4)), mo = Integer.parseInt(dk.substring(5, 7)), d = Integer.parseInt(dk.substring(8, 10));
                String rep = r.optString("重複").trim();
                int step = ds.size() > 1 ? 0 : "每月".equals(rep) ? 1 : "每年".equals(rep) ? 12 : 0;
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

    /* ---------- 今日分海（直接讀雲端，只放記憶體） ---------- */
    /** 回傳 [分海時間, 合海時間, 安全通行時段]；沒有資料回傳 null */
    static List<List<String>> tide(Context context) {
        String raw = memTide;
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

    /* ---------- 今日風浪（中央氣象署，不足部分用 Open-Meteo；每小時最多一次） ---------- */
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
        String raw = memWx;
        if (raw == null) return null;
        try {
            JSONObject o = new JSONObject(raw);
            if (!area(context).equals(o.optString("area")) || !dateKey(today()).equals(o.optString("date"))) return null;
            return parse(o);
        } catch (Exception e) {
            return null;
        }
    }

    static boolean needFetch(Context context) {
        String raw = memWx;
        if (raw == null) return true;
        try {
            JSONObject o = new JSONObject(raw);
            return !area(context).equals(o.optString("area")) || !dateKey(today()).equals(o.optString("date"))
                || !o.has("wk") || System.currentTimeMillis() - o.optLong("at") > 3600000L;
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

    /* 中央氣象署開放資料（與熊寶系統相同）；氣象署沒有的部分用 Open-Meteo 補，氣象署讀不到時整份改用 Open-Meteo */
    private static final String CWA_KEY = "CWA-23D5D307-392A-48CF-BD7B-DFE501ADCD7A";
    private static final String CWA_SEA = "https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-A0012-001?Authorization=" + CWA_KEY + "&downloadType=WEB&format=JSON";

    private static String enc(String v) throws Exception {
        return java.net.URLEncoder.encode(v, "UTF-8").replace("+", "%20");
    }

    private static String cwaWeek(String name) throws Exception {
        return "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-047?Authorization=" + CWA_KEY + "&format=JSON&LocationName=" + enc(name)
            + "&ElementName=" + enc("天氣現象,最高溫度,最低溫度,12小時降雨機率,風向,風速");
    }

    /** 在背景執行緒呼叫 */
    static void fetchWeather(Context context) {
        String name = area(context);
        double[] a = AREAS.get(name);
        JSONObject o = new JSONObject();
        try {
            o.put("area", name);
            o.put("date", dateKey(today()));
            o.put("at", System.currentTimeMillis());
            try {
                o.put("wk", new JSONObject(get(cwaWeek(name))));
            } catch (Exception ignored) {
            }
            try {
                // 海面預報只留「澎湖海面」
                JSONObject sea = new JSONObject(get(CWA_SEA));
                JSONObject locs = sea.getJSONObject("cwaopendata").getJSONObject("Dataset").getJSONObject("Locations");
                JSONArray arr = locs.optJSONArray("Location");
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject l = arr.getJSONObject(i);
                    if (l.optString("LocationName").contains("澎湖")) { o.put("sea", l); break; }
                }
            } catch (Exception ignored) {
            }
            try {
                o.put("fc", new JSONObject(get(String.format(Locale.ROOT, "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&timezone=Asia%%2FTaipei&wind_speed_unit=ms&forecast_days=1"
                    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant", a[0], a[1]))));
            } catch (Exception ignored) {
            }
            try {
                o.put("ma", new JSONObject(get(String.format(Locale.ROOT, "https://marine-api.open-meteo.com/v1/marine?latitude=%.2f&longitude=%.2f&timezone=Asia%%2FTaipei&forecast_days=1&daily=wave_height_max", a[2], a[3]))));
            } catch (Exception ignored) {
            }
            if (!o.has("wk") && !o.has("fc")) return;
            memWx = o.toString();
        } catch (Exception ignored) {
        }
    }

    private static double first(JSONObject daily, String key) {
        JSONArray a = daily == null ? null : daily.optJSONArray(key);
        return a == null || a.isNull(0) ? Double.NaN : a.optDouble(0);
    }

    private static final Pattern NUM = Pattern.compile("\\d+(\\.\\d+)?");

    private static double maxNum(String s) {
        Matcher m = NUM.matcher(s == null ? "" : s);
        double v = Double.NaN;
        while (m.find()) { double x = Double.parseDouble(m.group()); if (Double.isNaN(v) || x > v) v = x; }
        return v;
    }

    private static String emoji(String t) {
        if (t.contains("雷")) return "⛈️";
        if (t.contains("雪")) return "🌨️";
        if (t.contains("霧")) return "🌫️";
        if (t.contains("雨")) return t.contains("晴") || t.contains("短暫") || t.contains("局部") ? "🌦️" : "🌧️";
        if (t.equals("晴") || t.equals("晴天")) return "☀️";
        if (t.startsWith("晴")) return "🌤️";
        if (t.contains("晴")) return "⛅";
        if (t.contains("陰")) return "☁️";
        return t.contains("雲") ? "⛅" : "🌤️";
    }

    private static String omSky(int code) {
        return code == 0 ? "晴" : code <= 2 ? "晴時多雲" : code == 3 ? "陰" : code <= 48 ? "有霧" : code <= 57 ? "毛毛雨" : code <= 67 ? "雨" : code <= 77 ? "雪" : code <= 82 ? "陣雨" : "雷雨";
    }

    private static String val(JSONObject t, String k) {
        JSONArray v = t.optJSONArray("ElementValue");
        if (v != null && v.length() > 0) return v.optJSONObject(0).optString(k, "");
        JSONObject one = t.optJSONObject("ElementValue");
        return one == null ? "" : one.optString(k, "");
    }

    private static String bftTxt(String v) {
        double n = maxNum(v);
        if (Double.isNaN(n)) return "—";
        return (v.contains(">") || v.contains("≥")) ? (int) n + "級以上" : (int) n + "級";
    }

    private static Weather parse(JSONObject o) {
        String today = dateKey(today()).replace('/', '-');
        Weather w = new Weather();
        boolean cwa = false;
        // 氣象署一週預報：今天白天（只剩晚上就用晚上）的天氣現象、風向、風力；氣溫取今天各段最低～最高
        JSONObject wk = o.optJSONObject("wk");
        try {
            JSONArray locs = wk.getJSONObject("records").getJSONArray("Locations").getJSONObject(0).getJSONArray("Location");
            JSONArray els = locs.getJSONObject(0).getJSONArray("WeatherElement");
            Map<String, JSONArray> E = new LinkedHashMap<>();
            for (int i = 0; i < els.length(); i++) E.put(els.getJSONObject(i).getString("ElementName"), els.getJSONObject(i).getJSONArray("Time"));
            JSONArray sky = E.get("天氣現象");
            int main = -1;
            double hi = Double.NaN, lo = Double.NaN, pop = Double.NaN;
            for (int i = 0; i < sky.length(); i++) {
                String st = sky.getJSONObject(i).getString("StartTime");
                if (!st.startsWith(today)) continue;
                int hr = Integer.parseInt(st.substring(11, 13));
                if (main < 0) main = i;
                else if (hr < 18 && Integer.parseInt(sky.getJSONObject(main).getString("StartTime").substring(11, 13)) >= 18) main = i;
                double h = maxNum(val(E.get("最高溫度").getJSONObject(i), "MaxTemperature")), l = maxNum(val(E.get("最低溫度").getJSONObject(i), "MinTemperature"));
                double p = maxNum(val(E.get("12小時降雨機率").getJSONObject(i), "ProbabilityOfPrecipitation"));
                if (!Double.isNaN(h) && (Double.isNaN(hi) || h > hi)) hi = h;
                if (!Double.isNaN(l) && (Double.isNaN(lo) || l < lo)) lo = l;
                if (!Double.isNaN(p) && (Double.isNaN(pop) || p > pop)) pop = p;
            }
            if (main >= 0) {
                String t = val(sky.getJSONObject(main), "Weather");
                w.icon = emoji(t);
                w.sky = t;
                w.temp = (int) lo + "～" + (int) hi + "°C";
                w.rain = Double.isNaN(pop) ? -1 : (int) pop;
                w.wind = val(E.get("風向").getJSONObject(main), "WindDirection") + bftTxt(val(E.get("風速").getJSONObject(main), "BeaufortScale"));
                cwa = true;
            }
        } catch (Exception ignored) {
        }
        JSONObject fd = o.optJSONObject("fc") == null ? null : o.optJSONObject("fc").optJSONObject("daily");
        if (!cwa) {
            if (fd == null) return null;
            int code = (int) first(fd, "weather_code");
            w.sky = omSky(code);
            w.icon = emoji(w.sky);
            w.temp = Math.round(first(fd, "temperature_2m_min")) + "～" + Math.round(first(fd, "temperature_2m_max")) + "°C";
            double dir = first(fd, "wind_direction_10m_dominant");
            w.wind = DIRS[(int) Math.round((((dir % 360) + 360) % 360) / 45.0) % 8] + "風" + bft(first(fd, "wind_speed_10m_max")) + "級";
        }
        if (w.rain < 0 && fd != null) { double r = first(fd, "precipitation_probability_max"); if (!Double.isNaN(r)) w.rain = (int) Math.round(r); }
        // 浪高、陣風：氣象署澎湖海面今天；沒有就用 Open-Meteo
        String waveTxt = null, waveType = "";
        double wave = Double.NaN, gust = Double.NaN;
        JSONObject sea = o.optJSONObject("sea");
        if (sea != null) {
            JSONArray els = sea.optJSONArray("WeatherElement");
            for (int i = 0; els != null && i < els.length(); i++) {
                JSONObject e = els.optJSONObject(i);
                JSONArray ts = e.optJSONArray("Time");
                for (int j = 0; ts != null && j < ts.length(); j++) {
                    JSONObject t = ts.optJSONObject(j);
                    if (!t.optString("StartTime").startsWith(today)) continue;
                    String n = e.optString("ElementName");
                    if (n.equals("浪高描述")) { waveTxt = val(t, "WaveHeightDescription"); wave = maxNum(waveTxt); }
                    else if (n.equals("浪型描述")) waveType = val(t, "WaveTypeDescription");
                    else if (n.equals("蒲福風級描述")) { Matcher m = Pattern.compile("陣風(\\d+)級").matcher(val(t, "BeaufortScaleDescription")); while (m.find()) gust = Double.isNaN(gust) ? Double.parseDouble(m.group(1)) : Math.max(gust, Double.parseDouble(m.group(1))); }
                }
            }
        }
        if (Double.isNaN(gust) && fd != null) { double g = first(fd, "wind_gusts_10m_max"); if (!Double.isNaN(g)) gust = bft(g); }
        if (!Double.isNaN(gust)) w.wind += "・陣風" + (int) gust + "級";
        if (waveTxt == null) {
            JSONObject md = o.optJSONObject("ma") == null ? null : o.optJSONObject("ma").optJSONObject("daily");
            wave = first(md, "wave_height_max");
            if (!Double.isNaN(wave)) {
                waveTxt = String.format(Locale.ROOT, "%.1f公尺", wave);
                waveType = wave < 0.5 ? "平穩" : wave < 1.25 ? "小浪" : wave < 2.5 ? "中浪" : wave < 4 ? "大浪" : "巨浪";
            }
        }
        w.wave = waveTxt == null ? "浪高 尚無資訊" : "浪高 " + waveTxt + (waveType.isEmpty() ? "" : "（" + waveType + "）");
        // 出海建議依浪高判斷
        if (Double.isNaN(wave)) { w.riskLevel = 1; w.riskText = "出海建議：尚無資訊"; }
        else if (wave >= 2.5) { w.riskLevel = 2; w.riskText = "⛔ 風浪大・不宜出海"; }
        else if (wave >= 1.25) { w.riskLevel = 1; w.riskText = "⚠️ 注意風浪"; }
        else { w.riskLevel = 0; w.riskText = "✅ 適合出海"; }
        return w;
    }
}
