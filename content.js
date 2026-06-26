// State variables
let settings = {};
let currentPath = "";
let lastInteractionTime = Date.now();
let heartbeatInterval = null;
let pathCheckInterval = null;
let scrollListenerActive = false;
let pauseCompletedThisSession = false;
let tempUnlockActive = false;
let tempUnlockTimer = null;

// Quotes array to show on screens
const MINDFUL_QUOTES = [
  "The price of anything is the amount of life you exchange for it. — Henry David Thoreau",
  "Attention is the rarest and purest form of generosity. — Simone Weil",
  "Almost everything will work again if you unplug it for a few minutes, including you. — Anne Lamott",
  "Be here now. — Ram Dass",
  "Focus is a matter of deciding what things you're not going to do. — John Carmack",
  "Simplicity is the ultimate sophistication. — Leonardo da Vinci",
  "Your life is what your thoughts make it. — Marcus Aurelius"
];

// Initialize content script
function init() {
  chrome.storage.local.get(null, (data) => {
    settings = data;
    if (settings.enabled === false) {
      cleanupDetoxStyles();
      return;
    }
    
    applySettingsStyles();
    startHeartbeat();
    startPathChecking();
    setupInteractionListeners();
    setupScrollMonitoring();
  });
}

// Apply CSS classes to HTML element to control layout visibility
function applySettingsStyles() {
  const html = document.documentElement;
  
  if (settings.hideFeed) html.classList.add("detoxx-hide-feed");
  else html.classList.remove("detoxx-hide-feed");
  
  if (settings.hideSidebar) html.classList.add("detoxx-hide-sidebar");
  else html.classList.remove("detoxx-hide-sidebar");
  
  if (settings.hideWhoToFollow) html.classList.add("detoxx-hide-who");
  else html.classList.remove("detoxx-hide-who");
  
  if (settings.hideMetrics) html.classList.add("detoxx-hide-metrics");
  else html.classList.remove("detoxx-hide-metrics");
}

function cleanupDetoxStyles() {
  const html = document.documentElement;
  html.classList.remove("detoxx-hide-feed", "detoxx-hide-sidebar", "detoxx-hide-who", "detoxx-hide-metrics");
  removeOverlays();
}

// Monitor URL changes in SPA
function startPathChecking() {
  if (pathCheckInterval) clearInterval(pathCheckInterval);
  
  pathCheckInterval = setInterval(() => {
    const path = window.location.pathname;
    if (path !== currentPath) {
      currentPath = path;
      handlePathChange(path);
    }
  }, 300);
}

function handlePathChange(path) {
  const html = document.documentElement;
  const isHome = path === "/home" || path === "/";
  
  if (isHome) {
    html.setAttribute("data-page", "home");
    // Trigger Mindful Pause when opening home feed
    if (settings.enabled && !pauseCompletedThisSession && !tempUnlockActive) {
      triggerMindfulPause();
    }
  } else {
    html.setAttribute("data-page", "other");
    // If they navigate away from home, we can optionally hide mindful pause
    removePauseOverlayOnly();
  }
  
  // Re-verify limit states
  checkBlockStates();
}

// Setup user activity tracking for time spent tracking
function setupInteractionListeners() {
  const recordInteraction = () => {
    lastInteractionTime = Date.now();
  };
  
  window.addEventListener("mousemove", recordInteraction, { passive: true });
  window.addEventListener("keydown", recordInteraction, { passive: true });
  window.addEventListener("scroll", recordInteraction, { passive: true });
}

// Start sending attention heartbeats to background script
function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(() => {
    if (settings.enabled === false) return;
    
    const isTabActive = document.visibilityState === "visible";
    const userInteracting = (Date.now() - lastInteractionTime) < 30000; // active in last 30s
    
    if (isTabActive && userInteracting) {
      chrome.runtime.sendMessage({ type: "HEARTBEAT" }, (response) => {
        // Handle background response if needed
        checkBlockStates();
      });
    }
  }, 5000); // Check every 5 seconds
}

