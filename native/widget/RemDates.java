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
 * 支援：2027/01/03、2027/01/05（多天）｜116/01/03（民國）｜2027/01/03-2027/01/09（區間）｜區間後加「週一、週四」只取那幾個星期
 */
final class RemDates {
    private static final Pattern TOKEN = Pattern.compile("(\\d{2,4})\\s*[/\\-.年]\\s*(\\d{1,2})\\s*[/\\-.月]\\s*(\\d{1,2})\\s*日?");
    private static final Pattern GAP = Pattern.compile("^\\s*[-~～－–—至到]\\s*$");
    private static final Pattern WEEK = Pattern.compile("(?:週|周|星期|禮拜)\\s*([日天一二三四五六])");
    private static final long DAY = 86400000L;

    private RemDates() {}

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

    static List<String> expand(String text) {
        String s = text == null ? "" : text;
        List<long[]> toks = new ArrayList<>();   // {時間, 開始, 結束}
        Matcher m = TOKEN.matcher(s);
        while (m.find()) {
            int y = Integer.parseInt(m.group(1));
            if (y < 1000) y += 1911;
            int mo = Integer.parseInt(m.group(2)), d = Integer.parseInt(m.group(3));
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) toks.add(new long[]{utc(y, mo, d), m.start(), m.end()});
        }
        TreeSet<String> out = new TreeSet<>();
        for (int i = 0; i < toks.size(); i++) {
            long[] a = toks.get(i);
            long[] b = i + 1 < toks.size() ? toks.get(i + 1) : null;
            if (b != null && GAP.matcher(s.substring((int) a[2], (int) b[1])).matches()) {
                int tailEnd = i + 2 < toks.size() ? (int) toks.get(i + 2)[1] : s.length();
                boolean[] wd = new boolean[7];
                boolean any = false;
                Matcher w = WEEK.matcher(s.substring((int) b[2], tailEnd));
                while (w.find()) { wd["日一二三四五六".indexOf(w.group(1).equals("天") ? "日" : w.group(1))] = true; any = true; }
                long from = Math.min(a[0], b[0]), to = Math.max(a[0], b[0]);
                int n = 0;
                for (long t = from; t <= to && n < 1000; t += DAY, n++) if (!any || wd[weekday(t)]) out.add(key(t));
                i++;
            } else out.add(key(a[0]));
        }
        return new ArrayList<>(out);
    }
}
