// 熊寶系統 Windows 版：讓網頁把提醒資料交給程式，程式按通知時切到月曆
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bearDesktop', {
  setReminders: (data) => ipcRenderer.send('xb-reminders', data),
  onOpen: (cb) => ipcRenderer.on('xb-open', (e, view) => cb(view))
});
