// 原生專案調整：版本號、權限、返回鍵、狀態列顏色、圖示、啟動畫面
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const A = 'android/app';
const RES = `${A}/src/main/res`;
const ICON = '../icons/icon-512.png';
const MASK = '../icons/icon-maskable-512.png';
const VERSION_CODE = 20;
const VERSION_NAME = '2.0.0';
const BAR = '#0a6fb3';
const BG = '#fef8e4';

const edit = (file, fn) => { const s = fs.readFileSync(file, 'utf8'); const t = fn(s); if (t === s) throw new Error(`未修改：${file}`); fs.writeFileSync(file, t); };

// 1. 版本號（必須大於手機上原本安裝的版本，才能直接覆蓋）
edit(`${A}/build.gradle`, s => s.replace(/versionCode \d+/, `versionCode ${VERSION_CODE}`).replace(/versionName "[^"]*"/, `versionName "${VERSION_NAME}"`));

// 2. 權限：相機（掃發票）、定位（地圖排序）
edit(`${A}/src/main/AndroidManifest.xml`, s => s.replace('<uses-permission android:name="android.permission.INTERNET" />', [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '    <uses-permission android:name="android.permission.CAMERA" />',
  '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
  '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />'
].join('\n')));

// 3. 返回鍵：能回上一頁就回上一頁，沒有上一頁就離開 App（與原本相同）
const javaDir = `${A}/src/main/java/io/github/bearbabybaby_ai/bearbao`;
fs.mkdirSync(javaDir, { recursive: true });
fs.writeFileSync(`${javaDir}/MainActivity.java`, `package io.github.bearbabybaby_ai.bearbao;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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
    }
}
`);

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
console.log('原生專案調整完成');
