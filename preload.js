const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Photos
    getPhotos: (path) => ipcRenderer.invoke('get-photos', path),
    savePhoto: (data) => ipcRenderer.invoke('save-photo', data),
    updatePhoto: (data) => ipcRenderer.invoke('update-photo', data),
    deletePhoto: (path) => ipcRenderer.invoke('delete-photo', path),
    
    // Searches
    getSearches: (path) => ipcRenderer.invoke('get-searches', path),
    saveSearch: (data) => ipcRenderer.invoke('save-search', data),
    updateSearch: (data) => ipcRenderer.invoke('update-search', data),
    deleteSearch: (id) => ipcRenderer.invoke('delete-search', id)
});
