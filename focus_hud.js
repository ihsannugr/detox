(function () {
  // Prevent duplicate execution on the same tab
  if (window.__detoxFocusHudActive) return;
  window.__detoxFocusHudActive = true;

  let hudContainer = null;
  let countdownTimer = null;

  // Initialize
  function init() {
    chrome.storage.local.get(["lockedUntil", "tabLockEnabled"], (data) => {
      if (!data.tabLockEnabled || !data.lockedUntil) {
        cleanup();
        return;
      }
      
      const timeLeft = data.lockedUntil - Date.now();
      if (timeLeft <= 0) {
        cleanup();
        return;
      }

      createHUD();
      startTimer(data.lockedUntil);
      setupScrollListener();
      setupMessageListener();
    });
  }

  // Create HUD HTML elements
  function createHUD() {
    // Remove existing if any
    const existing = document.getElementById("detoxx-focus-hud");
    if (existing) existing.remove();

    hudContainer = document.createElement("div");
    hudContainer.id = "detoxx-focus-hud";
    hudContainer.innerHTML = `
      <div class="detoxx-hud-content">
        <span class="detoxx-hud-icon">🔒</span>
        <span class="detoxx-hud-label">Focus Mode</span>
        <span class="detoxx-hud-timer" id="detoxx-hud-time">--:--</span>
      </div>
      <div class="detoxx-hud-progress-bar">
        <div class="detoxx-hud-progress-fill" id="detoxx-hud-progress-fill"></div>
      </div>
    `;

    document.body.appendChild(hudContainer);
    // Trigger transition
    setTimeout(() => hudContainer.classList.add("active"), 50);
  }

  // Start ticking the countdown
  function startTimer(lockedUntil) {
    if (countdownTimer) clearInterval(countdownTimer);

    const initialTotal = lockedUntil - Date.now();

    const updateTimer = () => {
      const now = Date.now();
      const timeLeft = lockedUntil - now;

      if (timeLeft <= 0) {
        clearInterval(countdownTimer);
        cleanup();
        return;
      }

      const sec = Math.max(0, Math.round(timeLeft / 1000));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      
      const timerText = `${m}:${s.toString().padStart(2, "0")}`;
      const timerEl = document.getElementById("detoxx-hud-time");
      if (timerEl) timerEl.textContent = timerText;

      // Update progress bar
      const progressFill = document.getElementById("detoxx-hud-progress-fill");
      if (progressFill) {
        const percentage = Math.min(100, Math.max(0, (timeLeft / initialTotal) * 100));
        progressFill.style.width = `${percentage}%`;
      }
    };

    updateTimer();
    countdownTimer = setInterval(updateTimer, 1000);
  }

  // Setup scroll tracking
  function setupScrollListener() {
    const checkScrollBottom = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      const scrollPos = window.innerHeight + window.scrollY;

      // Only trigger if scroll is possible
      if (scrollHeight > clientHeight + 50) {
        const isAtBottom = scrollPos >= scrollHeight - 20;
        if (isAtBottom) {
          window.removeEventListener("scroll", checkScrollBottom);
          chrome.runtime.sendMessage({ type: "SCROLL_TO_BOTTOM_UNLOCKED" });
        }
      }
    };

    window.addEventListener("scroll", checkScrollBottom, { passive: true });
    // Check initial state
    setTimeout(checkScrollBottom, 500);
  }

  // Listen for messages from background script
  function setupMessageListener() {
    const handleMessages = (message, sender, sendResponse) => {
      if (message.type === "TAB_LOCK_RELEASED") {
        chrome.runtime.onMessage.removeListener(handleMessages);
        if (message.reason === "scroll") {
          showToast("Read finished! Unlocking tab. 🎉", "success");
        } else {
          showToast("Focus session completed! 🎉", "success");
        }
        cleanup();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessages);
  }

  // Display floating completion toast
  function showToast(message, type) {
    const existing = document.getElementById("detoxx-focus-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "detoxx-focus-toast";
    toast.className = type;
    toast.innerHTML = `
      <span class="detoxx-toast-icon">✨</span>
      <span class="detoxx-toast-text">${message}</span>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("active"), 50);

    setTimeout(() => {
      toast.classList.remove("active");
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // Cleanup HUD elements
  function cleanup() {
    window.__detoxFocusHudActive = false;
    if (countdownTimer) clearInterval(countdownTimer);
    if (hudContainer) {
      hudContainer.classList.remove("active");
      setTimeout(() => hudContainer.remove(), 500);
    }
  }

  // Run initializer
  init();
})();
