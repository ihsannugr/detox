document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const masterSwitch = document.getElementById("master-switch");
  const toggleFeed = document.getElementById("toggle-feed");
  const toggleSidebar = document.getElementById("toggle-sidebar");
  const toggleWho = document.getElementById("toggle-who");
  const toggleMetrics = document.getElementById("toggle-metrics");

  const inputTimeLimit = document.getElementById("input-time-limit");
  const inputPauseDelay = document.getElementById("input-pause-delay");
  const inputScrollLimit = document.getElementById("input-scroll-limit");

  const valTimeLimit = document.getElementById("val-time-limit");
  const valPauseDelay = document.getElementById("val-pause-delay");
  const valScrollLimit = document.getElementById("val-scroll-limit");

  const dialTimeDisplay = document.getElementById("dial-time-display");
  const dialLimitDisplay = document.getElementById("dial-limit-display");
  const statusMessage = document.getElementById("status-message");
  const progressCircle = document.getElementById("progress-circle");

  const statScrolls = document.getElementById("stat-scrolls");
  const statBlocks = document.getElementById("stat-blocks");
  const btnResetStats = document.getElementById("btn-reset-stats");

  // Tab Lock elements
  const toggleTabLock = document.getElementById("toggle-tab-lock");
  const inputFocusDuration = document.getElementById("input-focus-duration");
  const valFocusDuration = document.getElementById("val-focus-duration");
  const btnLockTab = document.getElementById("btn-lock-tab");
  const btnLockTabText = document.getElementById("btn-lock-tab-text");

  const containerElement = document.querySelector(".container");

  // SVG Progress Ring Specs
  const RADIUS = 50;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  progressCircle.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  progressCircle.style.strokeDashoffset = CIRCUMFERENCE;

  // Load configuration and statistics
  function loadData() {
    chrome.runtime.sendMessage({ type: "GET_STATS" }, (data) => {
      if (chrome.runtime.lastError || !data) {
        console.error("Failed to fetch statistics:", chrome.runtime.lastError);
        return;
      }

      // Update Toggles
      masterSwitch.checked = data.enabled !== false;
      toggleFeed.checked = data.hideFeed !== false;
      toggleSidebar.checked = data.hideSidebar !== false;
      toggleWho.checked = data.hideWhoToFollow !== false;
      toggleMetrics.checked = data.hideMetrics !== false;

      // Update Sliders
      inputTimeLimit.value = data.dailyLimit || 15;
      inputPauseDelay.value = data.pauseDuration || 10;
      inputScrollLimit.value = data.scrollLimit || 3;

      // Update Slider Labels
      valTimeLimit.textContent = `${data.dailyLimit || 15} mins`;
      valPauseDelay.textContent = `${data.pauseDuration || 10} secs`;
      valScrollLimit.textContent = `${data.scrollLimit || 3} pages`;

      // Update Tab Lock settings UI
      toggleTabLock.checked = data.tabLockEnabled === true;
      inputFocusDuration.value = data.focusDuration || 1;
      valFocusDuration.textContent = `${data.focusDuration || 1} min${(data.focusDuration || 1) > 1 ? 's' : ''}`;

      // Master Enabled State Styling
      if (masterSwitch.checked) {
        containerElement.classList.remove("disabled-state");
      } else {
        containerElement.classList.add("disabled-state");
      }

      // Tab Lock Active State Styling
      if (toggleTabLock.checked) {
        containerElement.classList.remove("tab-lock-inactive");
      } else {
        containerElement.classList.add("tab-lock-inactive");
      }

      // Active lock countdown styling
      const now = Date.now();
      if (data.lockedTabId && data.lockedUntil && now < data.lockedUntil) {
        const secondsLeft = Math.max(0, Math.round((data.lockedUntil - now) / 1000));
        const m = Math.floor(secondsLeft / 60);
        const s = secondsLeft % 60;
        
        btnLockTabText.textContent = `Locked (${m}:${s.toString().padStart(2, '0')})`;
        btnLockTab.disabled = true;
        btnLockTab.classList.add("locked");
        toggleTabLock.disabled = true;
        inputFocusDuration.disabled = true;
      } else {
        btnLockTabText.textContent = "Lock Current Tab";
        btnLockTab.disabled = !toggleTabLock.checked;
        btnLockTab.classList.remove("locked");
        toggleTabLock.disabled = false;
        inputFocusDuration.disabled = false;
      }

      // Update Stats
      const minutesSpent = (data.timeSpentToday || 0) / 60;
      const limit = data.dailyLimit || 15;
      const scrollPages = (data.scrollCountToday || 0).toFixed(1);
      const blocksTriggered = data.totalBlockedActions || 0;

      statScrolls.textContent = scrollPages;
      statBlocks.textContent = blocksTriggered;

      // Update Timer Dial UI
      dialTimeDisplay.textContent = minutesSpent < 1 ? 
        `${Math.round(data.timeSpentToday || 0)}s` : 
        `${minutesSpent.toFixed(1)}m`;
      
      dialLimitDisplay.textContent = `of ${limit}m`;

      // Set Progress Circle Dashoffset
      const percent = Math.min(100, (minutesSpent / limit) * 100);
      const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
      progressCircle.style.strokeDashoffset = offset;

      // Status Indicator Updates
      if (!masterSwitch.checked) {
        statusMessage.textContent = "DetoX is turned off";
        progressCircle.style.stroke = "rgba(255, 255, 255, 0.1)";
      } else if (minutesSpent >= limit) {
        statusMessage.textContent = "Daily limit reached!";
        statusMessage.style.color = "#EF4444";
        progressCircle.style.stroke = "#EF4444";
      } else {
        statusMessage.textContent = "Mindful browsing active";
        statusMessage.style.color = "#10B981";
        progressCircle.style.stroke = "url(#gradient)";
      }
    });
  }

  // Math Verification Logic
  const mathModal = document.getElementById("math-modal");
  const mathQuestion = document.getElementById("popup-math-question");
  const mathInput = document.getElementById("popup-math-input");
  const mathError = document.getElementById("popup-math-error");
  const btnMathCancel = document.getElementById("popup-math-cancel");
  const btnMathSubmit = document.getElementById("popup-math-submit");

  let currentMathAnswer = null;
  let onMathSuccessCallback = null;
  let onMathCancelCallback = null;

  function generateMathProblem() {
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
        <div style="font-size: 12px; margin-bottom: 10px; color: #9ca3af;">Find the determinant:</div>
        <div style="display: inline-flex; align-items: center; font-family: monospace; font-size: 20px; border-left: 2px solid #fff; border-right: 2px solid #fff; padding: 0 12px; margin: 5px 0;">
          <div style="text-align: center; margin-right: 18px; line-height: 1.4;">
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
        <div style="font-size: 12px; margin-bottom: 10px; color: #9ca3af;">If f(x) = ${A}x² + ${B}x,</div>
        <div style="font-size: 20px; font-weight: 800; color: #a78bfa;">find f'(${C})</div>
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
        <div style="font-size: 12px; margin-bottom: 10px; color: #9ca3af;">Solve for x &gt; 0:</div>
        <div style="font-size: 18px; font-weight: 800; color: #a78bfa; letter-spacing: 0.5px;">x² ${pSign} ${absP === 1 ? '' : absP}x - ${Q} = 0</div>
      `;
      answer = R1;
    }

    return { question, answer };
  }

  function promptMathVerification(onSuccess, onCancel) {
    const problem = generateMathProblem();
    currentMathAnswer = problem.answer;
    mathQuestion.innerHTML = problem.question;
    mathInput.value = "";
    mathError.classList.add("hidden");
    onMathSuccessCallback = onSuccess;
    onMathCancelCallback = onCancel;
    mathModal.classList.add("active");
    setTimeout(() => mathInput.focus(), 100);
  }

  function handleMathVerification() {
    const userAnswer = parseInt(mathInput.value.trim(), 10);
    if (userAnswer === currentMathAnswer) {
      mathModal.classList.remove("active");
      if (onMathSuccessCallback) onMathSuccessCallback();
    } else {
      mathError.classList.remove("hidden");
      
      // Shake animation trigger
      const modalContent = mathModal.querySelector(".modal-content");
      modalContent.style.animation = "none";
      void modalContent.offsetWidth; // force reflow
      modalContent.style.animation = "shake 0.3s ease";
      
      mathInput.value = "";
      mathInput.focus();
    }
  }

  btnMathSubmit.addEventListener("click", handleMathVerification);
  mathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleMathVerification();
    }
  });

  btnMathCancel.addEventListener("click", () => {
    mathModal.classList.remove("active");
    if (onMathCancelCallback) onMathCancelCallback();
  });

  // Save Settings wrapper
  function saveSetting(key, value) {
    chrome.storage.local.set({ [key]: value }, () => {
      loadData();
      // Notify active tabs about configuration change
      chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", key, value }).catch(err => {
            // Unloaded tab error ignore
          });
        });
      });
    });
  }

  // Toggle Event Listeners
  masterSwitch.addEventListener("change", (e) => {
    if (!e.target.checked) {
      // Intercept and verify
      promptMathVerification(
        () => {
          saveSetting("enabled", false);
        },
        () => {
          e.target.checked = true;
          loadData();
        }
      );
    } else {
      saveSetting("enabled", true);
    }
  });

  toggleFeed.addEventListener("change", (e) => saveSetting("hideFeed", e.target.checked));
  toggleSidebar.addEventListener("change", (e) => saveSetting("hideSidebar", e.target.checked));
  toggleWho.addEventListener("change", (e) => saveSetting("hideWhoToFollow", e.target.checked));
  toggleMetrics.addEventListener("change", (e) => saveSetting("hideMetrics", e.target.checked));

  // Slider Event Listeners
  inputTimeLimit.addEventListener("input", (e) => {
    valTimeLimit.textContent = `${e.target.value} mins`;
  });
  inputTimeLimit.addEventListener("change", (e) => {
    saveSetting("dailyLimit", parseInt(e.target.value));
  });

  inputPauseDelay.addEventListener("input", (e) => {
    valPauseDelay.textContent = `${e.target.value} secs`;
  });
  inputPauseDelay.addEventListener("change", (e) => {
    saveSetting("pauseDuration", parseInt(e.target.value));
  });

  inputScrollLimit.addEventListener("input", (e) => {
    valScrollLimit.textContent = `${e.target.value} pages`;
  });
  inputScrollLimit.addEventListener("change", (e) => {
    saveSetting("scrollLimit", parseInt(e.target.value));
  });

  // Tab Lock Toggles & Sliders
  toggleTabLock.addEventListener("change", (e) => saveSetting("tabLockEnabled", e.target.checked));

  inputFocusDuration.addEventListener("input", (e) => {
    valFocusDuration.textContent = `${e.target.value} min${e.target.value > 1 ? 's' : ''}`;
  });
  inputFocusDuration.addEventListener("change", (e) => {
    saveSetting("focusDuration", parseInt(e.target.value));
  });

  // Lock Current Tab Button
  btnLockTab.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      const activeTab = tabs[0];
      const duration = parseInt(inputFocusDuration.value, 10) || 1;
      const lockedUntil = Date.now() + duration * 60 * 1000;

      chrome.storage.local.set({
        lockedTabId: activeTab.id,
        lockedUntil: lockedUntil
      }, () => {
        // Set alarm in background.js to turn it off when expired
        chrome.runtime.sendMessage({ type: "SET_LOCK_ALARM", lockedUntil: lockedUntil });

        // Dynamically inject the HUD to the current active tab
        chrome.scripting.insertCSS({
          target: { tabId: activeTab.id },
          files: ["focus_hud.css"]
        }).catch(err => console.error("Error inserting HUD CSS:", err));

        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ["focus_hud.js"]
        }).catch(err => console.error("Error executing HUD JS:", err));

        loadData();
      });
    });
  });

  // Reset Stats Button
  btnResetStats.addEventListener("click", () => {
    promptMathVerification(
      () => {
        chrome.storage.local.set({
          timeSpentToday: 0,
          scrollCountToday: 0
        }, () => {
          loadData();
          // Refresh active X tabs
          chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
            tabs.forEach((tab) => {
              chrome.tabs.sendMessage(tab.id, { type: "RESET_STATS" }).catch(err => {});
            });
          });
        });
      },
      () => {
        // Cancelled, do nothing
      }
    );
  });

  // Initial Load
  loadData();
  // Poll statistics every second while popup is open to show real-time updates
  setInterval(loadData, 1000);
});
