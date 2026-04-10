"use strict";

const GOOGLE_APPS_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
const pendingRows = new Set();
let isRowProcessingScheduled = false;
let exportButton = null;
let isExporting = false;

function getSelectedRowCount() {
  return document.querySelectorAll("tbody tr .scrape-checkbox:checked").length;
}

function updateExportButtonState() {
  if (!exportButton) {
    return;
  }

  const selectedCount = getSelectedRowCount();
  const shouldDisable = isExporting || selectedCount === 0;

  exportButton.disabled = shouldDisable;
  exportButton.textContent = isExporting
    ? "Exporting..."
    : `Export Selected (${selectedCount})`;

  exportButton.style.backgroundColor = shouldDisable ? "#cbd5e1" : "#0f172a";
  exportButton.style.cursor = shouldDisable ? "not-allowed" : "pointer";
  exportButton.style.opacity = shouldDisable ? "0.9" : "1";
}

function injectCheckboxIntoRow(row) {
  if (!(row instanceof HTMLTableRowElement)) {
    return;
  }

  if (row.querySelector(".scrape-checkbox")) {
    return;
  }

  const firstCell = row.firstElementChild;
  if (!firstCell || firstCell.tagName !== "TD") {
    return;
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.classList.add("scrape-checkbox");

  firstCell.prepend(checkbox);
}

function processPendingRows() {
  pendingRows.forEach((row) => {
    injectCheckboxIntoRow(row);
  });

  pendingRows.clear();
  isRowProcessingScheduled = false;
  updateExportButtonState();
}

function scheduleRowProcessing() {
  if (isRowProcessingScheduled) {
    return;
  }

  isRowProcessingScheduled = true;
  requestAnimationFrame(processPendingRows);
}

function queueRowForCheckbox(row) {
  if (!(row instanceof HTMLTableRowElement)) {
    return;
  }

  pendingRows.add(row);
  scheduleRowProcessing();
}

function addRowCheckboxes(root = document) {
  const rows = root.querySelectorAll("tbody tr");
  rows.forEach((row) => queueRowForCheckbox(row));
}

function observeTableRows() {
  const observerTarget = document.body;
  if (!observerTarget) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }

        if (node.matches("tbody tr")) {
          queueRowForCheckbox(node);
        }

        const nestedRows = node.querySelectorAll("tbody tr");
        nestedRows.forEach((row) => queueRowForCheckbox(row));
      });
    });
  });

  observer.observe(observerTarget, {
    childList: true,
    subtree: true,
  });
}

function collectSelectedRows() {
  const rows = document.querySelectorAll("tbody tr");
  const result = [];

  rows.forEach((row) => {
    const checkbox = row.querySelector(".scrape-checkbox");
    if (!checkbox || !checkbox.checked) {
      return;
    }

    const cells = row.querySelectorAll("td");
    if (cells.length < 3) {
      return;
    }

    const getCellText = (cell) => {
      const clone = cell.cloneNode(true);
      clone
        .querySelectorAll(".scrape-checkbox")
        .forEach((node) => node.remove());
      return clone.textContent.replace(/\s+/g, " ").trim();
    };

    const position = getCellText(cells[0]);
    const partNumber = getCellText(cells[1]);
    const description = getCellText(cells[2]);

    result.push([position, partNumber, description]);
  });

  return result;
}

async function exportSelectedRows() {
  if (isExporting) {
    return;
  }

  const rows = collectSelectedRows();

  if (!rows.length) {
    alert("No rows selected");
    updateExportButtonState();
    return;
  }

  isExporting = true;
  updateExportButtonState();

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rows }),
    });

    let responseData = null;
    try {
      responseData = await response.json();
    } catch (_error) {
      responseData = null;
    }

    if (!response.ok || (responseData && responseData.success === false)) {
      const message =
        (responseData && responseData.message) || "Failed to export data";
      throw new Error(message);
    }

    alert("Data exported successfully");
  } catch (error) {
    console.error("Export failed:", error);
    alert("Export failed: " + error.message);
  } finally {
    isExporting = false;
    updateExportButtonState();
  }
}

function createExportButton() {
  const existingButton = document.getElementById("scrape-export-button");
  if (existingButton) {
    exportButton = existingButton;
    updateExportButtonState();
    return;
  }

  const button = document.createElement("button");
  button.id = "scrape-export-button";
  button.textContent = "Export Selected (0)";
  button.type = "button";

  button.style.position = "fixed";
  button.style.top = "16px";
  button.style.right = "16px";
  button.style.zIndex = "2147483647";
  button.style.padding = "10px 14px";
  button.style.backgroundColor = "#0f172a";
  button.style.color = "#ffffff";
  button.style.border = "1px solid #0f172a";
  button.style.borderRadius = "10px";
  button.style.fontFamily = "Segoe UI, system-ui, -apple-system, sans-serif";
  button.style.fontSize = "13px";
  button.style.fontWeight = "600";
  button.style.letterSpacing = "0.2px";
  button.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.18)";
  button.style.transition = "background-color 120ms ease, opacity 120ms ease";
  button.style.cursor = "pointer";

  button.addEventListener("click", () => {
    exportSelectedRows();
  });

  document.body.appendChild(button);
  exportButton = button;
  updateExportButtonState();
}

function bindCheckboxSelectionListener() {
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (!target.classList.contains("scrape-checkbox")) {
      return;
    }

    updateExportButtonState();
  });
}

addRowCheckboxes();
observeTableRows();
createExportButton();
bindCheckboxSelectionListener();
console.log("Extension loaded");
