"use strict";

const STORAGE_KEYS = {
  appsScriptUrl: "appsScriptUrl",
  sheetUrl: "sheetUrl",
};
const pendingTargets = new Set();
let isTargetProcessingScheduled = false;
let exportButton = null;
let isExporting = false;
const MAINTENANCE_INTERVAL_MS = 1500;

function getStorageValues(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (result) => {
      resolve(result || {});
    });
  });
}

function extractSpreadsheetId(sheetUrl) {
  if (typeof sheetUrl !== "string") {
    return "";
  }

  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : "";
}

async function getExportConfig() {
  const settings = await getStorageValues([
    STORAGE_KEYS.appsScriptUrl,
    STORAGE_KEYS.sheetUrl,
  ]);

  const appsScriptUrl =
    typeof settings[STORAGE_KEYS.appsScriptUrl] === "string"
      ? settings[STORAGE_KEYS.appsScriptUrl].trim()
      : "";
  const sheetUrl =
    typeof settings[STORAGE_KEYS.sheetUrl] === "string"
      ? settings[STORAGE_KEYS.sheetUrl].trim()
      : "";
  const spreadsheetId = extractSpreadsheetId(sheetUrl);

  return { appsScriptUrl, sheetUrl, spreadsheetId };
}

function getSearchRoots() {
  const roots = [document];
  const rootElement = document.documentElement;
  if (!rootElement) {
    return roots;
  }

  const walker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_ELEMENT,
  );
  let node = walker.currentNode;
  while (node) {
    if (node.shadowRoot) {
      roots.push(node.shadowRoot);
    }

    node = walker.nextNode();
  }

  return roots;
}

function queryAllAcrossRoots(selector) {
  const matches = [];

  getSearchRoots().forEach((root) => {
    root.querySelectorAll(selector).forEach((node) => matches.push(node));
  });

  return matches;
}

function getSelectedRowCount() {
  return queryAllAcrossRoots(".scrape-checkbox:checked").length;
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

function injectCheckboxIntoTableRow(row) {
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

function injectCheckboxIntoPartCard(card) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  if (card.querySelector(":scope > .scrape-checkbox-wrap")) {
    return;
  }

  const computedPosition = window.getComputedStyle(card).position;
  if (computedPosition === "static") {
    card.style.position = "relative";
  }

  const wrap = document.createElement("label");
  wrap.className = "scrape-checkbox-wrap";
  wrap.style.position = "absolute";
  wrap.style.top = "8px";
  wrap.style.right = "8px";
  wrap.style.zIndex = "5";
  wrap.style.background = "#ffffff";
  wrap.style.border = "1px solid #cbd5e1";
  wrap.style.borderRadius = "6px";
  wrap.style.padding = "4px";
  wrap.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.12)";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.classList.add("scrape-checkbox");
  checkbox.style.display = "block";
  checkbox.style.margin = "0";

  wrap.appendChild(checkbox);
  card.prepend(wrap);
}

function injectCheckboxIntoTarget(target) {
  if (!(target instanceof Element)) {
    return;
  }

  const targetType = target.getAttribute("data-scrape-target-type");
  if (targetType === "row") {
    injectCheckboxIntoTableRow(target);
    return;
  }

  if (targetType === "card") {
    injectCheckboxIntoPartCard(target);
  }
}

function processPendingTargets() {
  pendingTargets.forEach((target) => {
    injectCheckboxIntoTarget(target);
  });

  pendingTargets.clear();
  isTargetProcessingScheduled = false;
  updateExportButtonState();
}

function scheduleTargetProcessing() {
  if (isTargetProcessingScheduled) {
    return;
  }

  isTargetProcessingScheduled = true;
  requestAnimationFrame(processPendingTargets);
}

function queueTargetForCheckbox(target) {
  if (!(target instanceof Element)) {
    return;
  }

  pendingTargets.add(target);
  scheduleTargetProcessing();
}

