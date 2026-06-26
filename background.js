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
  totalBlockedActions: 0,
  tabLockEnabled: false,
  focusDuration: 1,
  lockedTabId: null,
  lockedUntil: null
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
  if (message.type === "SET_LOCK_ALARM") {
    chrome.alarms.create("tabLockAlarm", { when: message.lockedUntil });
    sendResponse({ status: "alarm_set" });
    return true;
  }

  if (message.type === "SCROLL_TO_BOTTOM_UNLOCKED") {
    chrome.alarms.clear("tabLockAlarm");
    chrome.storage.local.set({ lockedTabId: null, lockedUntil: null }, () => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: "TAB_LOCK_RELEASED", reason: "scroll" }).catch(err => {});
        });
      });
    });
    sendResponse({ status: "unlocked_scroll" });
    return true;
  }

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

// Tab Lock Enforcement and Handlers

// Alarm listener to release lock when timer expires
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tabLockAlarm") {
    chrome.storage.local.set({ lockedTabId: null, lockedUntil: null }, () => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: "TAB_LOCK_RELEASED", reason: "timer" }).catch(err => {});
        });
      });
    });
  }
});

// Helper to force focus back to the locked tab, retrying if the tab strip is currently busy (e.g. during a click or drag event)
function forceActiveTab(tabId) {
  chrome.tabs.update(tabId, { active: true }, () => {
    if (chrome.runtime.lastError) {
      // Re-try in 50ms if the tab strip is locked/busy
      setTimeout(() => forceActiveTab(tabId), 50);
    }
  });
}

// Force active tab back to locked tab if trying to switch away
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.storage.local.get(["tabLockEnabled", "lockedTabId", "lockedUntil"], (data) => {
    if (!data.tabLockEnabled) return;
    const now = Date.now();
    if (data.lockedTabId && data.lockedUntil && now < data.lockedUntil) {
      if (activeInfo.tabId !== data.lockedTabId) {
        forceActiveTab(data.lockedTabId);
      }
    }
  });
});

// Clear lock state if the locked tab is closed by the user
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.storage.local.get(["lockedTabId"], (data) => {
    if (data.lockedTabId === tabId) {
      chrome.alarms.clear("tabLockAlarm");
      chrome.storage.local.set({ lockedTabId: null, lockedUntil: null });
    }
  });
});

// Re-inject HUD if the locked tab is reloaded or navigated while active
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    chrome.storage.local.get(["tabLockEnabled", "lockedTabId", "lockedUntil"], (data) => {
      if (data.tabLockEnabled && data.lockedTabId === tabId && data.lockedUntil && Date.now() < data.lockedUntil) {
        chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ["focus_hud.css"]
        }).catch(err => {});
        
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["focus_hud.js"]
        }).catch(err => {});
      }
    });
  }
});

