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

const privateApiUrl = document.body.dataset.apiUrl || "";
const isPrivateCareSite = Boolean(
  privateApiUrl
  && new URL(privateApiUrl, window.location.href).origin === window.location.origin,
);
window.privateSessionReady = Promise.resolve(false);
if (isPrivateCareSite) {
  const connection = new URLSearchParams(window.location.hash.slice(1));
  const connectionToken = connection.get("connect");
  if (connectionToken) {
    const nextSection = ["rituals", "today"].includes(connection.get("next"))
      ? `#${connection.get("next")}`
      : "";
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}${nextSection}`);
    window.privateSessionReady = fetch(`${privateApiUrl}/api/session`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${connectionToken}` },
    }).then((response) => {
      if (!response.ok) throw new Error("设备连接失败");
      return true;
    }).catch(() => false);
  }
}
const receiptForm = document.querySelector("[data-care-receipt]");
const privateCareLink = document.querySelector("[data-care-private-link]");

if (receiptForm && !isPrivateCareSite) {
  receiptForm.hidden = true;
  if (privateCareLink) privateCareLink.hidden = false;
  document.querySelectorAll("[data-care-task], [data-care-group-checkbox]").forEach((input) => {
    input.disabled = true;
    const state = input.closest(".task-check")?.querySelector("[data-task-state]");
    if (state) state.textContent = "私人页记录";
  });
}

