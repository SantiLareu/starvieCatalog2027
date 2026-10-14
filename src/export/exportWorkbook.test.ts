import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { createExportWorkbook, downloadExportWorkbook } from "./exportWorkbook";
import { EXPORT_HEADERS, type ExportRow } from "./catalogExport";

const rows: ExportRow[] = [["000123", "=literal", "palas", "super-pro", 1234.5], [null, "Zero", "bolsos", "", 0], ["X", "Pending", "", "", null]];

describe("real XLSX generation", () => {
  it("round-trips one Productos sheet, exactly five columns, text SKU and numeric zero", async () => {
    const before = JSON.stringify(rows);
    const bytes = await createExportWorkbook(rows);
    expect([...new Uint8Array(bytes).slice(0, 2)]).toEqual([80, 75]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["Productos"]);
    const sheet = workbook.getWorksheet("Productos")!;
    expect(sheet.rowCount).toBe(4);
    expect(sheet.columnCount).toBe(5);
    expect(sheet.getRow(1).values).toEqual([undefined, ...EXPORT_HEADERS]);
    expect(sheet.getCell("A2").value).toBe("000123");
    expect(sheet.getCell("A2").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell("A3").value).toBeNull();
    expect(sheet.getCell("B2").value).toBe("=literal");
    expect(sheet.getCell("B2").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell("E2").value).toBe(1234.5);
    expect(sheet.getCell("E3").value).toBe(0);
    expect(sheet.getCell("E3").type).toBe(ExcelJS.ValueType.Number);
    expect(sheet.getCell("E4").value).toBeNull();
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("downloads and releases the blob URL", async () => {
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("starvie-2027-productos.xlsx");
      expect(this.href).toBe("blob:test");
    });
    try {
      await downloadExportWorkbook(rows, "starvie-2027-productos.xlsx");
      expect(click).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      expect(document.querySelector('a[download]')).toBeNull();
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:test"), { timeout: 2000 });
    } finally { vi.unstubAllGlobals(); click.mockRestore(); }
  });
});
