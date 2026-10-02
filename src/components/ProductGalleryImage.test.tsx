import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductGalleryImage } from "./ProductGalleryImage";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const first = { source: "products/palas/ETERNAL/ETERNAL1.4.webp", original: "/original-1.webp", alt: "imagen 1" };
const second = { source: "products/palas/ETERNAL/ETERNAL1.3.webp", original: "/original-2.webp", alt: "imagen 2" };
const third = { source: "products/palas/ETERNAL/ETERNAL1.2.webp", original: "/original-3.webp", alt: "imagen 3" };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function load(image: HTMLElement, promise = Promise.resolve()) {
  Object.defineProperty(image, "decode", { value: () => promise, configurable: true });
  fireEvent.load(image);
}

describe("transición de galería", () => {
  it("no demora ni anima la primera imagen", () => {
    render(<ProductGalleryImage {...first} />);
    expect(screen.getByAltText("imagen 1")).not.toHaveClass("is-pending", "is-entering");
    expect(document.querySelectorAll("img")).toHaveLength(1);
  });

  it("mantiene el mismo DOM decodificado hasta que la siguiente esté lista y limpia el fade", async () => {
    const { rerender } = render(<ProductGalleryImage {...first} />);
    const previous = screen.getByAltText("imagen 1");
    rerender(<ProductGalleryImage {...second} />);
    const next = screen.getByAltText("imagen 2");
    expect(previous.isConnected).toBe(true);
    expect(previous).toHaveClass("is-retained");
    expect(next).toHaveClass("is-pending");
    const decoding = deferred();
    load(next, decoding.promise);
    expect(next).toHaveClass("is-pending");
    await act(async () => decoding.resolve());
    expect(screen.getByAltText("imagen 2")).toBe(next);
    expect(next).toHaveClass("is-entering");
    expect(previous).toHaveClass("is-retiring");
    // JSDOM lacks AnimationEvent, so React selects its WebKit event name.
    const end = new Event("webkitAnimationEnd", { bubbles: true });
    Object.defineProperty(end, "animationName", { value: "product-gallery-in" });
    fireEvent(next, end);
    expect(previous.isConnected).toBe(false);
    expect(document.querySelectorAll("img")).toHaveLength(1);
  });

  it("ignora una decodificación tardía al navegar rápidamente, sin acumular imágenes", async () => {
    const { rerender } = render(<ProductGalleryImage {...first} />);
    rerender(<ProductGalleryImage {...second} />);
    const delayed = deferred();
    load(screen.getByAltText("imagen 2"), delayed.promise);
    rerender(<ProductGalleryImage {...third} />);
    await act(async () => delayed.resolve());
    expect(screen.getByAltText("imagen 3")).toHaveClass("is-pending");
    expect(document.querySelectorAll("img")).toHaveLength(2);
    await act(async () => load(screen.getByAltText("imagen 3")));
    expect(screen.getByAltText("imagen 3")).toHaveClass("is-entering");
  });

  it("reduced-motion sustituye la imagen lista sin animación ni capa retenida", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { rerender } = render(<ProductGalleryImage {...first} />);
    rerender(<ProductGalleryImage {...second} />);
    await act(async () => load(screen.getByAltText("imagen 2")));
    expect(screen.getByAltText("imagen 2")).not.toHaveClass("is-entering", "is-pending");
    expect(document.querySelectorAll("img")).toHaveLength(1);
  });

  it("un error de la capa anterior no retira la nueva imagen; conserva su fallback independiente", () => {
    const oldError = vi.fn();
    const nextError = vi.fn();
    const { rerender } = render(<ProductGalleryImage {...first} onError={oldError} />);
    const oldImage = screen.getByAltText("imagen 1");
    rerender(<ProductGalleryImage {...second} onError={nextError} />);
    fireEvent.error(oldImage);
    fireEvent.error(oldImage);
    expect(oldError).not.toHaveBeenCalled();
    expect(nextError).not.toHaveBeenCalled();
    const next = screen.getByAltText("imagen 2");
    fireEvent.error(next);
    expect(next).toHaveAttribute("src", second.original);
    expect(nextError).not.toHaveBeenCalled();
    fireEvent.error(next);
    expect(nextError).toHaveBeenCalledOnce();
  });
});
