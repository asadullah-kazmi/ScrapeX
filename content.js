"use strict";

const pendingTargets = new Set();
let isTargetProcessingScheduled = false;
let exportButton = null;
let isExporting = false;
const MAINTENANCE_INTERVAL_MS = 1500;
const customSheetRows = [];
let sheetOverlay = null;
let sheetTableBody = null;
let sheetRowCount = null;
let sheetStatus = null;

function getSearchRoots() {
  const roots = [];
  const visited = new Set();

  const collectFromDocument = (doc) => {
    if (!doc || visited.has(doc)) {
      return;
    }

    visited.add(doc);
    roots.push(doc);

    const rootElement = doc.documentElement;
    if (!rootElement) {
      return;
    }

    const walker = doc.createTreeWalker(rootElement, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;

    while (node) {
      if (node.shadowRoot) {
        roots.push(node.shadowRoot);
      }

      if (node.tagName === "IFRAME" || node.tagName === "FRAME") {
        try {
          if (node.contentDocument) {
            collectFromDocument(node.contentDocument);
          }
        } catch (_error) {
          // Ignore cross-origin frames.
        }
      }

      node = walker.nextNode();
    }
  };

  collectFromDocument(document);
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

function setSheetStatus(message, isError = false) {
  if (!sheetStatus) {
    return;
  }

  sheetStatus.textContent = message;
  sheetStatus.style.color = isError ? "#b91c1c" : "#334155";
}

function createSheetPanel() {
  if (sheetOverlay) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "scrape-sheet-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483646";
  overlay.style.background = "rgba(15, 23, 42, 0.25)";
  overlay.style.display = "none";

  const panel = document.createElement("div");
  panel.id = "scrape-sheet-panel";
  panel.style.position = "absolute";
  panel.style.top = "50%";
  panel.style.left = "50%";
  panel.style.transform = "translate(-50%, -50%)";
  panel.style.width = "min(960px, 92vw)";
  panel.style.height = "min(640px, 84vh)";
  panel.style.background = "#ffffff";
  panel.style.borderRadius = "14px";
  panel.style.boxShadow = "0 24px 80px rgba(15, 23, 42, 0.3)";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.overflow = "hidden";
  panel.style.fontFamily = "Segoe UI, system-ui, -apple-system, sans-serif";

  const header = document.createElement("div");
  header.style.padding = "14px 16px";
  header.style.background = "linear-gradient(135deg, #0f172a, #1e293b)";
  header.style.color = "#ffffff";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const titleWrap = document.createElement("div");
  const title = document.createElement("div");
  title.textContent = "Part2Sheet - Scraped Data";
  title.style.fontSize = "15px";
  title.style.fontWeight = "700";

  const subtitle = document.createElement("div");
  subtitle.textContent = "Copy and paste directly into your Google Sheet.";
  subtitle.style.fontSize = "12px";
  subtitle.style.opacity = "0.85";

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.style.border = "1px solid rgba(255,255,255,0.35)";
  closeButton.style.background = "transparent";
  closeButton.style.color = "#ffffff";
  closeButton.style.borderRadius = "8px";
  closeButton.style.padding = "8px 10px";
  closeButton.style.cursor = "pointer";
  closeButton.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  header.appendChild(titleWrap);
  header.appendChild(closeButton);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.padding = "12px 16px";
  actions.style.borderBottom = "1px solid #e2e8f0";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy All Rows";
  copyButton.style.background = "#0f172a";
  copyButton.style.color = "#ffffff";
  copyButton.style.border = "none";
  copyButton.style.padding = "9px 12px";
  copyButton.style.borderRadius = "8px";
  copyButton.style.fontWeight = "600";
  copyButton.style.cursor = "pointer";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.style.background = "#f1f5f9";
  clearButton.style.color = "#0f172a";
  clearButton.style.border = "1px solid #cbd5e1";
  clearButton.style.padding = "9px 12px";
  clearButton.style.borderRadius = "8px";
  clearButton.style.fontWeight = "600";
  clearButton.style.cursor = "pointer";

  const count = document.createElement("div");
  count.style.marginLeft = "auto";
  count.style.alignSelf = "center";
  count.style.fontSize = "12px";
  count.style.color = "#475569";

  actions.appendChild(copyButton);
  actions.appendChild(clearButton);
  actions.appendChild(count);

  const tableWrap = document.createElement("div");
  tableWrap.style.flex = "1";
  tableWrap.style.overflow = "auto";

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "13px";

  const thead = document.createElement("thead");
  thead.innerHTML =
    '<tr style="background:#f8fafc"><th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Position</th><th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Part Number</th><th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">Description</th></tr>';

  const tbody = document.createElement("tbody");
  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);

  const footer = document.createElement("div");
  footer.style.padding = "10px 16px";
  footer.style.borderTop = "1px solid #e2e8f0";
  footer.style.fontSize = "12px";
  footer.style.color = "#334155";

  panel.appendChild(header);
  panel.appendChild(actions);
  panel.appendChild(tableWrap);
  panel.appendChild(footer);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.style.display = "none";
    }
  });

  copyButton.addEventListener("click", async () => {
    await copyCustomSheetRows();
  });

  clearButton.addEventListener("click", () => {
    customSheetRows.length = 0;
    renderCustomSheetRows();
    setSheetStatus("Cleared all rows.");
  });

  sheetOverlay = overlay;
  sheetTableBody = tbody;
  sheetRowCount = count;
  sheetStatus = footer;
}

