// Default Settings
const DEFAULT_SETTINGS = {
  enabled: true,
  hideFeed: true,
  hideSidebar: true,
  hideWhoToFollow: true,
  hideMetrics: true,
  dailyLimit: 15,       // in minutes
  scrollLimit: 3,       // in full page scrolls
  pauseDuration: 10,    // in seconds
  timeSpentToday: 0,    // in seconds
  scrollCountToday: 0,  // raw pixels or pages scrolled
  lastResetDate: "",
  totalBlockedActions: 0
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (result) => {
    const newSettings = {};
    for (const key in DEFAULT_SETTINGS) {
      if (result[key] === undefined) {
        newSettings[key] = DEFAULT_SETTINGS[key];
      }
    }
    
    // Set the reset date to today
    const today = new Date().toDateString();
    if (!result.lastResetDate) {
      newSettings.lastResetDate = today;
    }
    
    chrome.storage.local.set(newSettings, () => {
      console.log("DetoX initialized with default settings:", newSettings);
    });
  });
});

// Helper to check and reset daily statistics
function checkDailyReset(callback) {
  chrome.storage.local.get(["lastResetDate", "timeSpentToday", "scrollCountToday"], (data) => {
    const today = new Date().toDateString();
    if (data.lastResetDate !== today) {
      chrome.storage.local.set({
        timeSpentToday: 0,
        scrollCountToday: 0,
        lastResetDate: today
      }, () => {
        console.log("Daily DetoX statistics reset for the day:", today);
        if (callback) callback(true);
      });
    } else {
      if (callback) callback(false);
    }
  });
}

// Keep track of active tabs to double-check active state
let activeXTabs = new Set();

// Handle messages from content scripts and popups
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Always verify daily reset first
  checkDailyReset(() => {
    if (message.type === "HEARTBEAT") {
      // Content script sends heartbeat when user is actively interacting with X.com
      chrome.storage.local.get(["timeSpentToday", "dailyLimit", "enabled"], (data) => {
        if (!data.enabled) return;
        
        const secondsSpent = (data.timeSpentToday || 0) + 5; // Heartbeats occur every 5 seconds
        const limitInSeconds = (data.dailyLimit || 15) * 60;
        
        chrome.storage.local.set({ timeSpentToday: secondsSpent }, () => {
          if (secondsSpent >= limitInSeconds) {
            // Notify all X tabs that time is up!
            notifyTimeUp();
          }
        });
      });
      sendResponse({ status: "ok" });
    }
    
    if (message.type === "SCROLL_UPDATE") {
      chrome.storage.local.get(["scrollCountToday", "scrollLimit", "enabled"], (data) => {
        if (!data.enabled) return;
        // scrollCountToday keeps track of pages scrolled
        const newScrollVal = (data.scrollCountToday || 0) + message.amount;
        chrome.storage.local.set({ scrollCountToday: newScrollVal });
      });
      sendResponse({ status: "ok" });
    }
    
    if (message.type === "INCREMENT_BLOCK_COUNT") {
      chrome.storage.local.get(["totalBlockedActions"], (data) => {
        chrome.storage.local.set({ totalBlockedActions: (data.totalBlockedActions || 0) + 1 });
      });
      sendResponse({ status: "ok" });
    }
    
    if (message.type === "GET_STATS") {
      chrome.storage.local.get(null, (data) => {
        sendResponse(data);
      });
      return true; // Keep message channel open for async response
    }
  });
  
  return true; // Keep channel open for async responders
});

// Send message to all tabs matching X.com to block them
function notifyTimeUp() {
  chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: "LIMIT_REACHED" }).catch(err => {
        // Ignore error for unloaded tabs
      });
    });
  });
}
