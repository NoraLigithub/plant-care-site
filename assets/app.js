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
  const connectButton = receiptForm.querySelector("[data-connect-care]");
  const submitButton = receiptForm.querySelector("[data-submit-care]");
  const apiUrl = document.body.dataset.apiUrl || "";
  const tokenKey = "meditation-sync-token";
  const defaultDate = receiptForm.dataset.defaultDate;
  const storageKey = `plant-care-receipt:${defaultDate}`;
  const pendingKey = `plant-care-pending:${defaultDate}`;
  const syncedTasks = new Set();

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

  const taskKey = (input) => [
    input.dataset.careKind,
    input.dataset.careId,
    input.dataset.careAction,
  ].join(":");

  const selectedTasks = () => taskInputs.filter((input) => input.checked);
  const pendingTasks = () => selectedTasks().filter(
    (input) => !syncedTasks.has(taskKey(input)),
  );

  const pendingReceipts = () => {
    try {
      const parsed = JSON.parse(safeStorage.get(pendingKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const savePendingReceipts = (receipts) => {
    if (receipts.length) safeStorage.set(pendingKey, JSON.stringify(receipts));
    else safeStorage.remove(pendingKey);
  };

  const updateCardState = (input) => {
    const card = input.closest(".task-card");
    const isSynced = syncedTasks.has(taskKey(input));
    if (isSynced) input.checked = true;
    input.disabled = isSynced;
    if (card) {
      card.classList.toggle("is-complete", input.checked);
      card.classList.toggle("is-receipted", isSynced);
    }
    const state = input.closest(".task-check")?.querySelector("[data-task-state]");
    if (state) {
      state.textContent = isSynced ? "已记录" : input.checked ? "已完成" : "完成";
    }
  };

  const updateSummary = () => {
    const selected = selectedTasks();
    const pending = pendingTasks();
    if (summary) {
      if (!taskInputs.length) {
        summary.textContent = "今天没有预设任务，可以直接写文字补充";
      } else if (!selected.length) {
        summary.textContent = `0 / ${taskInputs.length} 项已完成`;
      } else if (pending.length) {
        summary.textContent = `${selected.length} / ${taskInputs.length} 项已完成 · ${pending.length} 项待提交`;
      } else {
        summary.textContent = `${selected.length} / ${taskInputs.length} 项已完成 · 已存云端`;
      }
    }
    taskInputs.forEach(updateCardState);
  };

  const saveDraft = () => {
    const draft = {
      date: dateInput?.value || defaultDate,
      note: noteInput?.value || "",
      tasks: selectedTasks().map(taskKey),
      synced: [...syncedTasks],
    };
    safeStorage.set(storageKey, JSON.stringify(draft));
  };

  try {
    const draft = JSON.parse(safeStorage.get(storageKey) || "null");
    if (draft) {
      if (dateInput && draft.date) dateInput.value = draft.date;
      if (noteInput && draft.note) noteInput.value = draft.note;
      const savedTasks = new Set(draft.tasks || []);
      for (const key of draft.synced || []) syncedTasks.add(key);
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
      if (status) status.textContent = "";
    });
  });
  dateInput?.addEventListener("change", () => {
    syncedTasks.clear();
    taskInputs.forEach((input) => {
      input.disabled = false;
    });
    saveDraft();
    if (status) status.textContent = "";
    refreshCompleted();
  });
  noteInput?.addEventListener("input", () => {
    saveDraft();
  });

  clearButton?.addEventListener("click", () => {
    taskInputs.forEach((input) => {
      if (!syncedTasks.has(taskKey(input))) input.checked = false;
    });
    if (noteInput) noteInput.value = "";
    if (dateInput) dateInput.value = defaultDate;
    savePendingReceipts([]);
    if (status) status.textContent = "未提交内容已清除；云端完成记录保留。";
    saveDraft();
    updateSummary();
  });

  const idempotencyKey = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const careRequest = async (path, options = {}, token = safeStorage.get(tokenKey) || "") => {
    if (!apiUrl) {
      const error = new Error("私人同步接口尚未发布");
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

  const applyCompletedKeys = (keys) => {
    for (const key of keys || []) syncedTasks.add(key);
    taskInputs.forEach((input) => {
      if (syncedTasks.has(taskKey(input))) input.checked = true;
    });
    saveDraft();
    updateSummary();
  };

  const syncReceipt = async (receipt) => {
    const result = await careRequest("/api/care", {
      method: "POST",
      body: JSON.stringify(receipt),
    });
    applyCompletedKeys(result.completed_keys);
    return result;
  };

  const removePending = (key) => {
    savePendingReceipts(
      pendingReceipts().filter((receipt) => receipt.idempotency_key !== key),
    );
  };

  const retryPending = async () => {
    if (!apiUrl || !safeStorage.get(tokenKey) || !navigator.onLine) return;
    const receipts = pendingReceipts();
    for (const receipt of receipts) {
      try {
        await syncReceipt(receipt);
        removePending(receipt.idempotency_key);
      } catch (error) {
        if (error.status === 401 && connectButton) connectButton.hidden = false;
        return;
      }
    }
    if (receipts.length) {
      const savedNotes = new Set(receipts.map((receipt) => receipt.note).filter(Boolean));
      if (noteInput && savedNotes.has(noteInput.value.trim())) noteInput.value = "";
      saveDraft();
      if (status) status.textContent = "本机暂存记录已同步到 Cloudflare。";
    }
  };

  const refreshCompleted = async () => {
    if (!apiUrl || !safeStorage.get(tokenKey)) {
      if (connectButton) connectButton.hidden = false;
      return;
    }
    try {
      const operationDate = dateInput?.value || defaultDate;
      const result = await careRequest(`/api/care?date=${encodeURIComponent(operationDate)}`);
      applyCompletedKeys(result.completed_keys);
      if (connectButton) connectButton.hidden = true;
    } catch (error) {
      if (error.status === 401 && connectButton) connectButton.hidden = false;
    }
  };

  connectButton?.addEventListener("click", () => {
    document.querySelector("[data-connect-private]")?.click();
  });

  receiptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = pendingTasks();
    const note = noteInput?.value.trim() || "";
    const careDate = dateInput?.value || defaultDate;

    if (!selected.length && !note) {
      if (status) {
        status.textContent = selectedTasks().length
          ? "已完成项目都记录过了；可以再勾选新项目或写一句补充。"
          : "请至少完成一项，或者写一句补充。";
      }
      if (!selectedTasks().length) noteInput?.focus();
      return;
    }

    const receipt = {
      operation_date: careDate,
      idempotency_key: idempotencyKey(),
      actions: selected.map((input) => ({
        kind: input.dataset.careKind,
        entity_id: input.dataset.careId,
        name: input.dataset.careName,
        action: input.dataset.careAction,
      })),
      note,
    };
    savePendingReceipts([...pendingReceipts(), receipt]);
    if (submitButton) submitButton.disabled = true;
    if (status) status.textContent = "正在保存到 Cloudflare……";
    try {
      const result = await syncReceipt(receipt);
      removePending(receipt.idempotency_key);
      if (noteInput) noteInput.value = "";
      saveDraft();
      if (connectButton) connectButton.hidden = true;
      if (status) status.textContent = result.backup_pending
        ? "已保存到 Cloudflare；私仓备份稍后自动补上。"
        : selected.length
          ? `已保存 ${selected.length} 个新增完成项目。`
          : "文字补充已保存。";
    } catch (error) {
      if (error.status === 401 && connectButton) connectButton.hidden = false;
      if (status) status.textContent = error.status === 401
        ? "请先连接私人同步；本次内容仍保存在这台设备。"
        : "暂时没能写入云端，内容已保存在本机，联网后会自动重试。";
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  document.addEventListener("private-sync-connected", () => {
    if (connectButton) connectButton.hidden = true;
    retryPending().then(refreshCompleted);
  });
  window.addEventListener("online", retryPending);
  if (dateInput) dateInput.max = defaultDate;
  updateSummary();
  retryPending().then(refreshCompleted);
}
