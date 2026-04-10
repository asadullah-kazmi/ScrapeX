"use strict";

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

addRowCheckboxes();
console.log("Extension loaded");
