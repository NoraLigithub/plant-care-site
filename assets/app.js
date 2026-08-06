const LIFE_DAY_START_HOUR = 6;

const localLifeDate = (now = new Date()) => {
  const shifted = new Date(now.valueOf() - LIFE_DAY_START_HOUR * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

document.querySelectorAll("[data-filter-input]").forEach((input) => {
  const listId = input.dataset.filterInput;
  const list = document.getElementById(listId);
  const empty = document.querySelector(`[data-filter-empty="${listId}"]`);
  if (!list) return;

  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase("zh-CN");
    let visible = 0;
    list.querySelectorAll("[data-search]").forEach((card) => {
      const match = !query || card.dataset.search.includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (empty) empty.hidden = visible !== 0;
  });
});

const receiptForm = document.querySelector("[data-care-receipt]");

if (receiptForm) {
  const taskInputs = [...document.querySelectorAll("[data-care-task]")];
  const dateInput = receiptForm.querySelector("[data-care-date]");
  const noteInput = receiptForm.querySelector("[data-care-note]");
  const summary = receiptForm.querySelector("[data-selected-summary]");
  const status = receiptForm.querySelector("[data-receipt-status]");
  const clearButton = receiptForm.querySelector("[data-clear-receipt]");
  const copyButton = receiptForm.querySelector("[data-copy-receipt]");
  const shareButton = receiptForm.querySelector("[data-share-receipt]");
  const generatedPanel = receiptForm.querySelector("[data-generated-receipt]");
  const generatedText = receiptForm.querySelector("[data-generated-text]");
  const defaultDate = receiptForm.dataset.defaultDate;
  const storageKey = `plant-care-receipt:${defaultDate}`;

  const taskKey = (input) => [
    input.dataset.careKind,
    input.dataset.careId,
    input.dataset.careAction,
  ].join(":");

  const selectedTasks = () => taskInputs.filter((input) => input.checked);

  const invalidateSentence = () => {
    if (generatedPanel) generatedPanel.hidden = true;
    if (generatedText) generatedText.value = "";
    if (copyButton) copyButton.hidden = true;
    if (shareButton) shareButton.hidden = true;
    if (status) status.textContent = "";
  };

  const updateCardState = (input) => {
    const card = input.closest(".task-card");
    if (card) card.classList.toggle("is-complete", input.checked);
  };

  const updateSummary = () => {
    const selected = selectedTasks();
    if (summary) {
      summary.textContent = selected.length
        ? `已勾选 ${selected.length} 项：${selected.map((input) => input.dataset.careName).join("、")}`
        : taskInputs.length
          ? "还没有勾选任务"
          : "今天没有预设任务，可以直接写文字补充";
    }
    taskInputs.forEach(updateCardState);
  };

  const saveDraft = () => {
    const draft = {
      date: dateInput?.value || defaultDate,
      note: noteInput?.value || "",
      tasks: selectedTasks().map(taskKey),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch (_error) {
      // 隐私模式禁止本地存储时，表单仍可正常提交。
    }
  };

  try {
    const draft = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (draft) {
      if (dateInput && draft.date) dateInput.value = draft.date;
      if (noteInput && draft.note) noteInput.value = draft.note;
      const savedTasks = new Set(draft.tasks || []);
      taskInputs.forEach((input) => {
        input.checked = savedTasks.has(taskKey(input));
      });
    }
  } catch (_error) {
    // 草稿损坏时忽略，不阻断页面。
  }

  taskInputs.forEach((input) => {
    input.addEventListener("change", () => {
      updateSummary();
      saveDraft();
      invalidateSentence();
    });
  });
  dateInput?.addEventListener("change", () => {
    saveDraft();
    invalidateSentence();
  });
  noteInput?.addEventListener("input", () => {
    saveDraft();
    invalidateSentence();
  });

  clearButton?.addEventListener("click", () => {
    taskInputs.forEach((input) => {
      input.checked = false;
    });
    if (noteInput) noteInput.value = "";
    if (dateInput) dateInput.value = defaultDate;
    try {
      localStorage.removeItem(storageKey);
    } catch (_error) {
      // 同上，无法访问本地存储不影响清空当前表单。
    }
    if (status) status.textContent = "已清空。";
    if (generatedPanel) generatedPanel.hidden = true;
    if (generatedText) generatedText.value = "";
    if (copyButton) copyButton.hidden = true;
    if (shareButton) shareButton.hidden = true;
    updateSummary();
  });

  const sentenceForTask = (input) => {
    const kind = input.dataset.careKind;
    const name = input.dataset.careName;
    const action = input.dataset.careAction;
    if (kind === "water") return `${name}已浇水`;
    if (kind === "fertilize") return `${name}已施肥`;
    if (kind === "inspect") return `已检查${name}盆土`;
    return `${name}已${action}`;
  };

  const copySentence = async () => {
    const sentence = generatedText?.value || "";
    if (!sentence) return;
    try {
      await navigator.clipboard.writeText(sentence);
      if (status) status.textContent = "已复制，粘贴到飞书机器人私聊即可。";
    } catch (_error) {
      generatedText.focus();
      generatedText.select();
      const copied = document.execCommand("copy");
      if (status) {
        status.textContent = copied
          ? "已复制，粘贴到飞书机器人私聊即可。"
          : "复制失败，请长按上面的一句话手动复制。";
      }
    }
  };

  copyButton?.addEventListener("click", copySentence);

  shareButton?.addEventListener("click", async () => {
    const sentence = generatedText?.value || "";
    if (!sentence || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title: "养护回执", text: sentence });
      if (status) status.textContent = "已打开系统分享，请选择飞书机器人私聊。";
    } catch (error) {
      if (error?.name !== "AbortError" && status) {
        status.textContent = "分享没有完成，可以改用复制。";
      }
    }
  });

  receiptForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const selected = selectedTasks();
    const note = noteInput?.value.trim() || "";
    const careDate = dateInput?.value || defaultDate;

    if (!selected.length && !note) {
      if (status) status.textContent = "请至少勾选一项，或者写一句补充。";
      noteInput?.focus();
      return;
    }

    const actions = selected.map(sentenceForTask);
    const actionText = actions.join("；");
    const sentence = actionText
      ? `${careDate}：${actionText}。${note ? `补充：${note}` : ""}`
      : `${careDate}：${note}`;
    saveDraft();
    if (generatedText) generatedText.value = sentence;
    if (generatedPanel) generatedPanel.hidden = false;
    if (copyButton) copyButton.hidden = false;
    if (shareButton) shareButton.hidden = typeof navigator.share !== "function";
    if (status) status.textContent = "一句话已生成。";
  });

  updateSummary();
}

