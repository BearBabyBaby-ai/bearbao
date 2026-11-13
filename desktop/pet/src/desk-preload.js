'use strict';
// 熊寶工作模式的小對話框：輸入的文字交給熊寶系統，回覆顯示出來
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  ask: text => ipcRenderer.invoke('desk-ask', text),
  onFocus: fn => ipcRenderer.on('desk-focus', () => fn())
});
