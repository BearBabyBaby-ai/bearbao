'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  on: (channel, fn) => {
    if (['clip', 'effect', 'sleeping', 'fade', 'hover', 'sway'].includes(channel)) ipcRenderer.on(channel, (_e, d) => fn(d));
  },
  mask: bits => ipcRenderer.send('mask', bits),
  press: on => ipcRenderer.send('press', !!on),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  click: () => ipcRenderer.send('click'),
  petted: () => ipcRenderer.send('pet')
});
