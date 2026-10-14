import { EXPORT_HEADERS, type ExportRow } from "./catalogExport";

/** ExcelJS is already installed for importing products; Vite selects its browser build. */
export async function createExportWorkbook(rows: readonly ExportRow[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  sheet.columns = [{ width: 24 }, { width: 36 }, { width: 22 }, { width: 24 }, { width: 16 }];
  sheet.addRow([...EXPORT_HEADERS]);
  sheet.addRows(rows.map(row => [...row]));
  sheet.getColumn(1).numFmt = "@";
  sheet.getColumn(5).numFmt = "0.00";
  sheet.eachRow(row => {
    row.height = 22;
    row.font = { name: "Arial", size: 11 };
    row.alignment = { vertical: "middle" };
  });
  const header = sheet.getRow(1);
  header.height = 26;
  header.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18191B" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  sheet.autoFilter = { from: "A1", to: "E1" };
  const bytes = await workbook.xlsx.writeBuffer();
  // Copy to a plain ArrayBuffer for Blob compatibility in both browser and tests.
  return new Uint8Array(bytes).slice().buffer;
}

export async function downloadExportWorkbook(rows: readonly ExportRow[], fileName: string): Promise<void> {
  const buffer = await createExportWorkbook(rows);
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
