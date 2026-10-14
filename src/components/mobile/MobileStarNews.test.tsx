import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileStarNews } from "./MobileStarNews";
import { MobilePremiumProductPage } from "./MobilePremiumProductPage";
import { mobileProductPresentation } from "../../data/mobileProductPresentation";
import catalog from "../../../generated/products.json";
import type { CommerceProduct } from "../../commerce/types";
import { starNewsArticles } from "../../data/starNewsContent";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("mobile court and configurable news", () => {
  it("uses real live product photos on the court without copying gallery or specs", () => {
    const product = catalog.products.find(item => item.id === "eternal")! as CommerceProduct;
    const { container } = render(<MobilePremiumProductPage product={product} presentation={mobileProductPresentation.eternal} load live courtScene />);
    const image = screen.getByRole("img", { name: product.nombre });
    expect(image).toHaveAttribute("data-mobile-hero-source", product.imagenes[0]);
    expect(container.querySelectorAll('.mobile-court-scene--product')).toHaveLength(1);
    expect(container.querySelector('.mobile-premium-product-page__scene')).toBeNull();
    expect(container.querySelectorAll('button[data-product-id="eternal"]')).toHaveLength(3);
    expect(container.querySelector('.mobile-premium-product-page__technical')).toHaveTextContent(/18K CARBON.*350[–-]370 GR/);
  });
  it("keeps the video muted and paused on departure, including a late canplay event", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { rerender } = render(<MobileStarNews videoSrc="/videos/news.mp4" visible />);
    const video = document.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect((video.cloneNode() as HTMLVideoElement).defaultMuted).toBe(true);
    play.mockClear(); pause.mockClear();
    rerender(<MobileStarNews videoSrc="/videos/news.mp4" visible playbackAllowed={false} />);
    fireEvent.canPlay(video);
    expect(pause).toHaveBeenCalled(); expect(play).not.toHaveBeenCalled();
    rerender(<MobileStarNews videoSrc="/videos/news.mp4" visible={false} />);
    expect(document.querySelector("video")).toBeNull();
  });
  it("renders a configured gallery or image without related stories or a video CTA", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { rerender } = render(<MobileStarNews videoSrc="/videos/news.mp4" visible articles={[starNewsArticles[1]]} />);
    const page = screen.getByTestId("mobile-star-news");
    expect(screen.getByTestId("mobile-star-news")).toBe(page);
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("img", { name: "Eternal, vista frontal" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Imagen siguiente" }));
    expect(screen.getByRole("img", { name: "Eternal, detalle de la pala" })).toBeVisible();
    rerender(<MobileStarNews videoSrc="/videos/news.mp4" visible articles={[starNewsArticles[2]]} />);
    expect(screen.getByRole("img", { name: "Raptor+ 2027" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Imagen siguiente" })).toBeNull();
    expect(screen.queryByText("MÁS NOTICIAS")).toBeNull();
    expect(screen.queryByText("VER VIDEO")).toBeNull();
  });
  it("respects an independently configured main video instead of hardcoding the book source", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    render(<MobileStarNews visible videoSrc="/videos/news.mp4" articles={[{
      id: "collection", category: "STARNEWS", title: "Otro video", description: "Nueva edición",
      thumbnail: "catalog/thumbnails/page-01.webp", media: { kind: "video", src: "/videos/replacement.mp4" },
    }]} />);
    expect(document.querySelector("video")).toHaveAttribute("src", "/videos/replacement.mp4");
  });
  it("hides the playback overlay while playing and restores the play control on pause", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    render(<MobileStarNews visible videoSrc="/videos/news.mp4" />);
    const video = document.querySelector("video")!;
    fireEvent.play(video);
    expect(screen.getByRole("button", { name: "Pausar video de StarNews" })).toHaveClass("is-playing");
    fireEvent.pause(video);
    expect(screen.getByRole("button", { name: "Reproducir video de StarNews" })).not.toHaveClass("is-playing");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