function renderCustomSheetRows() {
  if (!sheetTableBody || !sheetRowCount) {
    return;
  }

  sheetTableBody.innerHTML = "";

  customSheetRows.forEach((row) => {
    const normalizedRow = normalizeCustomSheetRow(row);
    const tr = document.createElement("tr");

    normalizedRow.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value || "";
      td.style.padding = "10px";
      td.style.borderBottom = "1px solid #f1f5f9";
      td.style.verticalAlign = "top";
      tr.appendChild(td);
    });

    sheetTableBody.appendChild(tr);
  });

  sheetRowCount.textContent = `${customSheetRows.length} rows`;
}

function openCustomSheetPanel() {
  createSheetPanel();
  renderCustomSheetRows();
  if (sheetOverlay) {
    sheetOverlay.style.display = "block";
  }
}

function rowsToClipboardText(rows) {
  const header = ["Position", "Part Number", "Description"];
  const lines = [header.join("\t")];
  rows.forEach((row) => {
    const normalizedRow = normalizeCustomSheetRow(row);
    lines.push(
      normalizedRow
        .map((value) => normalizeWhitespace(String(value || "")))
        .join("\t"),
    );
  });
  return lines.join("\n");
}

function normalizeCustomSheetRow(row) {
  const source = Array.isArray(row) ? row : [];
  const cleaned = source
    .map((value) => cleanExtractedText(value))
    .filter((value) => value !== "");

  let position = "";
  let partNumber = "";
  let description = "";

  cleaned.forEach((value) => {
    if (!position && isLikelyPositionValue(value)) {
      position = value;
      return;
    }

    if (!partNumber && isLikelyPartNumber(value)) {
      partNumber = value;
      return;
    }

    if (
      !description &&
      !isLikelyPositionValue(value) &&
      !isLikelyPartNumber(value)
    ) {
      description = value;
    }
  });

  if (!description && cleaned.length) {
    const fallback = cleaned.find(
      (value) => value !== position && value !== partNumber,
    );
    description = fallback || "";
  }

  return [position, partNumber, description];
}

