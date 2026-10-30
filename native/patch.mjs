// 原生專案調整：版本號、權限、返回鍵、狀態列顏色、圖示、啟動畫面
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const A = 'android/app';
const RES = `${A}/src/main/res`;
const ICON = '../icons/icon-512.png';
const MASK = '../icons/icon-maskable-512.png';
const VERSION_CODE = 25;
const VERSION_NAME = '2.5.0';
const BAR = '#0a6fb3';
const BG = '#fef8e4';

const edit = (file, fn) => { const s = fs.readFileSync(file, 'utf8'); const t = fn(s); if (t === s) throw new Error(`未修改：${file}`); fs.writeFileSync(file, t); };

// 1. 版本號（必須大於手機上原本安裝的版本，才能直接覆蓋）
// 背景執行套件需要的程式庫路徑
const must = (s, a, b) => { if (!s.includes(a)) throw new Error(`找不到：${a}`); return s.replace(a, b); };
edit(`${A}/build.gradle`, s => must(
  s.replace(/versionCode \d+/, `versionCode ${VERSION_CODE}`).replace(/versionName "[^"]*"/, `versionName "${VERSION_NAME}"`),
  "flatDir{", "flatDir{\n        dirs '../../node_modules/@capacitor/background-runner/android/src/main/libs'"));