// Monitor scroll depth
let lastScrollTop = 0;
function setupScrollMonitoring() {
  if (scrollListenerActive) return;
  
  window.addEventListener("scroll", () => {
    if (!settings.enabled || tempUnlockActive) return;
    
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    
    if (scrollTop > lastScrollTop && scrollHeight > 0) {
      const deltaScroll = scrollTop - lastScrollTop;
      const scrolledPages = deltaScroll / window.innerHeight;
      
      // Only report substantial positive scrolling
      if (scrolledPages > 0.05) {
        chrome.runtime.sendMessage({ type: "SCROLL_UPDATE", amount: scrolledPages });
        lastScrollTop = scrollTop;
        checkBlockStates();
      }
    } else if (scrollTop < lastScrollTop) {
      // User scrolled up, just reset the mark without adding scroll count
      lastScrollTop = scrollTop;
    }
  }, { passive: true });
  
  scrollListenerActive = true;
}

// Check if limits are hit and render overlays
function checkBlockStates() {
  if (!settings.enabled) return;

  chrome.storage.local.get(["timeSpentToday", "dailyLimit", "scrollCountToday", "scrollLimit"], (data) => {
    const limitInSeconds = (data.dailyLimit || 15) * 60;
    const timeSpent = data.timeSpentToday || 0;
    const scrollCount = data.scrollCountToday || 0;
    const maxScroll = data.scrollLimit || 3;

    // 1. Time Limit Block (Highest Priority)
    if (timeSpent >= limitInSeconds && !tempUnlockActive) {
      triggerTimeLimitBlock(data.dailyLimit || 15);
      return;
    }

    // 2. Scroll Depth Block
    if (scrollCount >= maxScroll && !tempUnlockActive) {
      triggerScrollBlock(scrollCount, maxScroll);
      return;
    }
  });
}

// --- OVERLAY CREATION LOGIC ---

function getOrCreateOverlay(id, className) {
  let overlay = document.getElementById(id);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = `detoxx-overlay ${className}`;
    document.body.appendChild(overlay);
  }
  return overlay;
}