async function copyCustomSheetRows() {
  if (!customSheetRows.length) {
    setSheetStatus("No rows to copy.", true);
    return;
  }

  const text = rowsToClipboardText(customSheetRows);

  try {
    await navigator.clipboard.writeText(text);
    setSheetStatus("Copied. Paste directly into Google Sheets.");
  } catch (_error) {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
    setSheetStatus("Copied using fallback. Paste directly into Google Sheets.");
  }
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

function injectCheckboxIntoGridRow(row) {
  if (!(row instanceof HTMLElement)) {
    return;
  }

  if (row.querySelector(":scope > .scrape-checkbox-wrap")) {
    return;
  }

  const computedPosition = window.getComputedStyle(row).position;
  if (computedPosition === "static") {
    row.style.position = "relative";
  }

  const wrap = document.createElement("label");
  wrap.className = "scrape-checkbox-wrap";
  wrap.style.position = "absolute";
  wrap.style.left = "6px";
  wrap.style.top = "50%";
  wrap.style.transform = "translateY(-50%)";
  wrap.style.zIndex = "6";
  wrap.style.background = "#ffffff";
  wrap.style.border = "1px solid #cbd5e1";
  wrap.style.borderRadius = "6px";
  wrap.style.padding = "3px";
  wrap.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.12)";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.classList.add("scrape-checkbox");
  checkbox.style.display = "block";
  checkbox.style.margin = "0";

  wrap.appendChild(checkbox);
  row.prepend(wrap);
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
    return;
  }

  if (targetType === "grid-row") {
    injectCheckboxIntoGridRow(target);
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

function getCleanTextFromNode(node) {
  const clone = node.cloneNode(true);
  clone
    .querySelectorAll(".scrape-checkbox, .scrape-checkbox-wrap")
    .forEach((el) => el.remove());
  return cleanExtractedText(clone.textContent || "");
}

function cleanExtractedText(value) {
  return normalizeWhitespace(
    String(value || "")
      .replace(/[☐☑✅✔□🗹🗸]/g, "")
      .replace(/^[^\p{L}\p{N}-]+/gu, ""),
  );
}

function isLikelyPartNumber(value) {
  if (!value) {
    return false;
  }

  const compact = normalizeWhitespace(value);
  if (!compact) {
    return false;
  }

  if (/^(?=.*\d)[A-Z0-9-]{7,}$/i.test(compact)) {
    return true;
  }

  if (/^\d{2}(?:\s\d{1,3}){3,}$/.test(compact)) {
    return true;
  }

  if (/^(?:[A-Z]{1,2}\s)?\d{3}(?:\s\d{2,4}){2,}$/i.test(compact)) {
    return true;
  }

  if (/^(?:[A-Z0-9]{1,4})(?:\s[A-Z0-9]{1,4}){2,}$/i.test(compact)) {
    return true;
  }

  return false;
}

function isLikelyPositionValue(value) {
  const text = normalizeWhitespace(value || "");
  return /^(\d{1,3}|--)$/.test(text);
}

function getPartNumberMatches(text) {
  const compact = normalizeWhitespace(text || "");
  if (!compact) {
    return [];
  }

  const matches = [];
  const alphaNum = compact.match(/\b(?=.*\d)[A-Z0-9-]{7,}\b/gi) || [];
  const spacedNum = compact.match(/\b\d{2}(?:\s\d{1,3}){3,}\b/g) || [];
  const prefixed =
    compact.match(/\b(?:[A-Z]{1,2}\s)?\d{3}(?:\s\d{2,4}){2,}\b/gi) || [];
  const grouped =
    compact.match(/\b(?:[A-Z0-9]{1,4})(?:\s[A-Z0-9]{1,4}){2,}\b/gi) || [];

  alphaNum.forEach((value) => matches.push(value));
  spacedNum.forEach((value) => matches.push(value));
  prefixed.forEach((value) => matches.push(value));
  grouped.forEach((value) => matches.push(value));
  return matches;
}

function parseGridRowFromCells(childValues) {
  const values = childValues
    .map((value) => cleanExtractedText(value))
    .filter(Boolean)
    .filter((value) => value !== "i" && value !== "?");

  if (!values.length) {
    return ["", "", ""];
  }

  const posIndex = values.findIndex((value) => isLikelyPositionValue(value));
  if (posIndex < 0) {
    return ["", "", ""];
  }

  const position = values[posIndex];
  const afterPos = values.slice(posIndex + 1);
  if (!afterPos.length) {
    return [position, "", ""];
  }

  let partNumber = afterPos[0] || "";
  if (!isLikelyPartNumber(partNumber)) {
    const foundPart = afterPos.find((value) => isLikelyPartNumber(value));
    if (foundPart) {
      partNumber = foundPart;
    }
  }

  let description = "";
  const partIdx = afterPos.findIndex((value) => value === partNumber);
  const scanStart = partIdx >= 0 ? partIdx + 1 : 1;

  for (let i = scanStart; i < afterPos.length; i += 1) {
    const value = afterPos[i];
    if (!value) {
      continue;
    }

    if (isLikelyPositionValue(value)) {
      continue;
    }

    if (/^\d+$/.test(value)) {
      continue;
    }

    if (isLikelyPartNumber(value) && !/[a-z]/i.test(value)) {
      continue;
    }

    description = value;
    break;
  }

  return [position, partNumber, description];
}

function isVisibleElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getGridHeaderAnchors() {
  const anchors = { pos: null, part: null, description: null };
  const candidates = queryAllAcrossRoots("div, span, th, td");

  candidates.forEach((element) => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
      return;
    }

    const text = cleanExtractedText(element.textContent || "").toLowerCase();
    if (!text) {
      return;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.left < window.innerWidth * 0.2 ||
      rect.top > window.innerHeight * 0.65
    ) {
      return;
    }

    const center = rect.left + rect.width / 2;
    if (text === "pos." || text === "pos") {
      anchors.pos = anchors.pos || center;
    } else if (text === "part no." || text === "part no") {
      anchors.part = anchors.part || center;
    } else if (text === "description") {
      anchors.description = anchors.description || center;
    }
  });

  return anchors;
}

