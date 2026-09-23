import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductModal, assetUrl } from "./ProductModal";
import type { CommerceProduct } from "../commerce/types";

afterEach(() => cleanup());

const raptor: CommerceProduct = {
  id: "raptor-plus",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 320,
  disponible: true,
  imagenes: ["products/palas/RAPTOR+/RAPTOR1.3.webp"],
  gama: "Super Pro · Profesional y semi pro",
  tipoJuego: "Versátil",
  forma: "Lágrima",
  plano: "3D Carbon",
  peso: "350–370 g",
  balance: "Medio",
  ean: "8436612942025",
  pagina: 17,
};

const props = {
  product: raptor,
  pageSrc: "/catalog/pages/page-17.webp",
  pageNumber: 17,
  cartQty: 0,
  onAdd: vi.fn(),
  onClose: vi.fn(),
};

describe("ProductModal comercial", () => {
  it("muestra precio, disponibilidad e imágenes desde el catálogo y agrega al pedido", () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(<ProductModal {...props} onAdd={onAdd} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Raptor+" })).toBeVisible();
    expect(screen.getByText("320,00 $")).toBeVisible();
    expect(screen.getByText("Con stock")).toBeVisible();
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Agregar una unidad" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
    expect(onAdd).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it("no muestra el número de página en la ficha", () => {
    render(<ProductModal {...props} />);
    expect(screen.queryByText("Pág. 17")).toBeNull();
  });

  it("disponible=false: visible con Sin stock pero no comprable", () => {
    render(<ProductModal {...props} product={{ ...raptor, disponible: false }} />);
    expect(screen.getByRole("dialog", { name: "Raptor+" })).toBeVisible();
    expect(screen.getAllByText("Sin stock").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Sin stock" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Agregar al pedido" })).toBeNull();
  });

  it("la cantidad puede superar 6, 8 y 10 sin tope de inventario", () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(<ProductModal {...props} product={{ ...raptor }} cartQty={0} onAdd={onAdd} onClose={onClose} />);
    const more = screen.getByRole("button", { name: "Agregar una unidad" });
    const qtyGroup = screen.getByRole("group", { name: "Cantidad" });
    for (let expected = 2; expected <= 12; expected += 1) {
      expect(more).toBeEnabled();
      fireEvent.click(more);
      expect(qtyGroup).toHaveTextContent(String(expected));
    }
    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
    expect(onAdd).toHaveBeenCalledWith(12);
  });

  it("no muestra mensajes de cantidad máxima ni topes", () => {
    render(<ProductModal {...props} product={{ ...raptor }} cartQty={6} />);
    const dialog = screen.getByRole("dialog", { name: "Raptor+" });
    expect(dialog).not.toHaveTextContent(/Cantidad máxima disponible/);
    expect(dialog).not.toHaveTextContent(/Stock máximo/);
    expect(dialog).not.toHaveTextContent(/unidades disponibles/);
    expect(screen.getByRole("button", { name: "Agregar una unidad" })).toBeEnabled();
  });

  it("se cierra con Escape", () => {
    const onClose = vi.fn();
    render(<ProductModal {...props} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("navega la galería con botones y teclado, respetando los extremos", () => {
    render(
      <ProductModal
        {...props}
        product={{
          ...raptor,
          imagenes: [
            "products/palas/RAPTOR+/front.webp",
            "products/palas/RAPTOR+/side.webp",
            "products/palas/RAPTOR+/back.webp",
          ],
        }}
      />,
    );

    const previous = screen.getByRole("button", { name: "Imagen anterior" });
    const next = screen.getByRole("button", { name: "Imagen siguiente" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    expect(screen.getByAltText(/imagen 1 de 3/)).toBeVisible();

    fireEvent.click(next);
    expect(screen.getByAltText(/imagen 2 de 3/)).toBeVisible();
    expect(previous).toBeEnabled();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByAltText(/imagen 3 de 3/)).toBeVisible();
    expect(next).toBeDisabled();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByAltText(/imagen 2 de 3/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Ver imagen 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("expone controles accesibles y respeta zoom 1×–4×, reducción y reset", () => {
    render(<ProductModal {...props} />);
    const viewport = document.querySelector(".product-image-viewport");
    const zoomInButton = screen.getByRole("button", { name: "Acercar imagen" });
    const zoomOutButton = screen.getByRole("button", { name: "Alejar imagen" });
    const resetButton = screen.getByRole("button", { name: "Restablecer zoom" });

    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    expect(zoomOutButton).toBeDisabled();
    expect(resetButton).toBeDisabled();

    fireEvent.click(zoomInButton);
    expect(viewport).toHaveAttribute("data-zoom", "1.50");
    expect(zoomOutButton).toBeEnabled();
    expect(resetButton).toHaveTextContent("1.5×");

    fireEvent.click(zoomOutButton);
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    fireEvent.click(zoomOutButton);
    expect(viewport).toHaveAttribute("data-zoom", "1.00");

    for (let step = 0; step < 8; step += 1) fireEvent.click(zoomInButton);
    expect(viewport).toHaveAttribute("data-zoom", "4.00");
    expect(zoomInButton).toBeDisabled();
    fireEvent.click(zoomInButton);
    expect(viewport).toHaveAttribute("data-zoom", "4.00");

    fireEvent.click(resetButton);
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    expect(resetButton).toHaveTextContent("1×");
  });

  it("resetea zoom y pan al cambiar imagen y conserva los atajos de teclado", () => {
    render(
      <ProductModal
        {...props}
        product={{
          ...raptor,
          imagenes: ["products/palas/RAPTOR+/front.webp", "products/palas/RAPTOR+/back.webp"],
        }}
      />,
    );
    const viewport = document.querySelector(".product-image-viewport");
    fireEvent.keyDown(window, { key: "+" });
    fireEvent.keyDown(window, { key: "+" });
    expect(viewport).toHaveAttribute("data-zoom", "2.00");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByAltText(/imagen 2 de 2/)).toBeVisible();
    expect(viewport).toHaveAttribute("data-zoom", "1.00");

    fireEvent.click(screen.getByRole("button", { name: "Acercar imagen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver imagen 1" }));
    expect(screen.getByAltText(/imagen 1 de 2/)).toBeVisible();
    expect(viewport).toHaveAttribute("data-zoom", "1.00");

    fireEvent.keyDown(window, { key: "=" });
    expect(viewport).toHaveAttribute("data-zoom", "1.50");
    fireEvent.keyDown(window, { key: "-" });
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    fireEvent.keyDown(window, { key: "+" });
    fireEvent.keyDown(window, { key: "0" });
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
  });

  it("soporta más de cuatro imágenes sin limitar miniaturas, flechas, teclado ni zoom", () => {
    const imagenes = Array.from(
      { length: 8 },
      (_, index) => `products/palas/RAPTOR+/detail-${index + 1}.webp`,
    );
    render(<ProductModal {...props} product={{ ...raptor, imagenes }} />);

    const thumbnails = screen.getAllByRole("button", { name: /Ver imagen \d+/ });
    const viewport = document.querySelector(".product-image-viewport");
    expect(thumbnails).toHaveLength(8);

    fireEvent.click(screen.getByRole("button", { name: "Ver imagen 7" }));
    expect(screen.getByAltText(/imagen 7 de 8/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Acercar imagen" }));
    expect(viewport).toHaveAttribute("data-zoom", "1.50");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByAltText(/imagen 8 de 8/)).toBeVisible();
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    expect(screen.getByRole("button", { name: "Imagen siguiente" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Imagen anterior" }));
    expect(screen.getByAltText(/imagen 7 de 8/)).toBeVisible();
  });

  it("disponible: clase semántica verde", () => {
    // El modal usa un portal: se consulta document, no container.
    render(<ProductModal {...props} />);
    const line = document.querySelector(".stock-line");
    expect(line?.querySelector(".in-stock")?.textContent).toBe("Con stock");
    expect(line?.querySelector(".out-of-stock")).toBeNull();
  });

  it("no disponible: clase semántica roja", () => {
    render(<ProductModal {...props} product={{ ...raptor, disponible: false }} />);
    expect(document.querySelector(".stock-line .out-of-stock")?.textContent).toBe("Sin stock");
    expect(document.querySelector(".stock-line .in-stock")).toBeNull();
  });
});

describe("ProductModal genérico (no palas)", () => {
  const paletero: CommerceProduct = {
    id: "tour-bag",
    sku: "PSTTB00100",
    nombre: "Tour Bag",
    categoria: "bolsos",
    subcategoria: "paleteros",
    precio: 120,
    disponible: true,
    imagenes: ["products/bolsos/TOUR BAG/Negro/frontal.jpeg"],
    gama: "",
    tipoJuego: "",
    forma: "",
    plano: "",
    peso: "",
    balance: "",
    ean: "",
    pagina: 30,
  };

  it("muestra nombre, SKU, precio y compra sin bloques técnicos vacíos", () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(
      <ProductModal
        product={paletero}
        pageSrc="/catalog/pages/page-30.webp"
        pageNumber={30}
        cartQty={0}
        onAdd={onAdd}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Tour Bag" });
    expect(dialog).toBeVisible();
    expect(screen.getByText("120,00 $")).toBeVisible();
    expect(screen.getByText("Con stock")).toBeVisible();
    expect(screen.getByText("PSTTB00100", { selector: "dd" })).toBeVisible();
    // Sin campos técnicos de pala: ningún bloque vacío ni etiqueta huérfana.
    expect(dialog).not.toHaveTextContent("Tipo de juego");
    expect(dialog).not.toHaveTextContent("Forma");
    expect(dialog).not.toHaveTextContent("Plano");
    expect(dialog).not.toHaveTextContent("Peso");
    expect(dialog).not.toHaveTextContent("Balance");
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
    expect(onAdd).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("un accesorio no disponible se ve pero no se puede agregar", () => {
    render(
      <ProductModal
        {...props}
        product={{ ...paletero, id: "llavero", nombre: "Llavero", disponible: false, imagenes: [] }}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Llavero" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sin stock" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Agregar al pedido" })).toBeNull();
  });
});

describe("assetUrl: encoding de rutas con + y espacios", () => {
  it("codifica + y espacios por segmento sin tocar los separadores", () => {
    expect(assetUrl("products/palas/RAPTOR+/RAPTOR1.3.webp")).toContain(
      "products/palas/RAPTOR%2B/RAPTOR1.3.webp",
    );
    expect(assetUrl("products/palas/RAPTOR 2027/front.webp")).toContain(
      "products/palas/RAPTOR%202027/front.webp",
    );
    expect(assetUrl("products/bolsos/TOUR BAG/Negro/frontal.jpeg")).toContain(
      "products/bolsos/TOUR%20BAG/Negro/frontal.jpeg",
    );
  });

  it("deja intactas las rutas simples", () => {
    expect(assetUrl("products/palas/raptor/front.webp")).toContain("products/palas/raptor/front.webp");
  });

  it("el modal renderiza la imagen principal codificada", () => {
    render(<ProductModal {...props} />);
    const main = screen.getByAltText(/Raptor\+, imagen 1 de/);
    expect(main.getAttribute("src")).toContain("products/palas/RAPTOR%2B/RAPTOR1.3.webp");
  });
});
