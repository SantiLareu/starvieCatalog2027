import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoPage } from "./VideoPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VideoPage", () => {
  it("muestra fallback y no monta el video mientras la hoja está fuera de pantalla", () => {
    render(<VideoPage src="/catalog/video/collection-2027.mp4" visible={false} />);
    expect(screen.getByText("COLLECTION 2027")).toBeVisible();
    expect(document.querySelector("video")).toBeNull();
  });

  it("usa el MP4 configurado con atributos seguros sólo cuando está visible", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { rerender } = render(
      <VideoPage src="/catalog/video/collection-2027.mp4" visible />,
    );
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "/catalog/video/collection-2027.mp4");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect((video as HTMLVideoElement).autoplay).toBe(true);
    const copy = video!.cloneNode(true) as HTMLVideoElement;
    expect(copy).toHaveAttribute("muted");
    expect(copy.defaultMuted).toBe(true);

    rerender(<VideoPage src="/catalog/video/collection-2027.mp4" visible={false} />);
    expect(document.querySelector("video")).toBeNull();
  });

  it("pausa la hoja saliente y recupera la misma instancia al cancelar, sin reactivar por canplay", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { rerender } = render(<VideoPage src="/videos/news.mp4" visible />);
    const video = document.querySelector("video")!;
    video.currentTime = 2;
    play.mockClear();
    pause.mockClear();
    rerender(<VideoPage src="/videos/news.mp4" visible playbackAllowed={false} />);
    expect(document.querySelector("video")).toBe(video);
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(pause).toHaveBeenCalled();
    fireEvent.canPlay(video);
    expect(play).not.toHaveBeenCalled();
    rerender(<VideoPage src="/videos/news.mp4" visible />);
    expect(document.querySelector("video")).toBe(video);
    expect(video.currentTime).toBe(2);
    expect(video.autoplay).toBe(true);
    expect(play).toHaveBeenCalledOnce();
  });
});
