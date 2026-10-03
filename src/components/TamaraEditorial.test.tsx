import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TAMARA_BANNER_SRC, TamaraEditorial } from "./TamaraEditorial";

afterEach(() => {
  cleanup();
});

describe("TamaraEditorial", () => {
  it("muestra la fotografía oficial sin textos ni datos superpuestos", () => {
    render(<TamaraEditorial visible />);
    const photo = screen.getByRole("img", { name: /tamara icardo/i });
    expect(photo).toHaveAttribute("src", TAMARA_BANNER_SRC);
    expect(photo).toHaveAttribute("loading", "lazy");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/\$|\bARS\b/i)).toBeNull();
  });

  it("marca live solo presentada y estable, sin desmontarse", () => {
    const { rerender } = render(<TamaraEditorial visible />);
    const section = screen.getByLabelText(/t-one pro/i);
    expect(section).toHaveAttribute("data-live", "true");
    rerender(<TamaraEditorial visible={false} />);
    expect(section).toHaveAttribute("data-live", "false");
    expect(section).toHaveAttribute("aria-hidden", "true");
  });

  it("no asigna una fuente inicialmente y la conserva durante el giro una vez preparada", () => {
    const { rerender } = render(<TamaraEditorial visible={false} load={false} />);
    const photo = screen.getByRole("img", { hidden: true });
    expect(photo).not.toHaveAttribute("src");
    rerender(<TamaraEditorial visible={false} load />);
    expect(photo).toHaveAttribute("src", TAMARA_BANNER_SRC);
    rerender(<TamaraEditorial visible={false} load={false} />);
    expect(screen.getByRole("img", { hidden: true })).toBe(photo);
    expect(photo).toHaveAttribute("src", TAMARA_BANNER_SRC);
  });
});
