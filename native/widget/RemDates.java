package io.github.bearbabybaby_ai.bearbao;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 重要資訊提醒：日期欄位展開成每一天（YYYY/MM/DD）
 * 單日｜民國年（2～3 位數加 1911）｜多個單日（「、」「+」「，」空格分開）｜期間（「-」「至」「到」）｜期間後加「週一、週四」只取那幾個星期
 * 日期後面的 (一) 只是註記；單日後面寫星期不算條件；期間前後顛倒自動對調
 * 花火節（類別含花火／煙火，或標題含施放／花火／煙火）：加的單日落在「期間＋星期」裡 → 改期（拿掉期間裡最近的一場）
 */
final class RemDates {
    private static final Pattern TOKEN = Pattern.compile("(\\d{2,4})\\s*[/\\-.年]\\s*(\\d{1,2})\\s*[/\\-.月]\\s*(\\d{1,2})\\s*日?");
    private static final Pattern NOTE = Pattern.compile("^\\s*[（(][^）)]{0,8}[）)]");
    private static final Pattern GAP = Pattern.compile("^\\s*[-－–—~～至到]\\s*$");
    private static final Pattern WEEK = Pattern.compile("(?:週|周|星期|禮拜)\\s*([日天一二三四五六])");
    private static final Pattern FIRE_CAT = Pattern.compile("花火|煙火");
    private static final Pattern FIRE_NAME = Pattern.compile("施放|花火|煙火");
    private static final long DAY = 86400000L;

    private RemDates() {}

    private static final class Seg {
        boolean range, dup;
        long d, a, b;
        boolean hasWd;
        List<Long> days = new ArrayList<>();
    }

    static boolean fire(String cat, String title) {
        return FIRE_CAT.matcher(cat == null ? "" : cat).find() || FIRE_NAME.matcher(title == null ? "" : title).find();
    }

    private static long utc(int y, int m, int d) {
        GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        g.clear();
        g.set(y, m - 1, d);
        return g.getTimeInMillis();
    }

    private static String key(long t) {
        GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        g.setTimeInMillis(t);
        return String.format(Locale.ROOT, "%04d/%02d/%02d", g.get(Calendar.YEAR), g.get(Calendar.MONTH) + 1, g.get(Calendar.DAY_OF_MONTH));
    }

    private static int weekday(long t) {
        GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        g.setTimeInMillis(t);
        return g.get(Calendar.DAY_OF_WEEK) - 1;   // 日=0
    }

    static List<String> expand(String text) { return expand(text, false); }

    static List<String> expand(String text, boolean fire) {
        String s = text == null ? "" : text;
        List<long[]> toks = new ArrayList<>();   // {時間, 開始, 結束}
        Matcher m = TOKEN.matcher(s);
        int from = 0;
        while (from <= s.length() && m.find(from)) {
            int y = Integer.parseInt(m.group(1));
            if (y < 1000) y += 1911;
            int mo = Integer.parseInt(m.group(2)), d = Integer.parseInt(m.group(3));
            int end = m.end();
            Matcher n = NOTE.matcher(s.substring(end));
            if (n.find()) end += n.end();
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) toks.add(new long[]{utc(y, mo, d), m.start(), end});
            from = Math.max(end, m.start() + 1);
        }
        List<Seg> segs = new ArrayList<>();
        for (int i = 0; i < toks.size(); i++) {
            long[] a = toks.get(i);
            long[] b = i + 1 < toks.size() ? toks.get(i + 1) : null;
            Seg g = new Seg();
            if (b != null && GAP.matcher(s.substring((int) a[2], (int) b[1])).matches()) {
                int tailEnd = i + 2 < toks.size() ? (int) toks.get(i + 2)[1] : s.length();
                boolean[] wd = new boolean[7];
                Matcher w = WEEK.matcher(s.substring((int) b[2], tailEnd));
                while (w.find()) { wd["日一二三四五六".indexOf(w.group(1).equals("天") ? "日" : w.group(1))] = true; g.hasWd = true; }
                g.range = true;
                g.a = Math.min(a[0], b[0]);
                g.b = Math.max(a[0], b[0]);
                int c = 0;
                for (long t = g.a; t <= g.b && c < 1500; t += DAY, c++) if (!g.hasWd || wd[weekday(t)]) g.days.add(t);
                i++;
            } else g.d = a[0];
            segs.add(g);
        }
        if (fire) {
            for (Seg g : segs) {
                if (g.range) continue;
                Seg r = null;
                for (Seg x : segs) if (x.range && x.hasWd && x.a <= g.d && g.d <= x.b) { r = x; break; }
                if (r == null || r.days.isEmpty()) continue;
                if (r.days.contains(g.d)) { g.dup = true; continue; }
                int best = 0;
                for (int k = 0; k < r.days.size(); k++) if (Math.abs(r.days.get(k) - g.d) < Math.abs(r.days.get(best) - g.d)) best = k;
                r.days.remove(best);
            }
        }
        TreeSet<String> out = new TreeSet<>();
        for (Seg g : segs) {
            if (g.range) for (long t : g.days) out.add(key(t));
            else out.add(key(g.d));
        }
        return new ArrayList<>(out);
    }
}
