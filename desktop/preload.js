// 熊寶系統 Windows 版：讓網頁把提醒資料交給程式，程式按通知時切到月曆
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bearDesktop', {
  setReminders: (data) => ipcRenderer.send('xb-reminders', data),
  onOpen: (cb) => ipcRenderer.on('xb-open', (e, view) => cb(view)),
  uiaHttp: (r) => ipcRenderer.invoke('uia-http', r)   // 立榮座位：由這台電腦直接連立榮官網
});
