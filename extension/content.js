// NeuroLens Content Script
// Injected into meet.google.com

let isAnalyzing = false;
let stream = null;
let intervalId = null;
let overlayVisible = false;

// 1. Initialize UI Injection
function init() {
  console.log("NeuroLens: Extension loaded on Google Meet");
  // Check if overlay already exists
  if (!document.getElementById('neurolens-overlay')) {
    createOverlay();
  }
}

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'neurolens-overlay';
  overlay.innerHTML = `
    <div class="nl-header">
      <div class="nl-brand">
        <span class="nl-icon">🧠</span> 
        <span class="nl-title">NeuroLens</span>
      </div>
      <span id="nl-status" class="nl-badge nl-badge-gray">Standby</span>
    </div>
    
    <div class="nl-content">
      <div class="nl-metric-row">
        <span class="nl-label">Attention</span>
        <span id="nl-att-val" class="nl-val">--</span>
        <div class="nl-bar-bg">
          <div id="nl-att-bar" class="nl-bar-fill nl-bar-cyan" style="width: 0%"></div>
        </div>
      </div>
      
      <div class="nl-metric-row">
        <span class="nl-label">Stress</span>
        <span id="nl-stress-val" class="nl-val">--</span>
        <div class="nl-bar-bg">
          <div id="nl-stress-bar" class="nl-bar-fill nl-bar-rose" style="width: 0%"></div>
        </div>
      </div>

      <div class="nl-sentiment-box">
         <span id="nl-emotion-icon">😐</span>
         <span id="nl-emotion-text">Neutral</span>
      </div>
    </div>

    <div class="nl-footer">
      <button id="nl-toggle-btn" class="nl-btn">
        Start Coaching
      </button>
      <div id="nl-error-msg" class="nl-error hidden"></div>
    </div>
  `;
  
  document.body.appendChild(overlay);

  // Attach Event Listener
  document.getElementById('nl-toggle-btn').addEventListener('click', toggleAnalysis);
}

// 2. Camera & Analysis Pipeline
async function toggleAnalysis() {
  const btn = document.getElementById('nl-toggle-btn');
  const status = document.getElementById('nl-status');
  const errorMsg = document.getElementById('nl-error-msg');
  
  errorMsg.classList.add('hidden'); // Clear errors
  
  if (isAnalyzing) {
    // STOP
    stopAnalysis();
    btn.innerText = "Start Coaching";
    btn.classList.remove('nl-btn-stop');
    status.innerText = "Standby";
    status.className = "nl-badge nl-badge-gray";
  } else {
    // START
    try {
      btn.innerText = "Initializing...";
      
      // Request separate stream for analysis
      // Note: On some OS/Browsers, if Meet is using the camera, this might fail or require permission interaction.
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 320, height: 240, facingMode: 'user' } 
      });
      
      isAnalyzing = true;
      btn.innerText = "Stop Session";
      btn.classList.add('nl-btn-stop');
      status.innerText = "Active";
      status.className = "nl-badge nl-badge-green";
      
      // Setup hidden video element for frame capture
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      
      // Analysis Loop (Running at 2 FPS to save CPU)
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      
      intervalId = setInterval(async () => {
        try {
          if (!video.videoWidth) return;

          // Draw frame to canvas
          ctx.drawImage(video, 0, 0, 320, 240);
          
          // Get pixel data for basic processing (brightness/motion)
          // const frame = ctx.getImageData(0, 0, 320, 240);
          
          // --- MOCK MODEL INFERENCE ---
          const mockMetrics = simulateAnalysis();
          
          updateUI(mockMetrics);
          saveMetric(mockMetrics); 
          
        } catch (err) {
          console.warn("NeuroLens processing error:", err);
        }
      }, 500); // 500ms = 2 FPS

    } catch (err) {
      console.error(err);
      btn.innerText = "Retry";
      status.innerText = "Error";
      status.className = "nl-badge nl-badge-red";
      errorMsg.innerText = "Camera access denied or busy.";
      errorMsg.classList.remove('hidden');
    }
  }
}

function stopAnalysis() {
  isAnalyzing = false;
  clearInterval(intervalId);
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  // Reset UI
  document.getElementById('nl-att-bar').style.width = '0%';
  document.getElementById('nl-stress-bar').style.width = '0%';
  document.getElementById('nl-emotion-text').innerText = 'Neutral';
  document.getElementById('nl-emotion-icon').innerText = '😐';
}

// 3. Simulation & UI Updates
function simulateAnalysis() {
  // Random walk logic for smooth-ish data
  const time = Date.now();
  const stressBase = 20 + Math.sin(time / 5000) * 10; // Oscillate
  const attBase = 70 + Math.cos(time / 8000) * 15;
  
  const stress = Math.min(100, Math.max(0, stressBase + (Math.random() * 10 - 5)));
  const attention = Math.min(100, Math.max(0, attBase + (Math.random() * 10 - 5)));
  
  let emotion = 'Neutral';
  let icon = '😐';
  
  if (stress > 60) { emotion = 'Stressed'; icon = '😰'; }
  else if (attention > 80) { emotion = 'Flow State'; icon = '⚡'; }
  else if (attention < 40) { emotion = 'Distracted'; icon = '😶‍🌫️'; }
  else if (Math.random() > 0.8) { emotion = 'Engaged'; icon = '🙂'; }

  return { stress, attention, emotion, icon };
}

function updateUI(metrics) {
  const attBar = document.getElementById('nl-att-bar');
  const stressBar = document.getElementById('nl-stress-bar');
  
  attBar.style.width = `${metrics.attention}%`;
  document.getElementById('nl-att-val').innerText = `${Math.round(metrics.attention)}%`;
  
  stressBar.style.width = `${metrics.stress}%`;
  document.getElementById('nl-stress-val').innerText = `${Math.round(metrics.stress)}%`;
  
  // Color logic
  if (metrics.attention < 40) attBar.style.backgroundColor = '#fbbf24'; // yellow
  else attBar.style.backgroundColor = '#22d3ee'; // cyan
  
  if (metrics.stress > 60) stressBar.style.backgroundColor = '#f43f5e'; // red
  else stressBar.style.backgroundColor = '#a78bfa'; // purple

  document.getElementById('nl-emotion-text').innerText = metrics.emotion;
  document.getElementById('nl-emotion-icon').innerText = metrics.icon;
}

// 4. Data Storage
function saveMetric(metrics) {
  // Save to chrome.storage.local
  const point = { timestamp: Date.now(), ...metrics };
  chrome.storage.local.get(['currentSession'], (result) => {
    const session = result.currentSession || [];
    session.push(point);
    // Keep last 200 points to prevent storage overflow
    if(session.length > 200) session.shift(); 
    chrome.storage.local.set({ currentSession: session });
  });
}

// Run init
init();