function removeOverlays() {
  const ids = ["detoxx-pause-overlay", "detoxx-scroll-overlay", "detoxx-time-overlay"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

function removePauseOverlayOnly() {
  const el = document.getElementById("detoxx-pause-overlay");
  if (el) el.remove();
}

// 1. MINDFUL PAUSE
function triggerMindfulPause() {
  if (document.getElementById("detoxx-pause-overlay")) return;
  
  const overlay = getOrCreateOverlay("detoxx-pause-overlay", "");
  const quote = MINDFUL_QUOTES[Math.floor(Math.random() * MINDFUL_QUOTES.length)];
  const duration = settings.pauseDuration || 10;
  
  overlay.innerHTML = `
    <div class="detoxx-box">
      <h2 class="detoxx-title">Mindful Pause</h2>
      <p class="detoxx-desc">Pause. Take a brief breath before you proceed.</p>
      
      <div class="detoxx-breath-container">
        <div class="detoxx-breath-circle"></div>
        <div class="detoxx-breath-label" id="breath-label">Breathe</div>
      </div>
      
      <div class="detoxx-instruction" id="pause-timer">Preparing...</div>
      
      <div class="detoxx-buttons">
        <button class="detoxx-btn detoxx-btn-primary detoxx-btn-disabled" id="pause-btn-skip">
          Wait (${duration}s)
        </button>
        <button class="detoxx-btn detoxx-btn-secondary" id="pause-btn-close">
          Close Twitter / X
        </button>
      </div>
      
      <div class="detoxx-quote">${quote}</div>
    </div>
  `;
  
  // Force browser layout calculation to trigger transition
  setTimeout(() => overlay.classList.add("active"), 50);

  // Synced instruction timers
  let secondsRemaining = duration;
  const skipBtn = overlay.querySelector("#pause-btn-skip");
  const timerDisplay = overlay.querySelector("#pause-timer");
  const labelDisplay = overlay.querySelector("#breath-label");
  
  // Set breathing text intervals matching CSS keyframes (10s cycle)
  // Inhale: 0s-4s (scale up), Hold: 4s-5s, Exhale: 5s-9s (scale down)
  const breathStateInterval = setInterval(() => {
    const elapsed = duration - secondsRemaining;
    const cyclePos = elapsed % 10;
    if (cyclePos < 4) {
      labelDisplay.textContent = "Breathe In";
      timerDisplay.textContent = "Breathe in slowly...";
      timerDisplay.style.color = "#10b981";
    } else if (cyclePos < 5) {
      labelDisplay.textContent = "Hold";
      timerDisplay.textContent = "Hold your breath...";
      timerDisplay.style.color = "#a78bfa";
    } else {
      labelDisplay.textContent = "Breathe Out";
      timerDisplay.textContent = "Breathe out gently...";
      timerDisplay.style.color = "#34d399";
    }
  }, 200);

  const timer = setInterval(() => {
    secondsRemaining--;
    if (secondsRemaining <= 0) {
      clearInterval(timer);
      clearInterval(breathStateInterval);
      
      skipBtn.classList.remove("detoxx-btn-disabled");
      skipBtn.textContent = "Enter X (Mindfully)";
      timerDisplay.textContent = "Breathe complete. You are in control.";
      timerDisplay.style.color = "#10b981";
      labelDisplay.textContent = "Relaxed";
    } else {
      skipBtn.textContent = `Wait (${secondsRemaining}s)`;
    }
  }, 1000);

  // Click handlers
  skipBtn.addEventListener("click", () => {
    if (secondsRemaining <= 0) {
      pauseCompletedThisSession = true;
      overlay.classList.remove("active");
      setTimeout(() => overlay.remove(), 500);
    }
  });

  overlay.querySelector("#pause-btn-close").addEventListener("click", () => {
    clearInterval(timer);
    clearInterval(breathStateInterval);
    // Send a message or redirect to close tab
    window.location.href = "about:newtab";
  });
}

// Math problem generator for overlays
function generateOverlayMathProblem() {
  const types = ['determinant', 'derivative', 'quadratic'];
  const type = types[Math.floor(Math.random() * types.length)];
  let question = '';
  let answer = 0;

  if (type === 'determinant') {
    // 2x2 Matrix Determinant
    const A = Math.floor(Math.random() * 8) + 2; // 2 - 9
    const B = Math.floor(Math.random() * 8) + 2; // 2 - 9
    const C = Math.floor(Math.random() * 5) + 1; // 1 - 5
    const D = Math.floor(Math.random() * 8) + 3; // 3 - 10
    question = `
      <div style="font-size: 14px; margin-bottom: 12px; color: #9ca3af;">Find the determinant:</div>
      <div style="display: inline-flex; align-items: center; font-family: monospace; font-size: 24px; border-left: 2px solid #fff; border-right: 2px solid #fff; padding: 0 16px; margin: 10px 0; color: #a78bfa;">
        <div style="text-align: center; margin-right: 24px; line-height: 1.4;">
          <div>${A}</div>
          <div>${C}</div>
        </div>
        <div style="text-align: center; line-height: 1.4;">
          <div>${B}</div>
          <div>${D}</div>
        </div>
      </div>
    `;
    answer = (A * D) - (B * C);
  } else if (type === 'derivative') {
    // f(x) = A x^2 + B x, find f'(C)
    const A = Math.floor(Math.random() * 4) + 2;  // 2 - 5
    const B = Math.floor(Math.random() * 10) + 2; // 2 - 11
    const C = Math.floor(Math.random() * 4) + 2;  // 2 - 5
    
    question = `
      <div style="font-size: 14px; margin-bottom: 12px; color: #9ca3af;">If f(x) = ${A}x² + ${B}x,</div>
      <div style="font-size: 24px; font-weight: 800; color: #a78bfa; margin-top: 5px;">find f'(${C})</div>
    `;
    answer = (2 * A * C) + B;
  } else {
    // Quadratic root: x^2 - Px - Q = 0 -> positive root R1
    const R1 = Math.floor(Math.random() * 7) + 4;   // 4 - 10 (positive root)
    const R2 = -(Math.floor(Math.random() * 4) + 1); // -1 to -4
    
    const P = R1 + R2;
    const Q = -(R1 * R2);
    
    const pSign = P >= 0 ? '-' : '+';
    const absP = Math.abs(P);
    
    question = `
      <div style="font-size: 14px; margin-bottom: 12px; color: #9ca3af;">Solve for x &gt; 0:</div>
      <div style="font-size: 22px; font-weight: 800; color: #a78bfa; letter-spacing: 0.5px; margin-top: 5px;">x² ${pSign} ${absP === 1 ? '' : absP}x - ${Q} = 0</div>
    `;
    answer = R1;
  }

  return { question, answer };
}

// Binds math verification and controls views inside the overlay box
function setupMathVerification(boxElement, onSuccess) {
  const mainContent = boxElement.querySelector(".detoxx-main-content");
  const mathContent = boxElement.querySelector(".detoxx-math-content");
  const problem = generateOverlayMathProblem();

  mathContent.innerHTML = `
    <h2 class="detoxx-title" style="background: linear-gradient(to right, #ffffff, #a78bfa); -webkit-background-clip: text;">
      Verify to Bypass
    </h2>
    <p class="detoxx-desc">Prove your focus! Solve this problem to add 2 minutes:</p>
    
    <div class="detox-math-question" style="font-size: 28px; font-weight: 800; color: #a78bfa; margin: 8px 0; text-align: center; font-family: inherit;">
      ${problem.question}
    </div>
    
    <input type="number" id="detox-math-answer" class="detox-math-input" placeholder="Enter answer" autocomplete="off" />
    <div id="detox-math-error" class="detox-math-error" style="display: none;">
      Incorrect, try again!
    </div>
    
    <div class="detoxx-buttons">
      <button class="detoxx-btn detoxx-btn-secondary" id="math-btn-cancel">
        Cancel
      </button>
      <button class="detoxx-btn detoxx-btn-primary" id="math-btn-verify">
        Verify
      </button>
    </div>
  `;

  mainContent.style.display = "none";
  mathContent.style.display = "flex";

  const inputEl = mathContent.querySelector("#detox-math-answer");
  const errorEl = mathContent.querySelector("#detox-math-error");
  const btnVerify = mathContent.querySelector("#math-btn-verify");
  const btnCancel = mathContent.querySelector("#math-btn-cancel");

  setTimeout(() => inputEl.focus(), 100);

  function checkAnswer() {
    const userAnswer = parseInt(inputEl.value.trim(), 10);
    if (userAnswer === problem.answer) {
      onSuccess();
    } else {
      errorEl.style.display = "block";
      boxElement.style.animation = "none";
      void boxElement.offsetWidth; // force reflow
      boxElement.style.animation = "shake 0.3s ease";
      inputEl.value = "";
      inputEl.focus();
    }
  }

  btnVerify.addEventListener("click", checkAnswer);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      checkAnswer();
    }
  });

  btnCancel.addEventListener("click", () => {
    mathContent.style.display = "none";
    mainContent.style.display = "flex";
  });
}

