import * as XLSX from "xlsx";

export function downloadExcel(
  filename: string,
  sheets: { name: string; rows: Record<string, unknown>[] }[],
) {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(book, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  downloadBlob(filename, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export function parseSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const book = XLSX.read(data, { type: "array" });
        const sheet = book.Sheets[book.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function parseSpreadsheetAllSheets(
  file: File,
): Promise<{ sheetName: string; rows: Record<string, unknown>[] }[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const book = XLSX.read(data, { type: "array" });
        const sheets = book.SheetNames.map((name) => ({
          sheetName: name,
          rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[name], { defval: "" }),
        }));
        resolve(sheets);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    downloadBlob(filename, new Blob(["(no rows)"], { type: "text/csv" }));
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
