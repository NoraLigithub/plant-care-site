const dailyApp = document.querySelector("[data-daily-app]");

if (dailyApp) {
  const apiUrl = dailyApp.dataset.apiUrl || "";
  const privateSiteUrl = apiUrl ? `${apiUrl}/` : "";
  const isPrivateSite = Boolean(
    apiUrl && new URL(apiUrl, window.location.href).origin === window.location.origin,
  );
  const cacheKey = "daily-activity-stats-cache";
  const pendingKey = "daily-activity-pending";
  const modal = document.querySelector("[data-activity-modal]");
  const steps = [...document.querySelectorAll("[data-activity-step]")];
  const panels = [...document.querySelectorAll("[data-activity-panel]")];
  const locked = document.querySelector("[data-activity-locked]");
  const dashboard = document.querySelector("[data-activity-dashboard]");
  const dailyMessage = document.querySelector("[data-daily-message]");
  const syncState = document.querySelector("[data-sync-state]");
  const activitySaveState = document.querySelector("[data-activity-save-state]");
  const feedback = document.querySelector("[data-activity-feedback]");
  const modalClose = document.querySelector("[data-close-activity]");
  const customForm = document.querySelector("[data-custom-duration]");
  const today = localLifeDate();
  let selectedActivityId = "A0001";
  let lastRecordId = "";
  let lastRecordActivityId = "";
  let returnFocus = null;
  let activityEntries = [];

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
        // 隐私模式下仍允许当前页面继续使用。
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

  const publicMessage = pureMessages[stableHash(`public:${today}`) % pureMessages.length];
  if (dailyMessage) dailyMessage.textContent = publicMessage;
  document.querySelectorAll("[data-activity-date]").forEach((input) => {
    input.value = today;
    input.max = today;
  });
  const apiRequest = async (path, options = {}) => {
    if (!apiUrl) {
      const error = new Error("记录功能尚未准备好");
      error.status = 0;
      throw error;
    }
    await (window.privateSessionReady || Promise.resolve(false));
    const headers = { ...(options.headers || {}) };
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      credentials: "same-origin",
      headers,
    });
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

  const setText = (selector, value, root = document) => {
    const element = root.querySelector(selector);
    if (element) element.textContent = String(value);
  };

  const formatCount = (value) => {
    const count = Number(value) || 0;
    if (count >= 10000 && count % 10000 === 0) return `${count / 10000} 万`;
    return new Intl.NumberFormat("zh-CN").format(count);
  };

  const historyDate = (occurredAt) => {
    const parsed = new Date(occurredAt);
    if (Number.isNaN(parsed.valueOf())) return "日期待确认";
    const date = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(parsed);
    const weekday = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      weekday: "short",
    }).format(parsed);
    return `${date} · ${weekday}`;
  };

  const renderHistory = (card, stats) => {
    const history = document.querySelector(`[data-activity-history="${stats.activity_id}"]`);
    if (!history) return;
    const list = history.querySelector("[data-history-list]");
    const total = history.querySelector("[data-history-total]");
    const footnote = history.querySelector("[data-history-footnote]");
    const state = card.querySelector("[data-record-state]");
    const isMeditation = stats.metric_type === "duration";
    if (state) {
      state.classList.toggle("is-recorded", stats.today_sessions > 0);
      const stateText = state.querySelector("strong");
      if (stateText) {
        stateText.textContent = stats.today_sessions > 0
          ? isMeditation
            ? `✓ 已记录 ${stats.today_value} 分钟 · ${stats.today_sessions} 次`
            : `✓ 已记录 ${formatCount(stats.today_value)} 次 · ${stats.today_duration_minutes} 分钟`
          : "还没有记录";
      }
    }
    if (total) {
      total.textContent = isMeditation
        ? `共 ${stats.total_sessions} 次 · ${stats.total_value} 分钟`
        : `共 ${stats.total_sessions} 回 · ${formatCount(stats.total_value)} 次 · ${stats.total_duration_minutes} 分钟`;
    }
    if (!list) return;
    list.replaceChildren();
    if (!stats.recent.length) {
      const empty = document.createElement("li");
      empty.className = "history-empty";
      empty.textContent = "还没有历史记录；第一次保存后会出现在这里。";
      list.append(empty);
      if (footnote) footnote.textContent = "";
      return;
    }
    stats.recent.forEach((record) => {
      const item = document.createElement("li");
      const date = document.createElement("time");
      const value = document.createElement("strong");
      const saved = document.createElement("span");
      date.dateTime = record.occurred_at;
      date.textContent = historyDate(record.occurred_at);
      value.textContent = isMeditation
        ? `${record.value} 分钟`
        : `${formatCount(record.value)} 次 · ${record.duration_minutes || 0} 分钟`;
      saved.textContent = "已保存";
      item.append(date, value, saved);
      list.append(item);
    });
    if (footnote) {
      footnote.textContent = stats.total_sessions > stats.recent.length
        ? `显示最近 ${stats.recent.length} 条；历史累计 ${stats.total_sessions} 条。`
        : `已显示全部 ${stats.total_sessions} 条记录。`;
    }
  };

  const renderMilestone = (card, stats) => {
    const milestone = stats.milestone;
    const panel = card.querySelector("[data-chanting-milestone]");
    if (!panel || !milestone) return;
    const progress = panel.querySelector("[data-milestone-progress]");
    if (progress) progress.value = milestone.progress_percent;
    if (milestone.next) {
      setText("[data-milestone-next]", `${formatCount(milestone.next)} 次`, panel);
      setText(
        "[data-milestone-detail]",
        `累计 ${formatCount(stats.total_value)} 次，还差 ${formatCount(milestone.remaining)} 次。`,
        panel,
      );
    } else {
      setText("[data-milestone-next]", "100 万次已达成", panel);
      setText("[data-milestone-detail]", `累计 ${formatCount(stats.total_value)} 次，继续按自己的节律。`, panel);
    }
  };

  const renderHeatmap = (container, stats) => {
    if (!container) return;
    container.replaceChildren();
    stats.daily.forEach((entry) => {
      const cell = document.createElement("span");
      const value = Number(entry.value) || 0;
      const level = value === 0 ? 0 : value <= 1 ? 1 : value <= 30 ? 2 : value <= 60 ? 3 : 4;
      cell.className = "heatmap-cell";
      cell.dataset.level = String(level);
      if (entry.date === stats.as_of) cell.classList.add("is-today");
      const detail = stats.metric_type === "duration"
        ? `${entry.sessions} 次，${value} 分钟`
        : `${value} 次，${entry.duration_minutes || 0} 分钟`;
      cell.title = `${entry.date}：${detail}`;
      cell.setAttribute("aria-label", cell.title);
      container.append(cell);
    });
  };

  const renderActivity = (entry) => {
    const { activity, stats } = entry;
    const card = document.querySelector(`[data-activity-card="${activity.activity_id}"]`);
    if (!card) return;
    setText('[data-stat="today-value"]', stats.today_value, card);
    setText('[data-stat="today-sessions"]', stats.today_sessions, card);
    setText('[data-stat="week-value"]', stats.week_value, card);
    setText('[data-stat="week-sessions"]', stats.week_sessions, card);
    setText('[data-stat="week-duration"]', stats.week_duration_minutes ?? 0, card);
    setText('[data-stat="streak"]', stats.current_streak, card);
    setText('[data-stat="total-sessions"]', stats.total_sessions, card);
    setText('[data-stat="total-value"]', stats.total_value ?? 0, card);
    renderHeatmap(card.querySelector("[data-activity-heatmap]"), stats);
    renderHistory(card, stats);
    renderMilestone(card, stats);
  };

  const scrollToHistory = () => {
    if (window.location.hash !== "#history") return;
    window.requestAnimationFrame(() => {
      const history = document.querySelector("#history");
      history?.scrollIntoView({ block: "start" });
    });
  };

  const renderActivities = (entries, message = "", stale = false) => {
    activityEntries = entries;
    entries.forEach(renderActivity);
    const meditation = entries.find((entry) => entry.activity.activity_id === "A0001");
    const chanting = entries.find((entry) => entry.activity.activity_id === "A0002");
    setText("[data-hero-meditation]", meditation?.stats.week_value ?? 0);
    setText("[data-hero-chanting]", chanting?.stats.week_value ?? 0);
    if (message && dailyMessage) dailyMessage.textContent = message;
    if (locked) locked.hidden = true;
    if (dashboard) dashboard.hidden = false;
    scrollToHistory();
    if (syncState) syncState.textContent = stale
      ? "显示上次保存的数据 · 等待网络恢复"
      : "记录已自动保存";
    safeStorage.set(cacheKey, JSON.stringify({ activities: entries, daily_message: message || publicMessage }));
  };

  const showLocked = (message = "这里暂时只供查看") => {
    if (locked) locked.hidden = false;
    if (dashboard) dashboard.hidden = true;
    setText("[data-hero-meditation]", "—");
    setText("[data-hero-chanting]", "—");
    if (syncState) syncState.textContent = message;
  };

  const loadCache = () => {
    try {
      return JSON.parse(safeStorage.get(cacheKey) || "null");
    } catch (_error) {
      return null;
    }
  };

  const cached = loadCache();
  if (isPrivateSite && cached?.activities) renderActivities(cached.activities, cached.daily_message, true);
  else if (!isPrivateSite) showLocked();

  const loadActivities = async () => {
    const payload = await apiRequest(`/api/activities?as_of=${encodeURIComponent(today)}`);
    const meditation = payload.activities.find((entry) => entry.activity.activity_id === "A0001");
    renderActivities(payload.activities, meditation?.daily_message || publicMessage);
    return payload;
  };

  const showStep = (name) => {
    if (modal) modal.dataset.activityState = name;
    if (modalClose) modalClose.hidden = name === "saving";
    steps.forEach((step) => {
      step.hidden = step.dataset.activityStep !== name;
    });
  };

  const showActivityPanel = (activityId) => {
    selectedActivityId = activityId;
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.activityPanel !== activityId;
    });
    if (feedback) feedback.textContent = "";
    customForm?.setAttribute("hidden", "");
  };

  const openModal = (activityId = selectedActivityId) => {
    if (!isPrivateSite) {
      if (privateSiteUrl) window.location.assign(`${privateSiteUrl}#rituals`);
      return;
    }
    if (!modal) return;
    selectedActivityId = activityId;
    returnFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    showActivityPanel(activityId);
    showStep("record");
    window.setTimeout(() => {
      const target = modal.querySelector(
        '[data-activity-step="record"] button:not([hidden]), [data-activity-step="record"] input:not([hidden])',
      );
      target?.focus();
    }, 0);
  };

  const closeModal = () => {
    if (!modal) return;
    if (modal.dataset.activityState === "saving") return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    returnFocus?.focus?.();
  };

  document.querySelectorAll("[data-open-activity]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openActivity));
  });
  modalClose?.addEventListener("click", closeModal);
  document.querySelector("[data-finish-activity]")?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  const idempotencyKey = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const pendingRecords = () => {
    try {
      const parsed = JSON.parse(safeStorage.get(pendingKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const savePending = (records) => {
    if (records.length) safeStorage.set(pendingKey, JSON.stringify(records));
    else safeStorage.remove(pendingKey);
  };

  const activityName = (activityId) => activityId === "A0002" ? "读咒" : "打坐";

  const applyRecordResult = (result) => {
    lastRecordId = result.record_id;
    lastRecordActivityId = result.activity.activity_id;
    const existing = activityEntries.find((entry) => entry.activity.activity_id === result.activity.activity_id);
    if (existing) existing.stats = result.stats;
    renderActivities(activityEntries, dailyMessage?.textContent || publicMessage);
    const latest = result.stats.recent[0] || {};
    const valueLabel = result.activity.metric_type === "duration"
      ? `${latest.value || 0} ${result.activity.metric_unit}`
      : `${formatCount(latest.value)} 次`;
    if (activitySaveState) {
      activitySaveState.textContent = `✓ 已保存：${activityName(result.activity.activity_id)} ${valueLabel}`;
      activitySaveState.hidden = false;
    }
    setText("[data-success-title]", `已记录${activityName(result.activity.activity_id)} ${valueLabel}`);
    setText("[data-completion-message]", result.encouragement);
    const summary = result.activity.metric_type === "duration"
      ? `本周 ${result.stats.week_sessions} 次 · ${result.stats.week_value} 分钟；累计 ${result.stats.total_sessions} 次`
      : `本次 ${latest.duration_minutes || 0} 分钟 · ${formatCount(latest.value)} 次；累计 ${formatCount(result.stats.total_value)} 次 · ${result.stats.total_duration_minutes} 分钟`;
    setText("[data-success-summary]", summary);
    setText(
      "[data-success-feedback]",
      result.backup_pending ? "已经保存，备份稍后自动完成。" : "",
    );
    const undo = document.querySelector("[data-undo-activity]");
    if (undo) undo.hidden = false;
    showStep("success");
  };

  const submitRecord = async (activityId, value, occurredOn = today, durationMinutes = 0) => {
    const pending = {
      activity_id: activityId,
      value: Number(value),
      duration_minutes: Number(durationMinutes) || undefined,
      occurred_on: occurredOn,
      idempotency_key: idempotencyKey(),
    };
    savePending([...pendingRecords(), pending]);
    showStep("saving");
    try {
      const result = await apiRequest(`/api/activities/${activityId}/records`, {
        method: "POST",
        body: JSON.stringify(pending),
      });
      savePending(pendingRecords().filter((item) => item.idempotency_key !== pending.idempotency_key));
      applyRecordResult(result);
    } catch (error) {
      if (error.status === 401) {
        showActivityPanel(activityId);
        showStep("record");
        if (feedback) feedback.textContent = "记录功能暂时不可用，请告诉 Agent 帮你恢复。刚才的记录仍在这台设备等待保存。";
        return;
      }
      showActivityPanel(activityId);
      showStep("record");
      if (feedback) feedback.textContent = "暂时没能同步，记录已保存在这台设备；联网后会自动重试。";
    }
  };

  document.querySelectorAll("[data-duration]").forEach((button) => {
    button.addEventListener("click", () => submitRecord("A0001", Number(button.dataset.duration)));
  });
  document.querySelector("[data-custom-duration-toggle]")?.addEventListener("click", () => {
    if (!customForm) return;
    customForm.hidden = !customForm.hidden;
    if (!customForm.hidden) document.querySelector("[data-custom-minutes]")?.focus();
  });
  customForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const minutes = Number(document.querySelector("[data-custom-minutes]")?.value);
    const occurredOn = document.querySelector('[data-activity-date="A0001"]')?.value || today;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      if (feedback) feedback.textContent = "请输入 1–1440 之间的分钟数。";
      return;
    }
    submitRecord("A0001", minutes, occurredOn);
  });
  document.querySelector("[data-chanting-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const occurredOn = document.querySelector('[data-activity-date="A0002"]')?.value || today;
    const chanting = activityEntries.find((entry) => entry.activity.activity_id === "A0002")?.activity || {};
    submitRecord(
      "A0002",
      Number(chanting.default_value) || 600,
      occurredOn,
      Number(chanting.default_duration_minutes) || 20,
    );
  });

  document.querySelector("[data-undo-activity]")?.addEventListener("click", async (event) => {
    if (!lastRecordId) return;
    const button = event.currentTarget;
    button.disabled = true;
    setText("[data-success-feedback]", "正在撤销……");
    try {
      const result = await apiRequest(`/api/activities/records/${encodeURIComponent(lastRecordId)}`, { method: "DELETE" });
      const existing = activityEntries.find((entry) => entry.activity.activity_id === lastRecordActivityId);
      if (existing) existing.stats = result.stats;
      renderActivities(activityEntries, dailyMessage?.textContent || publicMessage);
      setText("[data-success-title]", "刚才的记录已撤销");
      setText("[data-completion-message]", "没关系，当前统计已经恢复。需要时可以重新记录。");
      setText("[data-success-summary]", `本周 ${result.stats.week_sessions} 次`);
      setText("[data-success-feedback]", "");
      if (activitySaveState) {
        activitySaveState.textContent = "刚才的记录已撤销";
        activitySaveState.hidden = false;
      }
      button.hidden = true;
      lastRecordId = "";
      lastRecordActivityId = "";
    } catch (error) {
      setText("[data-success-feedback]", error.message);
    } finally {
      button.disabled = false;
    }
  });

  const retryPending = async () => {
    if (!isPrivateSite || !apiUrl || !navigator.onLine) return;
    for (const pending of pendingRecords()) {
      try {
        const activity = activityEntries.find((entry) => entry.activity.activity_id === pending.activity_id)?.activity || {};
        const normalizedPending = pending.activity_id === "A0002" && (!pending.duration_minutes || Number(pending.value) === 1)
          ? {
              ...pending,
              value: Number(activity.default_value) || 600,
              duration_minutes: Number(activity.default_duration_minutes) || 20,
            }
          : pending;
        await apiRequest(`/api/activities/${pending.activity_id}/records`, {
          method: "POST",
          body: JSON.stringify(normalizedPending),
        });
        savePending(pendingRecords().filter((item) => item.idempotency_key !== pending.idempotency_key));
      } catch (error) {
        if (error.status === 401) {
          showLocked("记录功能暂时不可用，请告诉 Agent 帮你恢复");
        }
        return;
      }
    }
    await loadActivities();
  };

  if (isPrivateSite && apiUrl) {
    (window.privateSessionReady || Promise.resolve(false)).then(() => loadActivities())
      .then(retryPending)
      .catch((error) => {
        if (error.status === 401) {
          showLocked("记录功能暂时不可用，请告诉 Agent 帮你恢复");
        } else if (cached?.activities) {
          renderActivities(cached.activities, cached.daily_message, true);
        } else {
          showLocked("暂时无法读取我的记录");
        }
      });
  } else if (syncState) syncState.textContent = "这里暂时只供查看 · 去日常花园记录";
  window.addEventListener("online", retryPending);
}
