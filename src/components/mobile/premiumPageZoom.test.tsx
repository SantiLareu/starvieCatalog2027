import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boundPremiumZoom, pinchPremiumZoom, PREMIUM_ZOOM_CLAIM, PREMIUM_ZOOM_INITIAL, PREMIUM_ZOOM_RESET } from "./premiumPageZoom";
import { usePremiumPageZoom } from "./usePremiumPageZoom";

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(document, "elementFromPoint"); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Premium page zoom bounds and anchor", () => {
  it("anchors the same content point beneath a moving midpoint", () => {
    const next = pinchPremiumZoom({ scale: 1, x: 0, y: 0 }, { x: 150, y: 250 }, 100, 200, { x: 175, y: 260 }, 390, 670);
    expect(next).toEqual({ scale: 2, x: -125, y: -240 });
    expect((175 - next.x) / next.scale).toBe(150);
    expect((260 - next.y) / next.scale).toBe(250);
  });
  it("limits scale to 2.5, pan to the sheet, and snaps back to an exact 1x", () => {
    expect(boundPremiumZoom({ scale: 9, x: -9000, y: 80 }, 360, 600)).toEqual({ scale: 2.5, x: -540, y: 0 });
    expect(boundPremiumZoom({ scale: 1.005, x: -4, y: -7 }, 360, 600)).toBe(PREMIUM_ZOOM_INITIAL);
    expect(boundPremiumZoom({ scale: .5, x: -200, y: -300 }, 360, 600)).toBe(PREMIUM_ZOOM_INITIAL);
  });
});

