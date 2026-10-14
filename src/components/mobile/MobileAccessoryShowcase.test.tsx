import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import catalog from "../../../generated/products.json";
import type { CommerceProduct } from "../../commerce/types";
import { mobileAccessoryShowcaseGroups, MOBILE_ACCESSORY_SHOWCASE_PAGE } from "../../data/mobileAccessoryShowcase";
import { MobileAccessoryShowcase } from "./MobileAccessoryShowcase";

afterEach(cleanup);
const products = catalog.products as CommerceProduct[];
const items = mobileAccessoryShowcaseGroups.flatMap(group => group.items);

describe("P38 portrait accessory showcase", () => {
  it("keeps all nine actual commercial identities on the existing last product leaf", () => {
    expect(MOBILE_ACCESSORY_SHOWCASE_PAGE).toBe(38);
    expect(items).toHaveLength(9);
    expect(new Set(items.map(item => item.productId)).size).toBe(9);
    for (const item of items) {
      expect(products.find(product => product.id === item.productId)).toMatchObject({pagina:38,categoria:"accesorio"});
      expect(item.image).toMatch(/^mobile\/.+\.webp$/);
    }
    expect(items.map(item => item.title)).toContain("Power Balance");
    expect(items.map(item => item.title)).toContain("Tacky Touch");
  });
  it("renders six semantic categories, editable text and two native modal actions per product", () => {
    const {container} = render(<MobileAccessoryShowcase products={products} active live load />);
    expect(screen.getByRole("heading", {level:1})).toHaveTextContent("COMPLETÁTU JUEGO");
    expect(screen.getAllByRole("region").map(node => node.getAttribute("aria-label"))).toEqual(mobileAccessoryShowcaseGroups.map(group => group.category));
    for (const item of items) {
      const product = products.find(product => product.id === item.productId)!;
      const explore = screen.getByRole("button", {name:`Explorar ${product.nombre}`});
      expect(explore).toHaveAttribute("data-product-id",item.productId);
      expect(within(explore).getByRole("img", {name:item.title})).toHaveAttribute("data-showcase-source",item.image);
      expect(screen.getByRole("button", {name:`Ver ficha y opciones de pedido de ${product.nombre}`})).toHaveAttribute("data-product-id",item.productId);
    }
    expect(container.querySelectorAll("button[data-product-id]")).toHaveLength(18);
  });
  it("does not substitute another identity for a removed product, and permits exploring unavailable stock", () => {
    const changed = products.filter(product => product.id !== "black cap").map(product => product.id === "key ring" ? {...product,disponible:false} : product);
    render(<MobileAccessoryShowcase products={changed} active live load />);
    screen.getAllByRole("button", {name:"Black Cap: producto no disponible"}).forEach(button => {
      expect(button).toBeDisabled(); expect(button).not.toHaveAttribute("data-product-id");
    });
    expect(screen.getByRole("button", {name:"Explorar Key Ring"})).toBeEnabled();
  });
  it("defers all nine photos and disables all actions when the leaf is offscreen", () => {
    const {container} = render(<MobileAccessoryShowcase products={products} active={false} live={false} load={false} />);
    expect(container.querySelectorAll("[data-showcase-source]")).toHaveLength(0);
    expect(screen.getAllByRole("button")).toHaveLength(18);
    screen.getAllByRole("button").forEach(button => expect(button).toBeDisabled());
  });
});