// 2. SCROLL DEPTH BLOCKER
function triggerScrollBlock(current, limit) {
  if (document.getElementById("detoxx-scroll-overlay")) return;
  
  const overlay = getOrCreateOverlay("detoxx-scroll-overlay", "");
  const quote = MINDFUL_QUOTES[Math.floor(Math.random() * MINDFUL_QUOTES.length)];
  
  chrome.runtime.sendMessage({ type: "INCREMENT_BLOCK_COUNT" });
  
  overlay.innerHTML = `
    <div class="detoxx-box">
      <div class="detoxx-main-content" style="display: flex; flex-direction: column; align-items: center; gap: 24px; width: 100%;">
        <h2 class="detoxx-title" style="background: linear-gradient(to right, #ffffff, #f87171); -webkit-background-clip: text;">
          Scroll Limit Reached
        </h2>
        <p class="detoxx-desc">
          You've scrolled <strong>${current.toFixed(1)} pages</strong> today (Limit: ${limit} pages). 
          You've consumed plenty of updates. Rest your attention.
        </p>
        
        <div class="detoxx-buttons">
          <button class="detoxx-btn detoxx-btn-primary" id="scroll-btn-close">
            Step Away (Close Tab)
          </button>
          <button class="detoxx-btn detoxx-btn-danger" id="scroll-btn-bypass">
            I need 2 more minutes (Bypass)
          </button>
        </div>
        
        <div class="detoxx-quote">${quote}</div>
      </div>
      <div class="detoxx-math-content" style="display: none; flex-direction: column; align-items: center; gap: 24px; width: 100%;"></div>
    </div>
  `;
  
  setTimeout(() => overlay.classList.add("active"), 50);

  const boxEl = overlay.querySelector(".detoxx-box");

  overlay.querySelector("#scroll-btn-close").addEventListener("click", () => {
    window.location.href = "about:newtab";
  });

  overlay.querySelector("#scroll-btn-bypass").addEventListener("click", () => {
    setupMathVerification(boxEl, () => {
      // Success: Grant 2 minutes bypass
      tempUnlockActive = true;
      overlay.classList.remove("active");
      setTimeout(() => overlay.remove(), 500);
      
      // Set timer to re-block after 2 minutes (120000ms)
      if (tempUnlockTimer) clearTimeout(tempUnlockTimer);
      tempUnlockTimer = setTimeout(() => {
        tempUnlockActive = false;
        checkBlockStates();
      }, 120000);
    });
  });
}

