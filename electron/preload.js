const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('madran', {
  leader: {
    get: () => ipcRenderer.invoke('leader:get'),
    save: (data) => ipcRenderer.invoke('leader:save', data),
    clear: () => ipcRenderer.invoke('leader:clear'),
  },
  cloud: {
    signIn: (email, password) => ipcRenderer.invoke('cloud:signIn', { email, password }),
    signUp: (email, password, name) => ipcRenderer.invoke('cloud:signUp', { email, password, name }),
    resetPassword: (email) => ipcRenderer.invoke('cloud:resetPassword', { email }),
    isConfigured: () => ipcRenderer.invoke('cloud:isConfigured'),
  },
  roster: {
    list: () => ipcRenderer.invoke('roster:list'),
    add: (member) => ipcRenderer.invoke('roster:add', member),
    remove: (id) => ipcRenderer.invoke('roster:remove', id),
  },
  mission: {
    list: () => ipcRenderer.invoke('mission:list'),
    create: (payload) => ipcRenderer.invoke('mission:create', payload),
    get: (id) => ipcRenderer.invoke('mission:get', id),
    start: (id) => ipcRenderer.invoke('mission:start', id),
    end: (id) => ipcRenderer.invoke('mission:end', id),
    latestVitals: (id) => ipcRenderer.invoke('mission:latestVitals', id),
    alerts: (id) => ipcRenderer.invoke('mission:alerts', id),
    deviceRequests: (id) => ipcRenderer.invoke('mission:deviceRequests', id),
    syncNow: (id) => ipcRenderer.invoke('mission:syncNow', id),
  },
  alertActions: {
    acknowledge: (id) => ipcRenderer.invoke('alert:acknowledge', id),
  },
  requestActions: {
    acknowledge: (id) => ipcRenderer.invoke('request:acknowledge', id),
  },
  on: (channel, callback) => {
    const allowed = [
      'mesh:vitals', 'mesh:deviceRequest', 'mesh:alert',
      'mesh:deviceStatus', 'mesh:locationNode', 'sync:completed',
    ];
    if (!allowed.includes(channel)) return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