if (receiptForm && isPrivateCareSite) {
  const taskInputs = [...document.querySelectorAll("[data-care-task]")];
  const groupInputs = [...document.querySelectorAll("[data-care-group-checkbox]")];
  const dateInput = receiptForm.querySelector("[data-care-date]");
  const noteInput = receiptForm.querySelector("[data-care-note]");
  const summary = receiptForm.querySelector("[data-selected-summary]");
  const status = receiptForm.querySelector("[data-receipt-status]");
  const clearButton = receiptForm.querySelector("[data-clear-receipt]");
  const submitButton = receiptForm.querySelector("[data-submit-care]");
  const openTaskList = document.querySelector("[data-open-care-tasks]");
  const completedTaskSection = document.querySelector("[data-completed-care-tasks]");
  const completedTaskList = document.querySelector("[data-completed-care-list]");
  const completedTaskSummary = document.querySelector("[data-completed-care-summary]");
  const completedTaskCount = document.querySelector("[data-completed-care-count]");
  const taskCards = [...document.querySelectorAll("[data-care-task-card]")];
  const taskCardOrder = new Map(taskCards.map((card, index) => [card, index]));
  const apiUrl = privateApiUrl;
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

  const groupMembers = (groupInput) => taskInputs.filter(
    (input) => input.dataset.careGroupId === groupInput.dataset.careGroupId,
  );

  const resetTaskSelection = () => {
    syncedTasks.clear();
    taskInputs.forEach((input) => {
      input.checked = false;
      input.disabled = false;
    });
    groupInputs.forEach((input) => {
      input.checked = false;
      input.indeterminate = false;
      input.disabled = false;
    });
  };

  const selectedTasks = () => taskInputs.filter((input) => input.checked);
  const pendingTasks = () => selectedTasks().filter(
    (input) => !syncedTasks.has(taskKey(input)),
  );

  const updateTaskCollections = () => {
    if (!openTaskList || !completedTaskList || !completedTaskSection) return;
    let focusedCardWasCollected = false;
    taskCards.forEach((card) => {
      const destination = card.classList.contains("is-complete")
        ? completedTaskList
        : openTaskList;
      if (card.parentElement === destination) return;
      if (card.contains(document.activeElement)) focusedCardWasCollected = true;
      destination.append(card);
    });
    [openTaskList, completedTaskList].forEach((list) => {
      [...list.querySelectorAll(":scope > [data-care-task-card]")]
        .sort((left, right) => taskCardOrder.get(left) - taskCardOrder.get(right))
        .forEach((card) => list.append(card));
    });
    const completeCount = completedTaskList.querySelectorAll(
      ":scope > [data-care-task-card]",
    ).length;
    completedTaskSection.hidden = completeCount === 0;
    if (completedTaskCount) completedTaskCount.textContent = `${completeCount} 项`;
    if (!completeCount) completedTaskSection.open = false;
    if (focusedCardWasCollected && !completedTaskSection.open) {
      completedTaskSummary?.focus({ preventScroll: true });
    }
  };

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
    const isSynced = syncedTasks.has(taskKey(input));
    if (isSynced) input.checked = true;
    input.disabled = isSynced;
    if (input.dataset.careGroupId) return;
    const card = input.closest(".task-card");
    if (card) {
      card.classList.toggle("is-complete", input.checked);
      card.classList.toggle("is-receipted", isSynced);
    }
    const state = input.closest(".task-check")?.querySelector("[data-task-state]");
    if (state) {
      state.textContent = isSynced ? "已记录" : input.checked ? "已完成" : "完成";
    }
  };

  const updateGroupState = (groupInput) => {
    const members = groupMembers(groupInput);
    const selectedCount = members.filter((member) => member.checked).length;
    const syncedCount = members.filter((member) => syncedTasks.has(taskKey(member))).length;
    const isComplete = Boolean(members.length) && selectedCount === members.length;
    const isSynced = Boolean(members.length) && syncedCount === members.length;
    groupInput.checked = isComplete;
    groupInput.indeterminate = selectedCount > 0 && !isComplete;
    groupInput.disabled = isSynced;
    const card = groupInput.closest(".task-card");
    if (card) {
      card.classList.toggle("is-complete", isComplete);
      card.classList.toggle("is-receipted", isSynced);
    }
    const state = groupInput.closest(".task-check")?.querySelector("[data-task-state]");
    if (state) {
      state.textContent = isSynced
        ? "已记录"
        : isComplete
          ? "整组已完成"
          : selectedCount
            ? `${selectedCount} / ${members.length} 已完成`
            : "整组完成";
    }
  };

  const updateSummary = () => {
    const selected = selectedTasks();
    const pending = pendingTasks();
    if (summary) {
      if (!taskInputs.length) {
        summary.textContent = "今天没有预设任务，可以直接写补充说明";
      } else if (!selected.length) {
        summary.textContent = `0 / ${taskInputs.length} 项已完成`;
      } else if (pending.length) {
        summary.textContent = `${selected.length} / ${taskInputs.length} 项已完成 · ${pending.length} 项待提交`;
      } else {
        summary.textContent = `${selected.length} / ${taskInputs.length} 项已完成 · 已存云端`;
      }
    }
    taskInputs.forEach(updateCardState);
    groupInputs.forEach(updateGroupState);
    updateTaskCollections();
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
  groupInputs.forEach((groupInput) => {
    groupInput.addEventListener("change", () => {
      groupMembers(groupInput).forEach((member) => {
        if (!syncedTasks.has(taskKey(member))) {
          member.checked = groupInput.checked;
        }
      });
      updateSummary();
      saveDraft();
      if (status) status.textContent = "";
    });
  });
  dateInput?.addEventListener("change", () => {
    resetTaskSelection();
    updateSummary();
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

  const careRequest = async (path, options = {}) => {
    if (!apiUrl) {
      const error = new Error("记录功能尚未准备好");
      error.status = 0;
      throw error;
    }
    await window.privateSessionReady;
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
    if (!apiUrl || !navigator.onLine) return;
    const receipts = pendingReceipts();
    for (const receipt of receipts) {
      try {
        await syncReceipt(receipt);
        removePending(receipt.idempotency_key);
      } catch (error) {
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
    if (!apiUrl) return;
    try {
      const operationDate = dateInput?.value || defaultDate;
      const result = await careRequest(`/api/care?date=${encodeURIComponent(operationDate)}`);
      if ((dateInput?.value || defaultDate) !== operationDate) return;
      applyCompletedKeys(result.completed_keys);
    } catch (_error) {
      // 登录过期或暂时断网时保留当前页面和本机草稿。
    }
  };

  receiptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = pendingTasks();
    const note = noteInput?.value.trim() || "";
    const careDate = dateInput?.value || defaultDate;

    if (!selected.length && !note) {
      if (status) {
        status.textContent = selectedTasks().length
          ? "已完成项目都记录过了；可以再勾选新项目或写一句补充说明。"
          : "请至少完成一项，或者写一句补充说明。";
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
      if (status) status.textContent = result.backup_pending
        ? "已经保存，备份稍后自动完成。"
        : selected.length
          ? `已保存 ${selected.length} 个新增完成项目。`
          : "补充说明已保存，Agent 之后能看到。";
    } catch (error) {
      if (status) status.textContent = error.status === 401
        ? "记录功能暂时不可用，请告诉 Agent 帮你恢复；本次内容仍保存在这台设备。"
        : "暂时没能写入云端，内容已保存在本机，联网后会自动重试。";
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  window.addEventListener("online", retryPending);
  if (dateInput) dateInput.max = defaultDate;
  updateSummary();
  window.privateSessionReady.then(() => retryPending().then(refreshCompleted));
}
