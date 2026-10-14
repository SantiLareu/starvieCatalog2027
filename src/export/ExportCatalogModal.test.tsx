import { createRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommerceCatalog, CommerceProduct } from "../commerce/types";
import ExportCatalogModal from "./ExportCatalogModal";
import { downloadExportWorkbook } from "./exportWorkbook";

vi.mock("./exportWorkbook", () => ({ downloadExportWorkbook: vi.fn().mockResolvedValue(undefined) }));
const catalog: CommerceCatalog = { schemaVersion: 1, products: [
  { id: "A", nombre: "A", sku: "", categoria: "palas", subcategoria: "pro", precio: 0, disponible: false },
  { id: "B", nombre: "B", sku: "001", categoria: "bolsos", subcategoria: "tour", precio: 10, disponible: true },
] as CommerceProduct[] };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("export modal", () => {
  it("shows complete scope and downloads the selected category", async () => {
    const close = vi.fn();
    render(<ExportCatalogModal catalog={catalog} onClose={close} openerRef={createRef()} />);
    expect(screen.getByText("2 productos")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Por categoría"));
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "palas" } });
    expect(screen.getByText("1 producto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descargar Excel" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(downloadExportWorkbook).toHaveBeenCalledWith([[null, "A", "palas", "pro", 0]], "starvie-2027-palas.xlsx");
  });
  it("reconciles category and subcategory with new live catalog data", async () => {
    const props = { onClose: vi.fn(), openerRef: createRef<HTMLButtonElement>() };
    const view = render(<ExportCatalogModal catalog={catalog} {...props} />);
    fireEvent.click(screen.getByLabelText("Por categoría y subcategoría"));
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "palas" } });
    expect(screen.getByLabelText("Subcategoría")).toHaveValue("pro");
    const updated: CommerceCatalog = { schemaVersion: 1, products: [{ ...catalog.products[0], categoria: "nueva", subcategoria: "edición" }] };
    view.rerender(<ExportCatalogModal catalog={updated} {...props} />);
    await waitFor(() => expect(screen.getByLabelText("Categoría")).toHaveValue("nueva"));
    expect(screen.getByLabelText("Subcategoría")).toHaveValue("edición");
    fireEvent.click(screen.getByRole("button", { name: "Descargar Excel" }));
    await waitFor(() => expect(downloadExportWorkbook).toHaveBeenCalledWith([[null, "A", "nueva", "edición", 0]], "starvie-2027-nueva-edicion.xlsx"));
  });
  it("disables empty exports, closes on Escape and restores focus", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    const openerRef = { current: opener };
    const close = vi.fn();
    const view = render(<ExportCatalogModal catalog={{ schemaVersion: 1, products: [] }} onClose={close} openerRef={openerRef} />);
    expect(screen.getByRole("button", { name: "Descargar Excel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar exportación" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
  it("blocks duplicate generation and allows retry after failure", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(downloadExportWorkbook).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const close = vi.fn();
    render(<ExportCatalogModal catalog={catalog} onClose={close} openerRef={createRef()} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar Excel" }));
    expect(screen.getByRole("button", { name: "Generando Excel…" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    reject(new Error("failed"));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Descargar Excel" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(downloadExportWorkbook).toHaveBeenCalledTimes(2);
  });
});
