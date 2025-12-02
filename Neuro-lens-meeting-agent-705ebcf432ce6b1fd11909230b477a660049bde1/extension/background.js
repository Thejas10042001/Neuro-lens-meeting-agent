// Background Service Worker
// Currently minimal, handles installation events.

chrome.runtime.onInstalled.addListener(() => {
  console.log("NeuroLens Extension Installed");
  chrome.storage.local.set({ currentSession: [] });
});
