/**
 * Web app endpoint for appending POSTed JSON rows to the active sheet.
 *
 * Supported payload examples:
 * 1) [["01", "31 10 6 861 106", "Front axle support"]]
 * 2) {"rows": [["01", "31 10 6 861 106", "Front axle support"]]}
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        success: false,
        message: "Missing POST body",
      });
    }

    var payload = JSON.parse(e.postData.contents);
    var rows = normalizeRows(payload);

    if (!rows.length) {
      return jsonResponse({
        success: false,
        message: "No rows to append",
      });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var startRow = sheet.getLastRow() + 1;
    var numRows = rows.length;
    var numCols = rows[0].length;

    sheet.getRange(startRow, 1, numRows, numCols).setValues(rows);

    return jsonResponse({
      success: true,
      message: "Rows appended successfully",
      appended: numRows,
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: error.message,
    });
  }
}

function normalizeRows(payload) {
  var rows = Array.isArray(payload) ? payload : payload && payload.rows;

  if (!Array.isArray(rows)) {
    throw new Error(
      "Invalid JSON format: expected an array or { rows: [...] }",
    );
  }

  if (!rows.every(Array.isArray)) {
    throw new Error("Invalid rows format: each row must be an array");
  }

  if (rows.length === 0) {
    return [];
  }

  var width = rows[0].length;
  if (
    !rows.every(function (row) {
      return row.length === width;
    })
  ) {
    throw new Error("All rows must have the same number of columns");
  }

  return rows;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
