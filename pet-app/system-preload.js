// 熊寶桌寵（獨立版）：背景開的熊寶系統網頁版靠這個載入工作模式的查詢功能
// 只提供查詢，不接收提醒、不切換頁面
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('bearDesktop', {
  setReminders: () => {},
  onOpen: () => {}
});
