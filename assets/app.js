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
  const defaultDate = receiptForm.dataset.defaultDate;
  const storageKey = `plant-care-receipt:${defaultDate}`;

  const taskKey = (input) => [
    input.dataset.careKind,
    input.dataset.careId,
    input.dataset.careAction,
  ].join(":");

  const selectedTasks = () => taskInputs.filter((input) => input.checked);

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
    });
  });
  dateInput?.addEventListener("change", saveDraft);
  noteInput?.addEventListener("input", saveDraft);

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
    updateSummary();
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

    const completedLines = selected.length
      ? selected.map((input) => `- [x] ${input.dataset.careAction}｜${input.dataset.careId}｜${input.dataset.careName}`).join("\n")
      : "- 没有勾选预设任务";
    const machineLines = selected.length
      ? selected.map((input) => `${input.dataset.careKind}\t${input.dataset.careId}\t${input.dataset.careAction}`).join("\n")
      : "none";
    const body = [
      "> 来自养护看板的私人回执。请按仓库协作约定判断并落盘。",
      "",
      "## 已完成",
      completedLines,
      "",
      "## 文字补充",
      note || "无",
      "",
      "## 机器可读",
      "```text",
      "care_receipt_v1",
      `date\t${careDate}`,
      machineLines,
      "```",
    ].join("\n");
    const repository = receiptForm.dataset.repository;
    const target = new URL(`https://github.com/${repository}/issues/new`);
    target.searchParams.set("title", `[网站回执] ${careDate} 养护记录`);
    target.searchParams.set("body", body);
    target.searchParams.set("labels", "网站回执");

    if (target.toString().length > 7500) {
      if (status) status.textContent = "补充文字太长，请缩短后再提交。";
      return;
    }

    saveDraft();
    if (status) status.textContent = "正在打开私人提交页面……";
    window.location.assign(target.toString());
  });

  updateSummary();
}