function extractGridRowValuesFromColumns(target) {
  const anchors = getGridHeaderAnchors();
  const cells = Array.from(target.children).filter(
    (cell) => cell instanceof HTMLElement && isVisibleElement(cell),
  );

  if (!cells.length || !anchors.pos || !anchors.part || !anchors.description) {
    return ["", "", ""];
  }

  let position = "";
  let partNumber = "";
  let description = "";

  cells.forEach((cell) => {
    const text = cleanExtractedText(cell.textContent || "");
    if (!text) {
      return;
    }

    const rect = cell.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const distances = [
      { key: "pos", d: Math.abs(center - anchors.pos) },
      { key: "part", d: Math.abs(center - anchors.part) },
      { key: "description", d: Math.abs(center - anchors.description) },
    ].sort((a, b) => a.d - b.d);

    const nearest = distances[0].key;

    if (nearest === "pos" && !position) {
      const posMatch = text.match(/\b(\d{1,3}|--)\b/);
      if (posMatch) {
        position = posMatch[0];
      }
      return;
    }

    if (nearest === "part") {
      const matches = getPartNumberMatches(text);
      if (
        matches.length &&
        (!partNumber || matches[0].length > partNumber.length)
      ) {
        partNumber = matches[0];
      }
      return;
    }

    if (nearest === "description" && !description) {
      if (!isLikelyPartNumber(text) && !isLikelyPositionValue(text)) {
        description = text;
      }
    }
  });

  return [position, partNumber, description];
}

function looksLikeGridPartRow(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.childElementCount < 5) {
    return false;
  }

  const text = getCleanTextFromNode(element);
  if (!text || text.length > 240) {
    return false;
  }

  if (/part\s*no\.?|description|restrictions|from|to|quan/i.test(text)) {
    return false;
  }

  if (/only in conjunction with/i.test(text)) {
    return false;
  }

  const hasPartNumber = isLikelyPartNumber(text);
  const hasPosition = /\b\d{1,3}\b/.test(text) || /\b--\b/.test(text);
  if (!hasPartNumber || !hasPosition) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 450 || rect.height < 32 || rect.height > 220) {
    return false;
  }

  return true;
}

function addGridRowCheckboxes(root = document) {
  const candidates =
    root === document
      ? queryAllAcrossRoots("div")
      : root.querySelectorAll("div");

  candidates.forEach((element) => {
    if (!looksLikeGridPartRow(element)) {
      return;
    }

    element.setAttribute("data-scrape-target-type", "grid-row");
    queueTargetForCheckbox(element);
  });

  addUniversalAnchorFallbackRows(root);
  addPositionAnchorFallbackRows(root);

  findHeaderAnchoredRows(root);
}

function addUniversalAnchorFallbackRows(root = document) {
  const anchors =
    root === document
      ? queryAllAcrossRoots("span, div, td, p")
      : root.querySelectorAll("span, div, td, p");

  anchors.forEach((element) => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
      return;
    }

    const text = normalizeWhitespace(element.textContent || "");
    if (!text || text.length > 24) {
      return;
    }

    if (!isLikelyPartNumber(text)) {
      return;
    }

    const rowContainer =
      findTightRowContainerForAnchor(element, text) ||
      findLikelyRowContainer(element);
    if (!rowContainer || !isVisibleElement(rowContainer)) {
      return;
    }

    rowContainer.setAttribute("data-scrape-target-type", "grid-row");
    queueTargetForCheckbox(rowContainer);
  });
}

