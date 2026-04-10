"use strict";

const STORAGE_KEYS = {
  appsScriptUrl: "appsScriptUrl",
  sheetUrl: "sheetUrl",
};

function setStatus(message, type) {
  const statusMessage = document.getElementById("statusMessage");
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
}

function isValidUrl(value) {
  if (!value) {
    return true;
  }

  try {
    new URL(value);
    return true;
  } catch (_error) {
    return false;
  }
}

function loadSettings() {
  chrome.storage.sync.get(
    [STORAGE_KEYS.appsScriptUrl, STORAGE_KEYS.sheetUrl],
    (result) => {
      const appsScriptUrl = result[STORAGE_KEYS.appsScriptUrl] || "";
      const sheetUrl = result[STORAGE_KEYS.sheetUrl] || "";

      document.getElementById("appsScriptUrl").value = appsScriptUrl;
      document.getElementById("sheetUrl").value = sheetUrl;
    },
  );
}

function saveSettings() {
  const appsScriptUrl = document.getElementById("appsScriptUrl").value.trim();
  const sheetUrl = document.getElementById("sheetUrl").value.trim();

  if (!appsScriptUrl) {
    setStatus("Apps Script Web App URL is required.", "error");
    return;
  }

  if (!isValidUrl(appsScriptUrl) || !isValidUrl(sheetUrl)) {
    setStatus("Please enter valid URLs.", "error");
    return;
  }

  chrome.storage.sync.set(
    {
      [STORAGE_KEYS.appsScriptUrl]: appsScriptUrl,
      [STORAGE_KEYS.sheetUrl]: sheetUrl,
    },
    () => {
      setStatus("Settings saved.", "success");
    },
  );
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  document.getElementById("saveButton").addEventListener("click", () => {
    saveSettings();
  });
});