// 3. DAILY TIME LIMIT BLOCK (Permanent for the day)
function triggerTimeLimitBlock(limit) {
  if (tempUnlockActive) return;

  // Clear any temporary unlock timers
  if (tempUnlockTimer) {
    clearTimeout(tempUnlockTimer);
    tempUnlockActive = false;
  }

  // Remove other overlays
  const pause = document.getElementById("detoxx-pause-overlay");
  if (pause) pause.remove();
  const scroll = document.getElementById("detoxx-scroll-overlay");
  if (scroll) scroll.remove();

  if (document.getElementById("detoxx-time-overlay")) return;

  const overlay = getOrCreateOverlay("detoxx-time-overlay", "");
  const quote = MINDFUL_QUOTES[Math.floor(Math.random() * MINDFUL_QUOTES.length)];
  
  chrome.runtime.sendMessage({ type: "INCREMENT_BLOCK_COUNT" });

  overlay.innerHTML = `
    <div class="detoxx-box" style="border-color: rgba(239, 68, 68, 0.3); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(239, 68, 68, 0.1);">
      <div class="detoxx-main-content" style="display: flex; flex-direction: column; align-items: center; gap: 24px; width: 100%;">
        <h2 class="detoxx-title" style="background: linear-gradient(to right, #ff8a8a, #ef4444); -webkit-background-clip: text;">
          Daily Budget Exhausted
        </h2>
        <p class="detoxx-desc">
          Your daily limit of <strong>${limit} minutes</strong> is complete. 
          X is now locked until tomorrow to protect your focus.
        </p>
        
        <div class="detoxx-buttons">
          <button class="detoxx-btn detoxx-btn-primary" id="time-btn-close" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);">
            Close Tab & Start Focus
          </button>
          <button class="detoxx-btn detoxx-btn-secondary" id="time-btn-bypass">
            I need 2 more minutes (Bypass)
          </button>
        </div>
        
        <div class="detoxx-quote">${quote}</div>
      </div>
      <div class="detoxx-math-content" style="display: none; flex-direction: column; align-items: center; gap: 24px; width: 100%;"></div>
    </div>
  `;

  setTimeout(() => overlay.classList.add("active"), 50);

  const boxEl = overlay.querySelector(".detoxx-box");

  overlay.querySelector("#time-btn-close").addEventListener("click", () => {
    window.location.href = "about:newtab";
  });

  overlay.querySelector("#time-btn-bypass").addEventListener("click", () => {
    setupMathVerification(boxEl, () => {
      // Success: Grant 2 minutes bypass
      tempUnlockActive = true;
      overlay.classList.remove("active");
      setTimeout(() => overlay.remove(), 500);
      
      // Set timer to re-block after 2 minutes (120000ms)
      if (tempUnlockTimer) clearTimeout(tempUnlockTimer);
      tempUnlockTimer = setTimeout(() => {
        tempUnlockActive = false;
        checkBlockStates();
      }, 120000);
    });
  });
}

// Listen for settings and state messages from popups/backgrounds
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SETTINGS_UPDATED") {
    settings[message.key] = message.value;
    
    if (settings.enabled === false) {
      cleanupDetoxStyles();
    } else {
      applySettingsStyles();
      // Re-trigger verification
      checkBlockStates();
    }
    sendResponse({ status: "applied" });
  }
  
  if (message.type === "LIMIT_REACHED") {
    triggerTimeLimitBlock(settings.dailyLimit || 15);
    sendResponse({ status: "blocked" });
  }

  if (message.type === "RESET_STATS") {
    // Remove blocks since stats reset
    tempUnlockActive = false;
    removeOverlays();
    // Re-initialize path states
    const path = window.location.pathname;
    handlePathChange(path);
    sendResponse({ status: "reset" });
  }
});

// Run Initializer
init();
