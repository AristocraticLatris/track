// js/main.js
document.addEventListener("DOMContentLoaded", () => {

  // -------------------------
  // Config & Preload Sounds
  // -------------------------
  const AUDIO_PATH = "tracks/assets/";
  const soundFiles = {
    default: AUDIO_PATH + "notification.mp3",
    study: AUDIO_PATH + "study.mp3",
    meeting: AUDIO_PATH + "meeting.mp3",
    personal: AUDIO_PATH + "personal.mp3"
  };

  // Audio objects (preloaded)
  const sounds = {
    default: new Audio(soundFiles.default),
    study: new Audio(soundFiles.study),
    meeting: new Audio(soundFiles.meeting),
    personal: new Audio(soundFiles.personal)
  };
  // Ensure preload
  Object.values(sounds).forEach(a => { a.preload = "auto"; a.load(); });

  // browsers require a user gesture to allow sound play reliably.
  let audioUnlocked = false;
  const unlockAudio = () => {
    Object.values(sounds).forEach(a => {
      // try a silent play/pause to unlock
      a.volume = 0;
      a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 1; })
        .catch(()=>{ /* ignore */ })
    });
    audioUnlocked = true;
  };
  document.body.addEventListener("click", unlockAudio, { once: true });

  // -------------------------
  // Storage & initial data
  // -------------------------
  const STORAGE_KEY = "track_timetable_v1";
  let timetable = loadTimetable() || {
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: [], saturday: [], sunday: []
  };

  function loadTimetable() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  function saveTimetable() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timetable));
  }

  // -------------------------
  // Theme persistence
  // -------------------------
  const THEME_KEY = "track_theme_v1";
  const toggleBtn = document.getElementById("toggleMode");
  const applySavedTheme = () => {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "dark") document.body.classList.add("dark");
    toggleBtn && (toggleBtn.textContent = document.body.classList.contains("dark") ? "☀️ Light Mode" : "🌙 Dark Mode");
  };
  applySavedTheme();
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("dark");
      const mode = document.body.classList.contains("dark") ? "dark" : "light";
      localStorage.setItem(THEME_KEY, mode);
      toggleBtn.textContent = mode === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode";
    });
  }

  // -------------------------
  // Utilities
  // -------------------------
  function generateId(){ return '_' + Math.random().toString(36).substr(2,9); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function getContrastColor(bg) {
    if(!bg) return "#000";
    // support rgb(...) and hex
    let r,g,b;
    if(bg.startsWith("rgb")) {
      const m = bg.match(/\d+/g);
      if(!m) return "#000";
      [r,g,b] = m.map(Number);
    } else if(bg.startsWith("#")) {
      const hex = bg.slice(1);
      const num = parseInt(hex,16);
      r = (num >> 16) & 255; g = (num >> 8) & 255; b = num & 255;
    } else {
      // fallback
      return "#000";
    }
    const luma = 0.299*r + 0.587*g + 0.114*b;
    return luma > 150 ? "#000" : "#fff";
  }
  function randomColor() {
    // softer palette
    const r = Math.floor(60 + Math.random()*180);
    const g = Math.floor(60 + Math.random()*180);
    const b = Math.floor(60 + Math.random()*180);
    return `rgb(${r},${g},${b})`;
  }

  // -------------------------
  // Modal system (single handlers)
  // -------------------------
  const modal = document.getElementById("reminderModal");
  const modalContent = modal?.querySelector(".modal-content");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const btnDismiss = document.getElementById("dismissBtn");
  const btnSnooze = document.getElementById("snoozeBtn");
  const btnClose = document.getElementById("closeModal");

  let currentModalSession = null;
  let modalVisible = false;

  function playSoundFor(sessionType) {
    const type = (sessionType || "").toLowerCase();
    const audio = sounds[type] || sounds.default;
    if(!audioUnlocked) { /* try quick unlock */ unlockAudio(); }
    audio.currentTime = 0;
    audio.play().catch(err => {
      // log, but don't crash UX
      console.warn("Audio play prevented:", err);
    });
  }

  function showModal(session, titleOverride=null, bodyOverride=null) {
    if(!modal || !modalContent) return;
    currentModalSession = session;
    modalTitle.textContent = titleOverride || "Reminder!";
    modalBody.textContent = bodyOverride || `${session.title} starts in ${session.reminder} minutes!`;
    modalContent.style.backgroundColor = session.color || "#fffae6";
    modalContent.style.color = getContrastColor(session.color || "#fffae6");

    // animation class based on type
    modalContent.className = "modal-content " + (session.type === "study" ? "fade" : session.type === "meeting" ? "bounce" : "zoom");

    modal.style.display = "flex";
    modalVisible = true;

    // if session.type exists, play specific sound
    playSoundFor(session.type);
  }

  function closeModal() {
    if(!modal) return;
    modal.style.display = "none";
    modalVisible = false;
    currentModalSession = null;
  }

  // attach once
  btnClose && btnClose.addEventListener("click", closeModal);
  btnDismiss && btnDismiss.addEventListener("click", closeModal);
  btnSnooze && btnSnooze.addEventListener("click", () => {
    if(!currentModalSession) { closeModal(); return; }
    const minutes = parseInt(prompt("Snooze minutes:", "5")) || 5;
    // schedule snooze via timestamp so it persists across reloads
    currentModalSession.snoozeUntil = Date.now() + minutes * 60_000;
    currentModalSession.reminderTriggered = false; // allow future triggers
    saveTimetable();
    closeModal();
  });

  // If modal overlay clicked -- close
  modal && modal.addEventListener("click", (e) => {
    if(e.target === modal) closeModal();
  });

  // -------------------------
  // Reminder logic (robust)
  // -------------------------
  // We'll check every 15s during dev; production can be 60s.
  function checkReminders() {
    const now = new Date();
    const currentMinutes = now.getHours()*60 + now.getMinutes();
    const nowMs = Date.now();

    Object.keys(timetable).forEach(day => {
      timetable[day].forEach(session => {
        // if snoozed and time hasn't arrived, skip
        if(session.snoozeUntil && nowMs < session.snoozeUntil) return;
        // if snooze time reached, show immediately (and clear snooze)
        if(session.snoozeUntil && nowMs >= session.snoozeUntil) {
          delete session.snoozeUntil;
          showModal(session);
          session.reminderTriggered = true;
          saveTimetable();
          return;
        }

        if(!session.reminder || session.reminder <= 0) return;
        if(session.reminderTriggered) return;

        const [h,m] = (session.start||"00:00").split(":").map(Number);
        const sessionMinutes = h*60 + m;
        // trigger when currentMinutes equals sessionMinutes - reminder
        if(currentMinutes === sessionMinutes - session.reminder) {
          showModal(session);
          session.reminderTriggered = true;
          saveTimetable();
        }
      });
    });
  }
  // faster interval so user testing is snappier; safe to use 30-60s in prod
  setInterval(checkReminders, 15_000);
  // also run once at start
  checkReminders();

  // -------------------------
  // Drag & Resize helpers
  // -------------------------
  function makeDraggable(el, session, dayId) {
    // pointer-based for touch + mouse
    let startX = 0, startY = 0, isDragging = false, offsetX = 0, offsetY = 0;
    let initialLeft = 0, initialTop = 0;

    const onPointerDown = (e) => {
      // ignore clicks on buttons inside el
      if(e.target.tagName === "BUTTON" || e.target.classList.contains("resize-handle")) return;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      isDragging = false;
      initialLeft = el.offsetLeft; initialTop = el.offsetTop;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };

    const onPointerMove = (e) => {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if(!isDragging) {
        if(Math.abs(dx) > 6 || Math.abs(dy) > 6) isDragging = true;
        else return;
      }
      el.style.position = "absolute";
      el.style.zIndex = 9999;
      // snap to 8px grid for neatness
      const left = Math.round((e.clientX - offsetX) / 8) * 8;
      const top = Math.round((e.clientY - offsetY) / 8) * 8;
      el.style.left = left + "px";
      el.style.top = top + "px";
    };

    const onPointerUp = (e) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if(!isDragging) {
        // treat as click (no movement) — do nothing special here
        return;
      }
      // find target day under pointer
      const daysEls = document.querySelectorAll(".day");
      daysEls.forEach(d => {
        const rect = d.getBoundingClientRect();
        if(e.clientX > rect.left && e.clientX < rect.right && e.clientY > rect.top && e.clientY < rect.bottom) {
          // move session from dayId to d.id
          if(d.id !== dayId) {
            timetable[dayId] = timetable[dayId].filter(s => s.id !== session.id);
            // ensure pushed session keeps its id and reminderTriggered status
            timetable[d.id].push(session);
            saveTimetable();
            renderTimetable();
          } else {
            // same day drop -> re-render to reset absolute positioning
            renderTimetable();
          }
        }
      });
    };

    el.addEventListener("pointerdown", onPointerDown);
  }

  function makeResizable(el, session) {
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    handle.style.position = "absolute";
    handle.style.left = "0";
    handle.style.bottom = "0";
    handle.style.width = "100%";
    handle.style.height = "8px";
    handle.style.cursor = "ns-resize";
    el.style.position = el.style.position || "relative";
    el.appendChild(handle);

    let startY = 0, startH = 0;
    const pxPerHour = 50; // visual mapping: 50px = 1 hour (used to compute new end time)
    const onHandlePointerDown = (e) => {
      e.stopPropagation();
      handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
      startY = e.clientY;
      startH = el.offsetHeight;
      window.addEventListener("pointermove", onHandleMove);
      window.addEventListener("pointerup", onHandleUp);
    };
    const onHandleMove = (e) => {
      let newH = startH + (e.clientY - startY);
      // snap to 15 minute increments -> px per 15min = pxPerHour / 4
      const step = pxPerHour / 4;
      newH = Math.max(24, Math.round(newH / step) * step); // min height 24px
      el.style.height = newH + "px";
    };
    const onHandleUp = (e) => {
      window.removeEventListener("pointermove", onHandleMove);
      window.removeEventListener("pointerup", onHandleUp);
      // convert height to minutes
      const durationMins = Math.round(el.offsetHeight / pxPerHour * 60);
      const [h, m] = (session.start || "00:00").split(":").map(Number);
      let total = h*60 + m + durationMins;
      const newH = Math.floor(total / 60) % 24;
      const newM = total % 60;
      session.end = `${String(newH).padStart(2,"0")}:${String(newM).padStart(2,"0")}`;
      saveTimetable();
      renderTimetable();
    };

    handle.addEventListener("pointerdown", onHandlePointerDown);
  }

  // -------------------------
  // Render (responsive + icons)
  // -------------------------
  function typeIcon(type) {
    switch((type||"").toLowerCase()) {
      case "study": return "🎓";
      case "meeting": return "💼";
      case "personal": return "❤️";
      default: return "🗓️";
    }
  }

  function renderTimetable() {
    const container = document.getElementById("timetable");
    if(!container) return console.error("#timetable not found");
    container.innerHTML = "";
    const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

    days.forEach(day => {
      const dayDiv = document.createElement("div");
      dayDiv.className = "day";
      dayDiv.id = day;

      const title = document.createElement("h2");
      title.textContent = day.charAt(0).toUpperCase() + day.slice(1);

      const addBtn = document.createElement("button");
      addBtn.className = "add-btn";
      addBtn.textContent = "+ Add";
      addBtn.addEventListener("click", () => addSessionPrompt(day));

      dayDiv.appendChild(title);
      dayDiv.appendChild(addBtn);

      const sessionsDiv = document.createElement("div");
      sessionsDiv.className = "sessions";

      // visually order by start time
      timetable[day].sort((a,b) => {
        const [ah,am] = (a.start||"00:00").split(":").map(Number);
        const [bh,bm] = (b.start||"00:00").split(":").map(Number);
        return (ah*60+am) - (bh*60+bm);
      });

      timetable[day].forEach(session => {
        const card = document.createElement("div");
        card.className = "session";
        card.dataset.sessionId = session.id;
        card.style.backgroundColor = session.color || randomColor();
        card.style.color = getContrastColor(session.color || "#fff");
        card.style.position = "relative";
        card.style.padding = "8px 10px";
        card.style.borderRadius = "8px";
        card.style.marginBottom = "8px";
        card.style.minHeight = "36px";
        card.style.display = "flex";
        card.style.justifyContent = "space-between";
        card.style.alignItems = "center";

        // Left area: details + icon
        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "8px";

        const icon = document.createElement("span");
        icon.textContent = typeIcon(session.type);
        icon.style.fontSize = "18px";

        const text = document.createElement("div");
        text.innerHTML = `<strong style="display:block">${session.title}</strong><small style="display:block">${session.start} - ${session.end}</small>`;

        left.appendChild(icon);
        left.appendChild(text);

        // Right area: reminder & action buttons
        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "8px";

        if(session.reminder && session.reminder > 0) {
          const rem = document.createElement("span");
          rem.textContent = `⏰ ${session.reminder}m`;
          rem.style.fontSize = "12px";
          right.appendChild(rem);
        }

        const editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.title = "Edit";
        editBtn.addEventListener("click", (e) => { e.stopPropagation(); editSession(day, session.id); });

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑️";
        delBtn.title = "Delete";
        delBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteSession(day, session.id); });

        right.appendChild(editBtn);
        right.appendChild(delBtn);

        card.appendChild(left);
        card.appendChild(right);

        // click to test reminder
        card.addEventListener("click", () => {
          // reveal as test modal
          showModal(session, "Reminder (Test)", `This is a test reminder for "${session.title}"`);
        });

        // attach draggable & resizable
        makeDraggable(card, session, day);
        makeResizable(card, session);

        sessionsDiv.appendChild(card);
      });

      dayDiv.appendChild(sessionsDiv);
      container.appendChild(dayDiv);
    });

    // add a small responsive hint class if width small
    if(window.innerWidth < 700) document.body.classList.add("compact");
    else document.body.classList.remove("compact");
  }

  // -------------------------
  // Add/Edit/Delete UI
  // -------------------------
  function addSession(day, session) {
    session.id = session.id || generateId();
    session.reminderTriggered = session.reminderTriggered || false;
    session.color = session.color || randomColor();
    session.type = session.type || "personal";
    timetable[day].push(session);
    saveTimetable();
    renderTimetable();
  }

  function editSession(day, id) {
    const s = timetable[day].find(x => x.id === id);
    if(!s) return;
    const title = prompt("Title:", s.title) || s.title;
    const start = prompt("Start (HH:MM):", s.start) || s.start;
    const end = prompt("End (HH:MM):", s.end) || s.end;
    const reminder = parseInt(prompt("Reminder (minutes):", String(s.reminder || 0))) || 0;
    const color = prompt("Color (hex or rgb):", s.color) || s.color;
    const type = prompt("Type (study, meeting, personal):", s.type) || s.type;
    s.title = title; s.start = start; s.end = end; s.reminder = reminder; s.color = color; s.type = type;
    s.reminderTriggered = false;
    delete s.snoozeUntil;
    saveTimetable();
    renderTimetable();
  }

  function deleteSession(day, id) {
    if(!confirm("Delete this session?")) return;
    timetable[day] = timetable[day].filter(s => s.id !== id);
    saveTimetable();
    renderTimetable();
  }

  function addSessionPrompt(day) {
    const title = prompt("Session title:");
    if(!title) return;
    const start = prompt("Start (HH:MM):", "09:00");
    const end = prompt("End (HH:MM):", "10:00");
    const reminder = parseInt(prompt("Reminder (minutes before):", "10")) || 0;
    const type = prompt("Type (study, meeting, personal):", "personal") || "personal";
    const color = prompt("Color (hex or rgb):", randomColor());
    addSession(day, { title, start, end, reminder, type, color });
  }

  // -------------------------
  // Initial render & resize handler
  // -------------------------
  renderTimetable();
  window.addEventListener("resize", () => {
    if(window.innerWidth < 700) document.body.classList.add("compact"); else document.body.classList.remove("compact");
  });

  // -------------------------
  // Helpful dev: quick sample data (uncomment to seed)
  // -------------------------
  // if(Object.values(timetable).every(arr => arr.length === 0)) {
  //   addSession("monday", { title: "Study JS", start:"09:00", end:"10:00", reminder:10, type:"study", color: "rgb(120,180,240)" });
  //   addSession("wednesday", { title: "Team Sync", start:"14:00", end:"15:00", reminder:15, type:"meeting", color: "rgb(240,140,140)" });
  //   addSession("friday", { title: "Gym", start:"18:00", end:"19:00", reminder:30, type:"personal", color: "rgb(170,220,150)" });
  // }

});
