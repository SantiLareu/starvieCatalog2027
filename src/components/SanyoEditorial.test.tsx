import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SANYO_BANNER_SRC, SanyoEditorial } from "./SanyoEditorial";

afterEach(() => {
  cleanup();
});

describe("SanyoEditorial", () => {
  it("muestra la fotografía oficial sin textos ni datos superpuestos", () => {
    render(<SanyoEditorial visible />);
    const photo = screen.getByRole("img", { name: /sanyo gutiérrez/i });
    expect(photo).toHaveAttribute("src", SANYO_BANNER_SRC);
    expect(photo).toHaveAttribute("loading", "lazy");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/\$|\bARS\b/i)).toBeNull();
  });

  it("marca live solo presentada y estable, sin desmontarse", () => {
    const { rerender } = render(<SanyoEditorial visible />);
    const section = screen.getByLabelText(/collection eternal/i);
    expect(section).toHaveAttribute("data-live", "true");
    rerender(<SanyoEditorial visible={false} />);
    expect(section).toHaveAttribute("data-live", "false");
    expect(section).toHaveAttribute("aria-hidden", "true");
  });

  it("no asigna una fuente inicialmente y la conserva durante el giro una vez preparada", () => {
    const { rerender } = render(<SanyoEditorial visible={false} load={false} />);
    const photo = screen.getByRole("img", { hidden: true });
    expect(photo).not.toHaveAttribute("src");
    rerender(<SanyoEditorial visible={false} load />);
    expect(photo).toHaveAttribute("src", SANYO_BANNER_SRC);
    rerender(<SanyoEditorial visible={false} load={false} />);
    expect(screen.getByRole("img", { hidden: true })).toBe(photo);
    expect(photo).toHaveAttribute("src", SANYO_BANNER_SRC);
  });
});