// 2. 權限：相機（掃發票）、定位（地圖排序）、通知與準時提醒（背景執行）；不要背景定位
edit(`${A}/src/main/AndroidManifest.xml`, s => {
  s = must(s, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"', '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"');
  s = must(s, '<uses-permission android:name="android.permission.INTERNET" />', [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.CAMERA" />',
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
    '    <uses-permission android:name="android.permission.SET_WALLPAPER" />',
    '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
    '    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" tools:node="remove" />',
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
    '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />'
  ].join('\n'));
  // 點通知時打開 App
  s = s.replace(/(<category android:name="android\.intent\.category\.LAUNCHER" \/>\s*<\/intent-filter>)/, `$1
            <intent-filter>
                <action android:name=".NOTIFICATION_CLICKED" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>`);
  if (!s.includes('NOTIFICATION_CLICKED')) throw new Error('通知點擊設定失敗');
  return s;
});

// 3. 返回鍵：能回上一頁就回上一頁，沒有上一頁就離開 App（與原本相同）
const javaDir = `${A}/src/main/java/io/github/bearbabybaby_ai/bearbao`;
fs.mkdirSync(javaDir, { recursive: true });
fs.writeFileSync(`${javaDir}/MainActivity.java`, `package io.github.bearbabybaby_ai.bearbao;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BearLockPlugin.class);   // 鎖屏月曆
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null && bridge.getWebView() != null && bridge.getWebView().canGoBack()) {
                    bridge.getWebView().goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
        openView(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openView(intent);
    }

    /* 從桌面小工具點提醒、分海或風浪時，切換到對應分頁 */
    private void openView(Intent intent) {
        if (intent == null) return;
        String view = intent.getStringExtra("xbView");
        intent.removeExtra("xbView");
        if ("split".equals(view) || "wx".equals(view) || "calendar".equals(view)) goView(view, 0);
    }

    private void goView(final String view, final int tries) {
        if (bridge == null || bridge.getWebView() == null || tries > 80) return;
        String js = "(function(){if(window.__xbInit&&typeof showView==='function'){showView('" + view + "');return 'ok';}return 'wait';})()";
        bridge.getWebView().evaluateJavascript(js, result -> {
            if (result == null || !result.contains("ok")) bridge.getWebView().postDelayed(() -> goView(view, tries + 1), 400);
        });
    }

    @Override
    public void onPause() {
        super.onPause();
        ReminderWidget.refresh(this);   // 離開 App 時更新桌面小工具
        LockCalendar.refreshAsync(this);   // 以及鎖屏月曆
    }
}
`);

// 3-1. 桌面小工具「熊寶貼心提醒」
for (const f of ['WidgetData.java', 'ReminderWidget.java', 'ReminderListService.java', 'AreaPickerActivity.java', 'Lunar.java', 'LockCalendar.java', 'LockCalReceiver.java', 'BearLockPlugin.java']) fs.copyFileSync(`widget/${f}`, `${javaDir}/${f}`);
for (const [from, to] of [['reminder_widget.xml', 'layout'], ['widget_item.xml', 'layout'], ['reminder_widget_info.xml', 'xml'], ['widget_strings.xml', 'values']]) {
  fs.mkdirSync(`${RES}/${to}`, { recursive: true });
  fs.copyFileSync(`widget/${from}`, `${RES}/${to}/${from}`);
}
// 時段配色：整塊底色、分海區塊、風浪區塊
const shape = (fill, stroke, r) => `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n    <solid android:color="${fill}" />${stroke ? `\n    <stroke android:width="1dp" android:color="${stroke}" />` : ''}\n    <corners android:radius="${r}dp" />\n</shape>\n`;
const PAL = {
  dawn: ['#FFFFFBF5', '#59B45309', '#FFE6F4F1', '#FFFDF1E2'],
  day: ['#FFF2F8FD', '#590A6FB3', '#FFE1F3EF', '#FFFDF5E1'],
  dusk: ['#FF26132B', '#66F472B6', '#FF123039', '#FF3A1C2B'],
  night: ['#FF0B1430', '#73818CF8', '#FF0F2A40', '#FF221D45']
};
for (const [k, [bg, line, tide, wx]] of Object.entries(PAL)) {
  fs.writeFileSync(`${RES}/drawable/widget_bg_${k}.xml`, shape(bg, line, 22));
  fs.writeFileSync(`${RES}/drawable/widget_tide_${k}.xml`, shape(tide, '', 14));
  fs.writeFileSync(`${RES}/drawable/widget_wx_${k}.xml`, shape(wx, '', 14));
}
edit(`${A}/src/main/AndroidManifest.xml`, s => must(s, '    </application>', `        <receiver android:name=".ReminderWidget" android:exported="false" android:label="@string/widget_name">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/reminder_widget_info" />
        </receiver>
        <service android:name=".ReminderListService" android:exported="false" android:permission="android.permission.BIND_REMOTEVIEWS" />
        <receiver android:name=".LockCalReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>
        <activity android:name=".AreaPickerActivity" android:exported="false" android:excludeFromRecents="true" android:noHistory="true" android:taskAffinity="" android:theme="@android:style/Theme.Translucent.NoTitleBar" />
    </application>`));

// 4. 狀態列顏色（與原本安裝檔相同的藍色），內容不延伸到狀態列底下
const styles = (v35) => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">${BAR}</item>
        <item name="colorPrimaryDark">${BAR}</item>
        <item name="colorAccent">${BAR}</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:statusBarColor">${BAR}</item>${v35 ? '\n        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>' : ''}
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">${BG}</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
`;
fs.writeFileSync(`${RES}/values/styles.xml`, styles(false));
fs.mkdirSync(`${RES}/values-v35`, { recursive: true });
fs.writeFileSync(`${RES}/values-v35/styles.xml`, styles(true));

// 5. 圖示：沿用原本 App 的圖示
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  const dir = `${RES}/mipmap-${d}`;
  fs.mkdirSync(dir, { recursive: true });
  const legacy = Math.round(48 * k), fg = Math.round(108 * k);
  await sharp(ICON).resize(legacy, legacy).png().toFile(`${dir}/ic_launcher.png`);
  await sharp(ICON).resize(legacy, legacy).composite([{ input: Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`), blend: 'dest-in' }]).png().toFile(`${dir}/ic_launcher_round.png`);
  const inner = Math.round(fg * 0.83);   /* 讓圖示完整落在可見範圍內 */
  const mk = await sharp(MASK).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: fg, height: fg, channels: 4, background: BG } }).composite([{ input: mk, gravity: 'center' }]).png().toFile(`${dir}/ic_launcher_foreground.png`);
}
fs.rmSync(`${RES}/drawable-v24/ic_launcher_foreground.xml`, { force: true });
fs.writeFileSync(`${RES}/drawable/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="${BG}"/></shape>\n`);
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
fs.writeFileSync(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, adaptive);
fs.writeFileSync(`${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive);

// 6. 啟動畫面：淺色底＋App 圖示
for (const dir of fs.readdirSync(RES).filter(n => n.startsWith('drawable'))) {
  const f = path.join(RES, dir, 'splash.png');
  if (!fs.existsSync(f)) continue;
  const { width, height } = await sharp(f).metadata();
  const size = Math.round(Math.min(width, height) * 0.35);
  const icon = await sharp(ICON).resize(size, size).png().toBuffer();
  await sharp({ create: { width, height, channels: 3, background: BG } }).composite([{ input: icon, gravity: 'center' }]).png().toFile(f + '.tmp');
  fs.renameSync(f + '.tmp', f);
}
// 7. 通知小圖示（白色鈴鐺）
fs.writeFileSync(`${RES}/drawable/ic_stat_bear.xml`, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.89,2 2,2zM18,16v-5c0,-3.07 -1.64,-5.64 -4.5,-6.32V4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z"/>
</vector>
`);
console.log('原生專案調整完成');