function addTableRowCheckboxes(root = document) {
  const rows =
    root === document
      ? queryAllAcrossRoots("tbody tr")
      : root.querySelectorAll("tbody tr");
  rows.forEach((row) => {
    row.setAttribute("data-scrape-target-type", "row");
    queueTargetForCheckbox(row);
  });
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function looksLikePartInfoCard(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const text = normalizeWhitespace(element.textContent || "").toLowerCase();
  if (!text) {
    return false;
  }

  return (
    text.includes("part information") &&
    text.includes("pos") &&
    text.includes("part no") &&
    text.includes("description")
  );
}

function addPartCardCheckboxes(root = document) {
  const candidates =
    root === document
      ? queryAllAcrossRoots("div, section, article, li")
      : root.querySelectorAll("div, section, article, li");

  candidates.forEach((element) => {
    if (!looksLikePartInfoCard(element)) {
      return;
    }

    const textLength = normalizeWhitespace(element.textContent || "").length;
    if (textLength > 420) {
      return;
    }

    element.setAttribute("data-scrape-target-type", "card");
    queueTargetForCheckbox(element);
  });
}

function addScrapeCheckboxes(root = document) {
  addTableRowCheckboxes(root);
  addPartCardCheckboxes(root);
}

function observeTableRows() {
  const observerTarget = document.documentElement;
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
          node.setAttribute("data-scrape-target-type", "row");
          queueTargetForCheckbox(node);
        }

        addScrapeCheckboxes(node);
      });
    });
  });

  observer.observe(observerTarget, {
    childList: true,
    subtree: true,
  });
}

function collectSelectedRows() {
  const result = [];

  const checkedBoxes = queryAllAcrossRoots(".scrape-checkbox:checked");
  checkedBoxes.forEach((checkbox) => {
    const target = checkbox.closest("[data-scrape-target-type]");
    if (!target) {
      return;
    }

    const targetType = target.getAttribute("data-scrape-target-type");
    if (targetType === "row") {
      const cells = target.querySelectorAll("td");
      if (cells.length < 3) {
        return;
      }

      const getCellText = (cell) => {
        const clone = cell.cloneNode(true);
        clone
          .querySelectorAll(".scrape-checkbox, .scrape-checkbox-wrap")
          .forEach((node) => node.remove());
        return normalizeWhitespace(clone.textContent || "");
      };

      const position = getCellText(cells[0]);
      const partNumber = getCellText(cells[1]);
      const description = getCellText(cells[2]);

      result.push([position, partNumber, description]);
      return;
    }

    if (targetType === "card") {
      const clonedTarget = target.cloneNode(true);
      clonedTarget
        .querySelectorAll(".scrape-checkbox, .scrape-checkbox-wrap")
        .forEach((node) => node.remove());

      const text = normalizeWhitespace(clonedTarget.textContent || "");
      const positionMatch = text.match(
        /Pos\.?\s*([\w-]+)(?=\s+Part\s*no\.?|\s+Description|$)/i,
      );
      const partNumberMatch = text.match(
        /Part\s*no\.?\s*([^]+?)(?=\s+Description|\s+Supplement|\s+Unit|\s+AE|$)/i,
      );
      const descriptionMatch = text.match(
        /Description\s*([^]+?)(?=\s+Supplement|\s+Unit|\s+AE|$)/i,
      );

      const position = positionMatch
        ? normalizeWhitespace(positionMatch[1])
        : "";
      const partNumber = partNumberMatch
        ? normalizeWhitespace(partNumberMatch[1])
        : "";
      const description = descriptionMatch
        ? normalizeWhitespace(descriptionMatch[1])
        : "";

      if (!position && !partNumber && !description) {
        return;
      }

      result.push([position, partNumber, description]);
    }
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
    const config = await getExportConfig();
    if (!config.appsScriptUrl) {
      throw new Error(
        "Missing Apps Script URL. Open Part2Sheet extension popup and save your Apps Script Web App URL.",
      );
    }

    const response = await fetch(config.appsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rows,
        spreadsheetId: config.spreadsheetId,
        sheetUrl: config.sheetUrl,
      }),
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

function ensureExtensionMounted() {
  createExportButton();
  addScrapeCheckboxes();
}

function startMaintenanceLoop() {
  window.setInterval(() => {
    ensureExtensionMounted();
  }, MAINTENANCE_INTERVAL_MS);
}

ensureExtensionMounted();
observeTableRows();
bindCheckboxSelectionListener();
startMaintenanceLoop();
console.log("Extension loaded");