describe("Encapsulated premium pinch/pan arbitration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "matchMedia").mockImplementation(media => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList));
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    Object.defineProperty(document, "elementFromPoint", { value: vi.fn(), configurable: true });
  });
  function Harness({ active = true, id = "eternal" }: { active?: boolean; id?: string }) {
    const zoom = usePremiumPageZoom(active, id);
    return <><div data-testid="viewport" ref={zoom.viewportRef}><article ref={zoom.contentRef}><button onClick={() => onProduct()}>Producto</button></article></div>
      <button onClick={zoom.reset}>Reset</button><p>{zoom.view.scale}</p></>;
  }
  const onProduct = vi.fn();
  function setup() {
    onProduct.mockReset();
    const result = render(<Harness />);
    const viewport = screen.getByTestId("viewport"), button = screen.getByRole("button", { name: "Producto" });
    Object.defineProperties(viewport, { clientWidth: { value: 390 }, clientHeight: { value: 670 } });
    viewport.getBoundingClientRect = () => ({ x: 0, y: 48, left: 0, top: 48, right: 390, bottom: 718, width: 390, height: 670, toJSON() {} });
    vi.spyOn(document, "elementFromPoint").mockReturnValue(button);
    return { ...result, viewport, button };
  }
  const point = (id: number, x: number, y: number, target: EventTarget) => ({ identifier: id, clientX: x, clientY: y, target });
  function touch(target: HTMLElement, type: string, touches: ReturnType<typeof point>[], changedTouches = touches) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
    act(() => { target.dispatchEvent(event); vi.advanceTimersByTime(16); });
    return event;
  }
  function zoomIn(button: HTMLElement) {
    touch(button, "touchstart", [point(1, 130, 300, button)]);
    touch(button, "touchstart", [point(1, 130, 300, button), point(2, 230, 300, button)], [point(2, 230, 300, button)]);
    touch(button, "touchmove", [point(1, 80, 300, button), point(2, 280, 300, button)]);
    touch(button, "touchend", [], [point(1, 80, 300, button), point(2, 280, 300, button)]);
  }
  it("passes one-finger events unchanged and claims the second finger before ancestors", () => {
    const { viewport, button } = setup();
    const bookStart = vi.fn(), claim = vi.fn();
    viewport.parentElement!.addEventListener("touchstart", bookStart, true);
    viewport.addEventListener(PREMIUM_ZOOM_CLAIM, claim);
    zoomIn(button);
    expect(bookStart).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledOnce();
    expect(viewport).toHaveAttribute("data-zoom", "2.00");
    expect(viewport.querySelector("article")!.style.transform).toContain("scale(2)");
    expect(onProduct).not.toHaveBeenCalled();
    fireEvent.click(button, { detail: 1 });
    expect(onProduct).not.toHaveBeenCalled();
  });
  it("allows a real zoomed tap but suppresses a pan begun on the same product", () => {
    const { viewport, button } = setup();
    zoomIn(button);
    touch(button, "touchstart", [point(3, 180, 300, button)]);
    touch(button, "touchend", [], [point(3, 180, 300, button)]);
    expect(onProduct).toHaveBeenCalledOnce();
    touch(button, "touchstart", [point(4, 180, 300, button)]);
    touch(button, "touchmove", [point(4, 320, 400, button)]);
    touch(button, "touchend", [], [point(4, 320, 400, button)]);
    fireEvent.click(button, { detail: 1 });
    expect(onProduct).toHaveBeenCalledOnce();
    expect(Number(viewport.dataset.panX)).toBe(-40);
    expect(Number(viewport.dataset.panY)).toBe(-152);
  });
  it("pinches back to 1x, drains the remaining finger, then returns navigation to the book", () => {
    const { viewport, button } = setup();
    zoomIn(button);
    touch(button, "touchstart", [point(5, 80, 300, button), point(6, 280, 300, button)]);
    touch(button, "touchmove", [point(5, 165, 300, button), point(6, 195, 300, button)]);
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    const firstUp = touch(button, "touchend", [point(6, 195, 300, button)], [point(5, 165, 300, button)]);
    expect(firstUp.defaultPrevented).toBe(true);
    expect(touch(button, "touchmove", [point(6, 30, 300, button)]).defaultPrevented).toBe(true);
    touch(button, "touchend", [], [point(6, 30, 300, button)]);
    expect(touch(button, "touchstart", [point(7, 180, 300, button)]).defaultPrevented).toBe(false);
    expect(onProduct).not.toHaveBeenCalled();
  });
  it("rejects a displaced release even if the browser did not deliver touchmove", () => {
    const { button } = setup();
    zoomIn(button);
    touch(button, "touchstart", [point(8, 180, 300, button)]);
    touch(button, "touchend", [], [point(8, 180, 400, button)]);
    fireEvent.click(button, { detail: 1 });
    expect(onProduct).not.toHaveBeenCalled();
  });
  it("resets on native turn, identity change, modal/inactive state and cancel", () => {
    const { viewport, button, rerender } = setup();
    zoomIn(button);
    act(() => { viewport.dispatchEvent(new Event(PREMIUM_ZOOM_RESET)); });
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    zoomIn(button); rerender(<Harness id="raptor+" />);
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    zoomIn(button); rerender(<Harness id="raptor+" active={false} />);
    expect(viewport.querySelector("article")!.style.transform).toBe("");
    expect(touch(button, "touchstart", [point(1, 80, 300, button), point(2, 280, 300, button)]).defaultPrevented).toBe(false);
    rerender(<Harness id="raptor+" />); zoomIn(button);
    touch(button, "touchstart", [point(9, 180, 300, button)]);
    touch(button, "touchcancel", [], [point(9, 180, 300, button)]);
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
  });
  it("does not own gestures outside the viewport or when portrait eligibility is false", () => {
    const { viewport, button, rerender } = setup();
    const outside = screen.getByRole("button", { name: "Reset" });
    expect(touch(outside, "touchstart", [point(1, 90, 300, button), point(2, 260, 20, outside)]).defaultPrevented).toBe(false);
    vi.spyOn(window, "matchMedia").mockImplementation(media => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList));
    rerender(<Harness active={false} />); rerender(<Harness />);
    expect(touch(button, "touchstart", [point(1, 80, 300, button), point(2, 280, 300, button)]).defaultPrevented).toBe(false);
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
  });
});
