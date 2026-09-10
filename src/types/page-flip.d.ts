declare module "page-flip" {
  type PageFlipEvent = { data: unknown; object: PageFlip };
  type PageFlipCorner = "top" | "bottom";
  type PageFlipCalculation = { getDirection(): number };
  type PageFlipController = { getCalculation(): PageFlipCalculation | null };

  type PageFlipSettings = {
    width: number;
    height: number;
    size?: "fixed" | "stretch";
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startPage?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    swipeDistance?: number;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
  };

  export class PageFlip {
    constructor(root: HTMLElement, settings: PageFlipSettings);
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    getSettings(): PageFlipSettings & { showPageCorners: boolean };
    on(event: "flip" | "changeOrientation" | "init" | "update" | "changeState", callback: (event: PageFlipEvent) => void): void;
    flipNext(corner?: PageFlipCorner): void;
    flipPrev(corner?: PageFlipCorner): void;
    flip(pageNumber: number, corner?: PageFlipCorner): void;
    turnToPage(pageNumber: number): void;
    getCurrentPageIndex(): number;
    getFlipController(): PageFlipController;
    destroy(): void;
  }
}
