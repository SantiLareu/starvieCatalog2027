import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sectionIndexForPage, sectionIndexHotspots } from "../data/CatalogData";
import { SectionIndexLayer } from "./SectionIndexLayer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("sectionIndexHotspots (P27)", () => {
  it("cubre los 11 productos impresos con destino dentro de la sección", () => {
    expect(sectionIndexHotspots).toHaveLength(11);
    expect(sectionIndexForPage("page-27")).toHaveLength(11);
    for (const hotspot of sectionIndexHotspots) {
      expect(hotspot.targetPage).toBeGreaterThanOrEqual(28);
      expect(hotspot.targetPage).toBeLessThanOrEqual(37);
    }
    const targets = sectionIndexHotspots.map((hotspot) => hotspot.targetPage).sort((a, b) => a - b);
    expect(targets).toEqual([28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 37]);
  });
});

describe("SectionIndexLayer", () => {
  it("navega a la página de detalle sin modal ni catálogo", () => {
    const onNavigate = vi.fn();
    render(<SectionIndexLayer hotspots={sectionIndexForPage("page-27")} live onNavigate={onNavigate} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(11);
    expect(screen.getByText("Seleccioná un producto para verlo")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /hard eva eternal: ver en página 29/i }));
    expect(onNavigate).toHaveBeenCalledWith(29);
    fireEvent.click(screen.getByRole("button", { name: /wash bag moss: ver en página 37/i }));
    expect(onNavigate).toHaveBeenCalledWith(37);
  });

  it("permanece inerte fuera de presentación sin desmontarse", () => {
    const { rerender } = render(
      <SectionIndexLayer hotspots={sectionIndexForPage("page-27")} live onNavigate={() => undefined} />,
    );
    const layer = screen.getByRole("button", { name: /t-one pro/i }).closest(".section-index-layer");
    expect(layer).toHaveAttribute("data-live", "true");
    rerender(
      <SectionIndexLayer hotspots={sectionIndexForPage("page-27")} live={false} onNavigate={() => undefined} />,
    );
    expect(layer).toHaveAttribute("data-live", "false");
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer).toHaveAttribute("inert", "");
  });

  it("respeta cada destino aprobado y no propaga el click a la hoja", () => {
    const onNavigate = vi.fn();
    const onLeafClick = vi.fn();
    const targets = [29, 30, 28, 31, 32, 33, 34, 36, 35, 37, 37];
    render(<div onClick={onLeafClick}>
      <SectionIndexLayer hotspots={sectionIndexForPage("page-27")} live onNavigate={onNavigate} />
    </div>);
    screen.getAllByRole("button").forEach((button, index) => {
      fireEvent.click(button);
      expect(onNavigate).toHaveBeenLastCalledWith(targets[index]);
    });
    expect(onLeafClick).not.toHaveBeenCalled();
  });

  it("rechaza eventos sobre una capa no live incluso sin soporte nativo de inert", () => {
    const onNavigate = vi.fn();
    render(<SectionIndexLayer hotspots={sectionIndexForPage("page-27")} live={false} onNavigate={onNavigate} />);
    fireEvent.click(screen.getAllByRole("button", { hidden: true })[0]);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
