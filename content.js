"use strict";

const GOOGLE_APPS_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

function addRowCheckboxes() {
  const rows = document.querySelectorAll("tbody tr");

  rows.forEach((row) => {
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
  const rows = collectSelectedRows();

  if (!rows.length) {
    alert("No rows selected");
    return;
  }

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
  }
}

function createExportButton() {
  if (document.getElementById("scrape-export-button")) {
    return;
  }

  const button = document.createElement("button");
  button.id = "scrape-export-button";
  button.textContent = "Export Selected";
  button.type = "button";

  button.style.position = "fixed";
  button.style.top = "16px";
  button.style.right = "16px";
  button.style.zIndex = "2147483647";
  button.style.padding = "10px 14px";
  button.style.backgroundColor = "#0b5ed7";
  button.style.color = "#ffffff";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";

  button.addEventListener("click", () => {
    exportSelectedRows();
  });

  document.body.appendChild(button);
}

addRowCheckboxes();
createExportButton();
console.log("Extension loaded");
