'use strict';
// 依前景程式判斷使用者正在寫程式、編寫文件或繪製圖資

const CODE_EXE = ['code.exe', 'code - insiders.exe', 'cursor.exe', 'windsurf.exe', 'devenv.exe', 'idea64.exe',
  'pycharm64.exe', 'webstorm64.exe', 'phpstorm64.exe', 'clion64.exe', 'rider64.exe', 'goland64.exe',
  'studio64.exe', 'eclipse.exe', 'sublime_text.exe', 'notepad++.exe', 'atom.exe', 'zed.exe',
  'windowsterminal.exe', 'powershell.exe', 'pwsh.exe', 'cmd.exe', 'wt.exe', 'arduino ide.exe', 'arduino.exe',
  'claude.exe'];
const DOC_EXE = ['winword.exe', 'excel.exe', 'powerpnt.exe', 'onenote.exe', 'wps.exe', 'et.exe', 'wpp.exe',
  'soffice.bin', 'swriter.exe', 'notepad.exe', 'obsidian.exe', 'notion.exe', 'typora.exe', 'evernote.exe',
  'acrobat.exe', 'foxitpdfeditor.exe', 'wordpad.exe', 'hwp.exe'];
const MAP_EXE = ['qgis-bin.exe', 'qgis.exe', 'qgis-ltr-bin.exe', 'arcgispro.exe', 'arcmap.exe', 'googleearth.exe',
  'photoshop.exe', 'illustrator.exe', 'mspaint.exe', 'paint.exe', 'krita.exe', 'clipstudiopaint.exe',
  'coreldrw.exe', 'inkscape.exe', 'gimp-2.10.exe', 'gimp.exe', 'acad.exe', 'sketchup.exe', 'figma.exe',
  'affinity designer.exe', 'designer.exe', 'blender.exe', 'medibangpaintpro.exe'];

const BROWSERS = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe', 'whale.exe'];
const TITLE_CODE = [/github/i, /gitlab/i, /apps script/i, /codepen/i, /replit/i, /stackblitz/i, /colab/i, /claude code/i];
const TITLE_DOC = [/google 文件/, /google 試算表/, /google 簡報/, /google docs/i, /google sheets/i, /google slides/i,
  /notion/i, /hackmd/i, /office\.com/i, /word online/i];
const TITLE_MAP = [/我的地圖/, /my maps/i, /google 地球/, /google earth/i, /canva/i, /figma/i, /geojson/i,
  /arcgis/i, /felt/i, /mapbox/i, /openstreetmap/i, /photopea/i];

function classify(fg) {
  if (!fg || fg.own || !fg.exe) return null;
  const exe = fg.exe;
  if (CODE_EXE.includes(exe)) return 'code';
  if (DOC_EXE.includes(exe)) return 'document';
  if (MAP_EXE.includes(exe) || exe.startsWith('qgis')) return 'map';
  if (BROWSERS.includes(exe)) {
    const t = fg.title || '';
    if (TITLE_MAP.some(r => r.test(t))) return 'map';
    if (TITLE_DOC.some(r => r.test(t))) return 'document';
    if (TITLE_CODE.some(r => r.test(t))) return 'code';
  }
  return null;
}

module.exports = { classify };