function addPositionAnchorFallbackRows(root = document) {
  const anchors =
    root === document
      ? queryAllAcrossRoots("span, div, td, p")
      : root.querySelectorAll("span, div, td, p");

  anchors.forEach((element) => {
    if (!(element instanceof HTMLElement) || !isVisibleElement(element)) {
      return;
    }

    const text = normalizeWhitespace(element.textContent || "");
    if (!isLikelyPositionValue(text)) {
      return;
    }

    const rowContainer = findLikelyRowContainerFromPosition(element, text);
    if (!rowContainer || !isVisibleElement(rowContainer)) {
      return;
    }

    rowContainer.setAttribute("data-scrape-target-type", "grid-row");
    queueTargetForCheckbox(rowContainer);
  });
}

function findLikelyRowContainerFromPosition(startNode, positionValue) {
  let current = startNode;

  while (current && current !== document.body) {
    if (!(current instanceof HTMLElement)) {
      break;
    }

    const rect = current.getBoundingClientRect();
    const text = normalizeWhitespace(current.textContent || "");
    const widthOk = rect.width > window.innerWidth * 0.22;
    const heightOk = rect.height >= 24 && rect.height <= 140;
    const hasPosition = text.includes(positionValue);
    const hasPart = isLikelyPartNumber(text);
    const hasWords = /[a-z]{3,}/i.test(text);
    const isHeaderLike =
      /part\s*no\.?|description|supplement|unit|ae/i.test(text) && !hasPart;

    if (
      widthOk &&
      heightOk &&
      hasPosition &&
      (hasPart || hasWords) &&
      !isHeaderLike
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function findTightRowContainerForAnchor(startNode, anchorText) {
  let current = startNode;

  while (current && current !== document.body) {
    if (!(current instanceof HTMLElement)) {
      break;
    }

    const rect = current.getBoundingClientRect();
    const text = normalizeWhitespace(current.textContent || "");
    const partMatches = getPartNumberMatches(text);

    const widthOk = rect.width > window.innerWidth * 0.28;
    const heightOk = rect.height >= 24 && rect.height <= 110;
    const positionOk = /\b(\d{1,3}|--)\b/.test(text);
    const containsAnchor = text.includes(anchorText);
    const limitedParts = partMatches.length >= 1 && partMatches.length <= 2;

    if (widthOk && heightOk && positionOk && containsAnchor && limitedParts) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function findLikelyRowContainer(startNode) {
  let current = startNode;

  while (current && current !== document.body) {
    if (!(current instanceof HTMLElement)) {
      break;
    }

    const rect = current.getBoundingClientRect();
    const text = normalizeWhitespace(current.textContent || "");

    const looksLikeRowSize =
      rect.width > 520 && rect.height >= 28 && rect.height <= 180;
    const hasPosition = /\b(\d{1,3}|--)\b/.test(text);
    const hasPart = isLikelyPartNumber(text);
    const hasDescriptionText = /[a-z]{3,}/i.test(text);
    const headerLikeWithoutPart =
      /part\s*no\.?|description|supplement|unit|ae/i.test(text) && !hasPart;
    const partMatches = getPartNumberMatches(text);
    const limitedParts = partMatches.length >= 1 && partMatches.length <= 3;

    if (
      looksLikeRowSize &&
      hasPosition &&
      (hasPart || hasDescriptionText) &&
      !headerLikeWithoutPart &&
      limitedParts
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function findHeaderAnchoredRows(root = document) {
  const headers =
    root === document
      ? queryAllAcrossRoots("div, span, th, td")
      : root.querySelectorAll("div, span, th, td");

  const headerCandidates = Array.from(headers).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const text = normalizeWhitespace(element.textContent || "").toLowerCase();
    if (!text) {
      return false;
    }

    return (
      text.includes("pos") &&
      text.includes("part no") &&
      text.includes("description")
    );
  });

  headerCandidates.forEach((header) => {
    const region = header.parentElement || header;
    const searchRoot = region.parentElement || region;

    Array.from(searchRoot.children).forEach((candidate) => {
      if (!(candidate instanceof HTMLElement)) {
        return;
      }

      if (candidate === region) {
        return;
      }

      const text = normalizeWhitespace(candidate.textContent || "");
      if (!text) {
        return;
      }

      if (/part\s*no\.?|description|supplement|unit|ae/i.test(text)) {
        return;
      }

      const rect = candidate.getBoundingClientRect();
      const inRightPanel = rect.left > window.innerWidth * 0.28;
      const rowLikeSize =
        rect.width > window.innerWidth * 0.3 &&
        rect.height >= 26 &&
        rect.height <= 180;
      const hasPosition = /\b(\d{1,3}|--)\b/.test(text);

      if (inRightPanel && rowLikeSize && hasPosition) {
        candidate.setAttribute("data-scrape-target-type", "grid-row");
        queueTargetForCheckbox(candidate);
      }
    });
  });
}

function parseGridRowFromText(text) {
  const clean = normalizeWhitespace(text);
  if (!clean) {
    return ["", "", ""];
  }

  const positionMatch = clean.match(/\b(\d{1,3}|--)\b/);
  const partMatch =
    clean.match(/\b(?=.*[A-Z])(?=.*\d)[A-Z0-9-]{5,}\b/) ||
    clean.match(/\b\d{2}(?:\s\d{1,3}){3,}\b/);

  let description = "";
  if (partMatch) {
    const afterPart = clean.slice(partMatch.index + partMatch[0].length).trim();
    description = afterPart
      .replace(/\b(Supplement|Unit|AE|Restrictions|From|To)\b.*$/i, "")
      .trim();
  }

  return [
    positionMatch ? positionMatch[0] : "",
    partMatch ? partMatch[0] : "",
    description,
  ];
}

function addScrapeCheckboxes(root = document) {
  addTableRowCheckboxes(root);
  addPartCardCheckboxes(root);
  addGridRowCheckboxes(root);
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
      return;
    }

    if (targetType === "grid-row") {
      const childValues = Array.from(target.children)
        .map((child) => getCleanTextFromNode(child))
        .filter(Boolean);

      const [cellPos, cellPart, cellDescription] =
        parseGridRowFromCells(childValues);
      const [columnPos, columnPart, columnDescription] =
        extractGridRowValuesFromColumns(target);

      let position = cellPos || columnPos || "";
      let partNumber = cellPart || columnPart || "";
      let description = cellDescription || columnDescription || "";

      const filteredValues = childValues.filter(
        (value) => value !== "i" && value !== "?",
      );

      const posIndex = filteredValues.findIndex((value) =>
        /^(\d{1,3}|--)$/.test(value),
      );
      if (posIndex >= 0) {
        position = position || filteredValues[posIndex];
      }

      const partIndex = filteredValues.findIndex(
        (value, idx) => idx > posIndex && isLikelyPartNumber(value),
      );
      if (partIndex >= 0) {
        partNumber = partNumber || filteredValues[partIndex];
      }

      if (partIndex >= 0 && filteredValues[partIndex + 1]) {
        description = description || filteredValues[partIndex + 1];
      }

      if ((!position || !partNumber) && filteredValues.length) {
        const fullText = filteredValues.join(" ");
        const fallbackPos = fullText.match(/\b(\d{1,3}|--)\b/);
        const fallbackPart =
          fullText.match(/\b(?=.*\d)[A-Z0-9-]{7,}\b/) ||
          fullText.match(/\b\d{2}(?:\s\d{1,3}){3,}\b/);

        if (!position && fallbackPos) {
          position = fallbackPos[0];
        }
        if (!partNumber && fallbackPart) {
          partNumber = fallbackPart[0];
        }
      }

      if ((!position || !partNumber) && !childValues.length) {
        const [p, n, d] = parseGridRowFromText(getCleanTextFromNode(target));
        position = position || p;
        partNumber = partNumber || n;
        description = description || d;
      }

      if ((!position || !partNumber) && filteredValues.length) {
        const [p, n, d] = parseGridRowFromText(filteredValues.join(" "));
        position = position || p;
        partNumber = partNumber || n;
        description = description || d;
      }

      if (position || partNumber || description) {
        result.push([position, partNumber, description]);
      }
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
    customSheetRows.push(...rows);
    openCustomSheetPanel();
    renderCustomSheetRows();
    setSheetStatus(
      `${rows.length} selected row(s) added. Use Copy All Rows to paste in Google Sheets.`,
    );
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