const meditationApp = document.querySelector("[data-meditation-app]");

if (meditationApp) {
  const apiUrl = meditationApp.dataset.apiUrl;
  const repository = meditationApp.dataset.repository;
  const tokenKey = "meditation-sync-token";
  const cacheKey = "meditation-stats-cache";
  const pendingKey = "meditation-pending-record";
  const modal = document.querySelector("[data-meditation-modal]");
  const steps = [...document.querySelectorAll("[data-meditation-step]")];
  const locked = document.querySelector("[data-meditation-locked]");
  const dashboard = document.querySelector("[data-meditation-dashboard]");
  const dailyMessage = document.querySelector("[data-daily-message]");
  const syncState = document.querySelector("[data-sync-state]");
  const feedback = document.querySelector("[data-meditation-feedback]");
  const fallback = document.querySelector("[data-meditation-fallback]");
  const customForm = document.querySelector("[data-custom-duration]");
  const dateInput = document.querySelector("[data-meditation-date]");
  let syncToken = "";
  let lastRecordId = "";
  let lastDailyMessage = "";
  let returnFocus = null;

  const today = localLifeDate();
  if (dateInput) {
    dateInput.value = today;
    dateInput.max = today;
  }

  const pureMessages = [
    "今天也给自己留一小块不被催促的时间。",
    "不必把心安顿得完美，愿意坐下来就已经很好。",
    "念头来去都没关系，发现了，再轻轻回来。",
    "安静不一定没有声音，也可以是你愿意听见自己。",
    "不用追求特别的状态，平常地坐一会儿就好。",
    "今天的一次停顿，也是在照顾更长远的自己。",
    "呼吸一直都在，随时可以从这里重新开始。",
    "让这几分钟没有任务，只是完整地属于你。",
  ];

  const stableHash = (value) => {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const publicMessage = pureMessages[stableHash(`public:${today}`) % pureMessages.length];
  if (dailyMessage) dailyMessage.textContent = publicMessage;
  lastDailyMessage = publicMessage;

  const safeStorage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (_error) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (_error) {
        // 隐私模式下仍允许本次会话继续使用。
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (_error) {
        // 同上。
      }
    },
  };

  syncToken = safeStorage.get(tokenKey) || "";

  const apiRequest = async (path, options = {}, token = syncToken) => {
    if (!apiUrl) {
      const error = new Error("同步接口尚未发布");
      error.status = 0;
      throw error;
    }
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
    let payload = {};
    try {
      payload = await response.json();
    } catch (_error) {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.error || "同步失败，请稍后重试");
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value);
  };

  const renderGoals = (stats) => {
    const container = document.querySelector("[data-goal-progress]");
    if (!container) return;
    container.replaceChildren();
    const goals = [
      stats.weekly_goal_count
        ? { label: "次数", current: stats.week_sessions, goal: stats.weekly_goal_count, unit: "次" }
        : null,
      stats.weekly_goal_minutes
        ? { label: "时长", current: stats.week_minutes, goal: stats.weekly_goal_minutes, unit: "分钟" }
        : null,
    ].filter(Boolean);
    if (!goals.length) {
      const empty = document.createElement("p");
      empty.className = "goal-empty";
      empty.textContent = "还没有设置周目标。按自己的节奏也很好；想设置时直接在对话里告诉我。";
      container.append(empty);
      return;
    }
    goals.forEach((goal) => {
      const row = document.createElement("div");
      row.className = "goal-row";
      const label = document.createElement("div");
      label.className = "goal-label";
      const name = document.createElement("span");
      name.textContent = goal.label;
      const value = document.createElement("strong");
      value.textContent = `${goal.current} / ${goal.goal} ${goal.unit}`;
      label.append(name, value);
      const track = document.createElement("div");
      track.className = "goal-track";
      const fill = document.createElement("span");
      fill.style.width = `${Math.min(100, Math.round((goal.current / goal.goal) * 100))}%`;
      track.append(fill);
      row.append(label, track);
      container.append(row);
    });
  };

  const renderHeatmap = (stats) => {
    const container = document.querySelector("[data-meditation-heatmap]");
    if (!container) return;
    container.replaceChildren();
    stats.daily.forEach((entry) => {
      const cell = document.createElement("span");
      const minutes = Number(entry.minutes) || 0;
      const level = minutes === 0 ? 0 : minutes <= 30 ? 1 : minutes <= 60 ? 2 : minutes <= 90 ? 3 : 4;
      cell.className = "heatmap-cell";
      cell.dataset.level = String(level);
      if (entry.date === stats.as_of) cell.classList.add("is-today");
      cell.title = `${entry.date}：${entry.sessions} 次，${minutes} 分钟`;
      cell.setAttribute("aria-label", cell.title);
      container.append(cell);
    });
  };

  const formatRecordTime = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return value;
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  };

  const renderRecent = (stats) => {
    const container = document.querySelector("[data-meditation-recent]");
    if (!container) return;
    container.replaceChildren();
    if (!stats.recent.length) {
      const empty = document.createElement("p");
      empty.className = "recent-empty";
      empty.textContent = "第一条记录会从这里开始。";
      container.append(empty);
      return;
    }
    stats.recent.slice(0, 5).forEach((entry) => {
      const row = document.createElement("div");
      row.className = "recent-entry";
      const time = document.createElement("time");
      time.dateTime = entry.occurred_at;
      time.textContent = formatRecordTime(entry.occurred_at);
      const duration = document.createElement("strong");
      duration.textContent = `${entry.duration_minutes} 分钟`;
      row.append(time, duration);
      container.append(row);
    });
  };

  const renderStats = (stats, message = lastDailyMessage, stale = false) => {
    if (!stats) return;
    setText("[data-stat-week-sessions]", stats.week_sessions);
    setText("[data-stat-week-minutes]", stats.week_minutes);
    setText("[data-stat-streak]", stats.current_streak);
    setText("[data-stat-total-sessions]", stats.total_sessions);
    setText("[data-hero-week-minutes]", stats.week_minutes);
    renderGoals(stats);
    renderHeatmap(stats);
    renderRecent(stats);
    if (message) {
      lastDailyMessage = message;
      if (dailyMessage) dailyMessage.textContent = message;
    }
    if (locked) locked.hidden = true;
    if (dashboard) dashboard.hidden = false;
    if (syncState) syncState.textContent = stale ? "显示上次同步数据 · 等待重新连接" : "已连接私人统计";
    safeStorage.set(cacheKey, JSON.stringify({ stats, daily_message: lastDailyMessage }));
  };

  const showLocked = (message = "私人统计尚未连接") => {
    if (locked) locked.hidden = false;
    if (dashboard) dashboard.hidden = true;
    setText("[data-hero-week-minutes]", "—");
    if (syncState) syncState.textContent = message;
  };

  const loadCachedStats = () => {
    try {
      return JSON.parse(safeStorage.get(cacheKey) || "null");
    } catch (_error) {
      return null;
    }
  };

  const cached = loadCachedStats();
  if (cached?.stats && syncToken) renderStats(cached.stats, cached.daily_message, true);
  else showLocked();

  const loadStats = async (token = syncToken) => {
    const payload = await apiRequest(`/api/meditation?as_of=${encodeURIComponent(today)}`, {}, token);
    renderStats(payload.stats, payload.daily_message);
    return payload;
  };

  const showStep = (name) => {
    steps.forEach((step) => {
      step.hidden = step.dataset.meditationStep !== name;
    });
  };

  const openModal = (preferredStep = "") => {
    if (!modal) return;
    returnFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    if (feedback) feedback.textContent = "";
    if (fallback) fallback.hidden = true;
    customForm?.setAttribute("hidden", "");
    const step = preferredStep || (syncToken && apiUrl ? "duration" : "connect");
    showStep(step);
    window.setTimeout(() => {
      const focusTarget = modal.querySelector(`[data-meditation-step="${step}"] button, [data-meditation-step="${step}"] input`);
      focusTarget?.focus();
    }, 0);
  };

  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    returnFocus?.focus?.();
  };

  document.querySelectorAll("[data-open-meditation]").forEach((button) => {
    button.addEventListener("click", () => openModal());
  });
  document.querySelector("[data-connect-meditation]")?.addEventListener("click", () => openModal("connect"));
  document.querySelector("[data-close-meditation]")?.addEventListener("click", closeModal);
  document.querySelector("[data-finish-meditation]")?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  document.querySelector("[data-meditation-connect-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("[data-meditation-token]");
    const connectFeedback = document.querySelector("[data-connect-feedback]");
    const candidate = input?.value.trim() || "";
    if (!apiUrl) {
      if (connectFeedback) connectFeedback.textContent = "同步接口还没有发布，完成部署后即可连接。";
      return;
    }
    if (!candidate) return;
    if (connectFeedback) connectFeedback.textContent = "正在核对口令……";
    try {
      await loadStats(candidate);
      syncToken = candidate;
      safeStorage.set(tokenKey, candidate);
      if (input) input.value = "";
      if (connectFeedback) connectFeedback.textContent = "";
      showStep("duration");
      modal?.querySelector("[data-duration]")?.focus();
    } catch (error) {
      if (connectFeedback) connectFeedback.textContent = error.status === 401 ? "口令不对，请重新输入。" : error.message;
    }
  });

  const idempotencyKey = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const fallbackUrl = (pending) => {
    const body = [
      "> 来自日常看板的私人打坐回执。",
      "",
      `- 打坐 ${pending.duration_minutes} 分钟`,
      "",
      "## 机器可读",
      "```text",
      "activity_receipt_v1",
      "activity_id\tA0001",
      `date\t${pending.occurred_on}`,
      `duration_minutes\t${pending.duration_minutes}`,
      `record_id\tR${pending.idempotency_key}`,
      "```",
    ].join("\n");
    const target = new URL(`https://github.com/${repository}/issues/new`);
    target.searchParams.set("title", `[网站回执] ${pending.occurred_on} 打坐 ${pending.duration_minutes} 分钟`);
    target.searchParams.set("body", body);
    target.searchParams.set("labels", "网站回执");
    return target.toString();
  };

  const savePending = (pending) => {
    safeStorage.set(pendingKey, JSON.stringify(pending));
    if (fallback) {
      fallback.href = fallbackUrl(pending);
      fallback.hidden = true;
    }
  };

  const clearPending = () => safeStorage.remove(pendingKey);

  const applyRecordResult = (result, minutes) => {
    lastRecordId = result.record_id;
    renderStats(result.stats, lastDailyMessage);
    setText("[data-success-title]", `已记录 ${minutes} 分钟`);
    setText("[data-completion-message]", result.encouragement);
    setText(
      "[data-success-summary]",
      `本周 ${result.stats.week_sessions} 次 · ${result.stats.week_minutes} 分钟；累计 ${result.stats.total_sessions} 次`,
    );
    const undo = document.querySelector("[data-undo-meditation]");
    if (undo) undo.hidden = false;
    setText("[data-success-feedback]", "");
    showStep("success");
  };

  const submitRecord = async (minutes, occurredOn = today) => {
    const pending = {
      duration_minutes: Number(minutes),
      occurred_on: occurredOn,
      idempotency_key: idempotencyKey(),
    };
    savePending(pending);
    showStep("saving");
    try {
      const result = await apiRequest("/api/meditation", {
        method: "POST",
        body: JSON.stringify(pending),
      });
      clearPending();
      applyRecordResult(result, pending.duration_minutes);
    } catch (error) {
      if (error.status === 401) {
        syncToken = "";
        safeStorage.remove(tokenKey);
        showStep("connect");
        setText("[data-connect-feedback]", "同步口令已失效，请重新连接。刚才的记录仍在这台设备等待同步。");
        return;
      }
      showStep("duration");
      if (feedback) feedback.textContent = "暂时没能同步，记录已保存在这台设备；联网后会自动重试。";
      if (fallback) {
        fallback.href = fallbackUrl(pending);
        fallback.hidden = false;
      }
    }
  };

  document.querySelectorAll("[data-duration]").forEach((button) => {
    button.addEventListener("click", () => submitRecord(Number(button.dataset.duration)));
  });
  document.querySelector("[data-custom-duration-toggle]")?.addEventListener("click", () => {
    if (!customForm) return;
    customForm.hidden = !customForm.hidden;
    if (!customForm.hidden) document.querySelector("[data-custom-minutes]")?.focus();
  });
  customForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const minutes = Number(document.querySelector("[data-custom-minutes]")?.value);
    const occurredOn = dateInput?.value || today;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      if (feedback) feedback.textContent = "请输入 1–1440 之间的分钟数。";
      return;
    }
    submitRecord(minutes, occurredOn);
  });

  document.querySelector("[data-undo-meditation]")?.addEventListener("click", async (event) => {
    if (!lastRecordId) return;
    const button = event.currentTarget;
    button.disabled = true;
    setText("[data-success-feedback]", "正在撤销……");
    try {
      const result = await apiRequest(`/api/meditation/records/${encodeURIComponent(lastRecordId)}`, { method: "DELETE" });
      renderStats(result.stats, lastDailyMessage);
      setText("[data-success-title]", "刚才的记录已撤销");
      setText("[data-completion-message]", "没关系，当前统计已经恢复。需要时可以重新记录。 ");
      setText("[data-success-summary]", `本周 ${result.stats.week_sessions} 次 · ${result.stats.week_minutes} 分钟`);
      setText("[data-success-feedback]", "");
      button.hidden = true;
      lastRecordId = "";
    } catch (error) {
      setText("[data-success-feedback]", error.message);
    } finally {
      button.disabled = false;
    }
  });

  const retryPending = async () => {
    if (!syncToken || !apiUrl || !navigator.onLine) return;
    let pending;
    try {
      pending = JSON.parse(safeStorage.get(pendingKey) || "null");
    } catch (_error) {
      return;
    }
    if (!pending) return;
    try {
      const result = await apiRequest("/api/meditation", {
        method: "POST",
        body: JSON.stringify(pending),
      });
      clearPending();
      renderStats(result.stats, lastDailyMessage);
      if (syncState) syncState.textContent = "暂存的打坐记录已同步";
    } catch (error) {
      if (error.status === 401) {
        syncToken = "";
        safeStorage.remove(tokenKey);
        showLocked("同步口令已失效，请重新连接");
      }
    }
  };

  if (syncToken && apiUrl) {
    loadStats()
      .then(retryPending)
      .catch((error) => {
        if (error.status === 401) {
          syncToken = "";
          safeStorage.remove(tokenKey);
          showLocked("同步口令已失效，请重新连接");
        } else if (cached?.stats) {
          renderStats(cached.stats, cached.daily_message, true);
        } else {
          showLocked("暂时无法读取私人统计");
        }
      });
  }
  window.addEventListener("online", retryPending);
}
