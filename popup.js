"use strict";

function setStatus(message) {
  const statusMessage = document.getElementById("statusMessage");
  statusMessage.textContent = message;
  statusMessage.className = "status";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openGuideButton").addEventListener("click", () => {
    setStatus(
      "Copied text is tab-separated with a header row, ready for direct paste in Google Sheets.",
    );
  });
});
