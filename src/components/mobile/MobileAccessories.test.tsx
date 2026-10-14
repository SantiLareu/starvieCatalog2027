import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import catalog from "../../../generated/products.json";
import type { CommerceProduct } from "../../commerce/types";
import { mobileAccessoryPresentations, mobileAccessorySections, mobileNecessairesPresentation } from "../../data/mobileAccessoryPresentation";
import { MobileAccessoriesIndex, MobileAccessoryProductPage, MobileAccessoryPairPage } from "./MobileAccessories";

afterEach(cleanup);
const products = catalog.products as CommerceProduct[];
const presentation = mobileAccessoryPresentations[0];
const product = products.find(item => item.id === presentation.productId)!;

describe("mobile accessories share the live catalog and native book actions", () => {
  it("presents Navy then Moss on one P37 leaf with six independent native modal actions", () => {
    expect(mobileNecessairesPresentation).toMatchObject({pageId:37,category:"NECESERES",products:[
      {productId:"neceser navy",title:"NAVY",image:"mobile/neceser-navy.webp",materials:"PVC RUBBER",ref:"NSTNAVY51000",ean:"8436612942216"},
      {productId:"neceser moss",title:"MOSS",image:"mobile/neceser-moss.webp",materials:"PVC RUBBER",ref:"NSTMOSS51000",ean:"8436612942223"},
    ]});
    const {container}=render(<MobileAccessoryPairPage presentation={mobileNecessairesPresentation} products={products} active live load />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading",{level:1})).toHaveTextContent("NECESERES");
    expect(screen.getAllByRole("region").map(node=>node.getAttribute("aria-label"))).toEqual(["NAVY","MOSS"]);
    for(const item of mobileNecessairesPresentation.products) {
      const original=products.find(product=>product.id===item.productId)!;
      expect(original).toMatchObject({sku:item.ref,pagina:37,subcategoria:"neceser"});
      const region=screen.getByRole("region",{name:item.title});
      expect(within(region).getByRole("img",{name:item.title})).toHaveAttribute("data-accessory-hero-source",item.image);
      expect(region).toHaveTextContent(`REF: ${item.ref}EAN: ${item.ean}`);
      expect(region.querySelector("dd")).toHaveTextContent("PVC RUBBER");
      for(const name of [`Abrir ficha de ${original.nombre}`,`Ver ficha y opciones de pedido de ${original.nombre}`,`Explorar ${original.nombre}`])
        expect(within(region).getByRole("button",{name})).toHaveAttribute("data-product-id",item.productId);
    }
    expect(container.querySelectorAll("button[data-product-id]")).toHaveLength(6);
  });
  it("keeps both existing accessory index cards targeting the same P37", () => {
    const navigate=vi.fn();
    render(<MobileAccessoriesIndex products={products} active live load onNavigate={navigate} />);
    for(const name of ["Neceser Navy: ver en página 37","Neceser Moss: ver en página 37"])
      fireEvent.click(screen.getByRole("button",{name}));
    expect(navigate.mock.calls).toEqual([[37],[37]]);
  });
  it("disables only a removed product while keeping the other unavailable product explorable", () => {
    const updated=products.filter(product=>product.id!=="neceser navy").map(product=>product.id==="neceser moss" ? {...product,disponible:false} : product);
    render(<MobileAccessoryPairPage presentation={mobileNecessairesPresentation} products={updated} active live load />);
    within(screen.getByRole("region",{name:"NAVY"})).getAllByRole("button").forEach(button=>expect(button).toBeDisabled());
    within(screen.getByRole("region",{name:"MOSS"})).getAllByRole("button").forEach(button=>{
      expect(button).toBeEnabled(); expect(button).toHaveAttribute("data-product-id","neceser moss");
    });
  });
  it("defers both photographs and disables all six controls when the leaf is not live", () => {
    const {container}=render(<MobileAccessoryPairPage presentation={mobileNecessairesPresentation} products={products} active={false} live={false} load={false} />);
    expect(container.querySelectorAll("[data-accessory-hero-source]")).toHaveLength(0);
    expect(screen.getAllByRole("button")).toHaveLength(6);
    screen.getAllByRole("button").forEach(button=>expect(button).toBeDisabled());
  });
  it("registers Black Voltage on P36 with exact data and the three original modal actions", () => {
    const voltage=mobileAccessoryPresentations.find(item=>item.pageId===36)!;
    const original=products.find(item=>item.id==="black voltage")!;
    expect(original).toMatchObject({sku:"MSTBV51000",pagina:36,nombre:"Mochila Black Voltage",categoria:"mochila"});
    expect(voltage).toMatchObject({productId:original.id,category:"MOCHILAS",title:"BLACK VOLTAGE",
      image:"mobile/black-voltage-backpack.webp",ref:"MSTBV51000",ean:"8436612942193"});
    expect(voltage.features).toEqual([
      {title:"GRAN CAPACIDAD DE ALMACENAMIENTO",description:""},
      {title:"REFUERZO EXTRA EN SUS ASAS",description:""},
      {title:"STORAGE COMPARTMENTS FOR SMALL ITEMS",description:""},
      {title:"COMPARTIMENTO PARA PORTÁTIL",description:""},
    ]);
    expect(voltage.specs).toEqual([["DIMENSIONES","50X32X18,5 CM"],["MATERIALES","POLIESTER Y PVC"]]);
    const {container}=render(<MobileAccessoryProductPage presentation={voltage} product={original} active live load />);
    expect(screen.getByRole("heading",{name:"BLACK VOLTAGE"})).toBeVisible();
    expect(screen.getByRole("region",{name:"Características de la mochila"})).toBeVisible();
    expect(screen.getByRole("img",{name:"BLACK VOLTAGE"})).toHaveAttribute("data-accessory-hero-source",voltage.image);
    expect(container.querySelector("footer")).toHaveTextContent("REF: MSTBV51000EAN: 8436612942193");
    for(const name of ["Abrir ficha de Mochila Black Voltage","Ver ficha y opciones de pedido de Mochila Black Voltage","Explorar Mochila Black Voltage"])
      expect(screen.getByRole("button",{name})).toHaveAttribute("data-product-id",original.id);
    expect(container.querySelectorAll('[data-product-id="black voltage"]')).toHaveLength(3);
  });
  it("registers Artic Sport on P35 with exact data and the three original modal actions", () => {
    const artic=mobileAccessoryPresentations.find(item=>item.pageId===35)!;
    const original=products.find(item=>item.id==="artic sport")!;
    expect(original).toMatchObject({sku:"MSTAR51000",pagina:35,nombre:"Mochila Artic Sport",categoria:"mochila"});
    expect(artic).toMatchObject({productId:original.id,category:"MOCHILAS",title:"ARTIC SPORT",
      image:"mobile/artic-sport-backpack.webp",ref:"MSTAR51000",ean:"8436612942209"});
    expect(artic.features).toEqual([
      {title:"GRAN CAPACIDAD DE ALMACENAMIENTO",description:""},
      {title:"COMPARTIMENTO INDIVIDUAL PARA GUARDAR EL CALZADO",description:""},
      {title:"REFUERZO EXTRA EN SUS ASAS",description:""},
      {title:"COMPARTIMENTO PARA PORTÁTIL",description:""},
    ]);
    expect(artic.specs).toEqual([["DIMENSIONES","50X32X18,5 CM"],["MATERIALES","POLYESTER"]]);
    const {container}=render(<MobileAccessoryProductPage presentation={artic} product={original} active live load />);
    expect(screen.getByRole("heading",{name:"ARTIC SPORT"})).toBeVisible();
    expect(screen.getByRole("region",{name:"Características de la mochila"})).toBeVisible();
    expect(screen.getByRole("img",{name:"ARTIC SPORT"})).toHaveAttribute("data-accessory-hero-source",artic.image);
    expect(container.querySelector("footer")).toHaveTextContent("REF: MSTAR51000EAN: 8436612942209");
    for(const name of ["Abrir ficha de Mochila Artic Sport","Ver ficha y opciones de pedido de Mochila Artic Sport","Explorar Mochila Artic Sport"])
      expect(screen.getByRole("button",{name})).toHaveAttribute("data-product-id",original.id);
    expect(container.querySelectorAll('[data-product-id="artic sport"]')).toHaveLength(3);
  });
  it("registers the Hard Eva Black backpack on P34 without confusing it with the P28 bag", () => {
    const backpack=mobileAccessoryPresentations.find(item=>item.pageId===34)!;
    const original=products.find(item=>item.id==="m hard eva black")!;
    expect(original).toMatchObject({sku:"MSTHEB51000",pagina:34,nombre:"Mochila Hard Eva Black",categoria:"mochila"});
    expect(backpack).toMatchObject({productId:original.id,category:"MOCHILAS",title:"HARD EVA BLACK",
      image:"mobile/hard-eva-black-backpack-front.webp",ref:"MSTHEB51000",ean:"8436612942186"});
    expect(backpack.features).toEqual([
      {title:"MATERIAL DURO EVA EN EL BOLSILLO DELANTERO",description:""},
      {title:"GRAN CAPACIDAD DE ALMACENAMIENTO",description:""},
      {title:"COMPARTIMENTO PARA PORTÁTIL",description:""},
      {title:"COMPARTIMENTO INDIVIDUAL PARA GUARDAR EL CALZADO",description:""},
    ]);
    expect(backpack.specs).toEqual([["DIMENSIONES","32X50X22 CM"],["MATERIALES","HARD EVA Y POLYESTER"]]);
    const {container}=render(<MobileAccessoryProductPage presentation={backpack} product={original} active live load />);
    expect(screen.getByRole("heading",{name:"HARD EVA BLACK"})).toBeVisible();
    expect(screen.getByText("MOCHILAS")).toBeVisible();
    expect(screen.getByRole("region",{name:"Características de la mochila"})).toBeVisible();
    expect(screen.getByRole("img",{name:"HARD EVA BLACK"})).toHaveAttribute("data-accessory-hero-source",backpack.image);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(container.querySelector("footer")).toHaveTextContent("REF: MSTHEB51000EAN: 8436612942186");
    expect(container.querySelectorAll('[data-product-id="m hard eva black"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-product-id="hard eva black bag"]')).toHaveLength(0);
    expect(screen.getByRole("button",{name:"Ver ficha y opciones de pedido de Mochila Hard Eva Black"}).parentElement).toHaveClass("mobile-accessory-product__hero");
  });
  it("registers Neon Strike directly on P33 with exact data and the same three modal actions", () => {
    const neon=mobileAccessoryPresentations.find(item=>item.pageId===33)!;
    const original=products.find(item=>item.id==="neon strike")!;
    expect(original).toMatchObject({sku:"BSTNEON51000",pagina:33,nombre:"Paletero Neon Strike"});
    expect(neon).toMatchObject({productId:original.id,category:"PALETEROS",title:"NEON STRIKE",
      image:"mobile/neon-strike.webp",ref:"BSTNEON51000",ean:"8436612942179"});
    expect(neon.features).toEqual([
      {title:"COMPARTIMENTO PARA PALAS DE PÁDEL",description:""},
      {title:"REFUERZO EXTRA EN SUS ASAS",description:""},
    ]);
    expect(neon.specs).toEqual([["DIMENSIONES","53X28X24 CM"],["MATERIALES","POLYESTER"]]);
    const {container}=render(<MobileAccessoryProductPage presentation={neon} product={original} active live load />);
    expect(screen.getByRole("heading",{name:"NEON STRIKE"})).toBeVisible();
    expect(screen.getByRole("img",{name:"NEON STRIKE"})).toHaveAttribute("data-accessory-hero-source",neon.image);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("footer")).toHaveTextContent("REF: BSTNEON51000EAN: 8436612942179");
    expect(container.querySelectorAll('[data-product-id="neon strike"]')).toHaveLength(3);
    expect(screen.getByRole("button",{name:"Ver ficha y opciones de pedido de Paletero Neon Strike"}).parentElement).toHaveClass("mobile-accessory-product__hero");
  });
  it("registers Star directly on P32 with exact data and the three original modal actions", () => {
    const star = mobileAccessoryPresentations.find(item => item.pageId === 32)!;
    const original = products.find(item => item.id === "star")!;
    expect(original).toMatchObject({sku: "BSTSTAR51000", pagina: 32, nombre: "Paletero Star"});
    expect(star).toMatchObject({productId: original.id, category: "PALETEROS", title: "STAR",
      image: "mobile/star-bag.webp", ref: "BSTSTAR51000", ean: "8436612942162"});
    expect(star.features).toEqual([
      {title: "GRAN CAPACIDAD DE ALMACENAMIENTO", description: ""},
      {title: "COMPARTIMENTO INDIVIDUAL", description: "PARA GUARDAR EL CALZADO"},
      {title: "REFUERZO EXTRA EN SUS ASAS", description: ""},
      {title: "BOLSILLO LATERAL", description: "PARA PEQUEÑOS ACCESORIOS"},
    ]);
    expect(star.specs).toEqual([["DIMENSIONES", "56X29X28 CM"], ["MATERIALES", "POLYESTER"]]);
    const {container}=render(<MobileAccessoryProductPage presentation={star} product={original} active live load />);
    expect(screen.getByRole("heading", {name:"STAR"})).toBeVisible();
    expect(screen.getByRole("img", {name:"STAR"})).toHaveAttribute("data-accessory-hero-source", star.image);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(container.querySelector("footer")).toHaveTextContent("REF: BSTSTAR51000EAN: 8436612942162");
    expect(container.querySelectorAll('[data-product-id="star"]')).toHaveLength(3);
    expect(screen.getByRole("button", {name:"Ver ficha y opciones de pedido de Paletero Star"}).parentElement).toHaveClass("mobile-accessory-product__hero");
  });
  it("registers Pro Master directly on P31 with exact data and the same three modal actions", () => {
    const master = mobileAccessoryPresentations.find(item => item.pageId === 31)!;
    const original = products.find(item => item.id === "pro master")!;
    expect(original).toMatchObject({sku: "BSTPM51000", pagina: 31, nombre: "Paletero Pro Master"});
    expect(master).toMatchObject({productId: original.id, category: "PALETEROS", title: "PRO MASTER",
      image: "mobile/pro-master.webp", ref: "BSTPM51000", ean: "8436612942155"});
    expect(master.features).toEqual([
      {title: "DOS COMPARTIMENTOS TERMOTECH", description: "PARA PALAS DE PÁDEL"},
      {title: "COMPARTIMENTO INDIVIDUAL", description: "PARA GUARDAR CALZADO"},
      {title: "BOLSILLO LATERAL", description: "PARA ACCESORIOS PEQUEÑOS"},
      {title: "SISTEMA DE TRANSPORTE DOBLE", description: ""},
    ]);
    expect(master.specs).toEqual([["DIMENSIONES", "62X32X35 CM"], ["MATERIALES", "POLYESTER AND SIMIL CARBON"]]);
    expect(master.extendedSpecs).toBe(true);
    expect(mobileAccessoryPresentations.filter(item => item.pageId !== 31).every(item => !item.extendedSpecs)).toBe(true);
    const {container} = render(<MobileAccessoryProductPage presentation={master} product={original} active live load />);
    expect(screen.getByRole("heading", {name: "PRO MASTER"})).toBeVisible();
    expect(screen.getByRole("img", {name: "PRO MASTER"})).toHaveAttribute("data-accessory-hero-source", master.image);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(container.querySelector("footer")).toHaveTextContent("REF: BSTPM51000EAN: 8436612942155");
    expect(container.querySelector("article")).toHaveAttribute("data-extended-specs", "true");
    expect(container.querySelectorAll('[data-product-id="pro master"]')).toHaveLength(3);
    expect(screen.getByRole("button", {name: "Ver ficha y opciones de pedido de Paletero Pro Master"}).parentElement).toHaveClass("mobile-accessory-product__hero");
  });
  it("registers T-One Pro on P30 with exact data and three original modal actions", () => {
    const tone = mobileAccessoryPresentations.find(item => item.pageId === 30)!;
    const original = products.find(item => item.id === "t-one pro")!;
    expect(original).toMatchObject({sku: "BSTONE51000", pagina: 30, nombre: "Paletero T-One Pro"});
    expect(tone).toMatchObject({productId: original.id, category: "PALETEROS", title: "T-ONE PRO",
      image: "mobile/t-one-pro.webp", ref: "BSTONE51000", ean: "8436612942148"});
    expect(tone.features).toEqual([
      {title: "DOS COMPARTIMENTOS TERMOTECH", description: "PARA PALAS DE PÁDEL"},
      {title: "COMPARTIMENTO INDIVIDUAL", description: "PARA GUARDAR CALZADO"},
      {title: "BOLSILLO INDIVIDUAL", description: "PARA BOTE DE PELOTAS"},
      {title: "DOBLE SISTEMA DE TRANSPORTE", description: ""},
    ]);
    expect(tone.specs).toEqual([["DIMENSIONES", "60X34X33 CM"], ["MATERIALES", "POLYESTER"]]);
    const {container} = render(<MobileAccessoryProductPage presentation={tone} product={original} active live load />);
    expect(screen.getByRole("heading", {name: "T-ONE PRO"})).toBeVisible();
    expect(screen.getByRole("img", {name: "T-ONE PRO"})).toHaveAttribute("data-accessory-hero-source", tone.image);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(container.querySelector("footer")).toHaveTextContent("REF: BSTONE51000EAN: 8436612942148");
    expect(container.querySelectorAll('[data-product-id="t-one pro"]')).toHaveLength(3);
    expect(screen.getByRole("button", {name: "Ver ficha y opciones de pedido de Paletero T-One Pro"}).parentElement).toHaveClass("mobile-accessory-product__hero");
  });
  it("groups all eleven real products in the approved order and uses live page destinations", () => {
    const navigate = vi.fn();
    const { container } = render(<MobileAccessoriesIndex products={products} active live load onNavigate={navigate} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Seleccioná un producto para verlo");
    for (const section of mobileAccessorySections) {
      const region = screen.getByRole("region", { name: section.title });
      const buttons = within(region).getAllByRole("button");
      expect(buttons).toHaveLength(section.productIds.length);
      buttons.forEach((button, index) => {
        const original = products.find(item => item.id === section.productIds[index])!;
        expect(button).toHaveAttribute("data-section-target", String(original.pagina));
        expect(button).toHaveAccessibleName(`${original.nombre}: ver en página ${original.pagina}`);
        expect(button.querySelector("img")).toHaveAttribute("data-accessory-thumbnail-source", original.imagenes[0]);
      });
    }
    const hardEva = screen.getByRole("button", { name: "Paletero Hard Eva Black: ver en página 28" });
    fireEvent.click(hardEva);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(28);
    expect(container.querySelectorAll("[data-product-id]")).toHaveLength(0);
  });
  it("follows catalog updates, omits removed products and keeps unavailable ones navigable", () => {
    const updated = products.filter(item => item.id !== "star").map(item => item.id === "hard eva eternal"
      ? { ...item, disponible: false, pagina: 32, nombre: "Paletero Eternal actualizado" } : item);
    render(<MobileAccessoriesIndex products={updated} active live load onNavigate={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Paletero Eternal actualizado: ver en página 32" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Paletero Star:/ })).toBeNull();
  });
  it("defers thumbnails and disables navigation when the index is not live", () => {
    const navigate = vi.fn();
    const { container } = render(<MobileAccessoriesIndex products={products} active={false} live={false} load={false} onNavigate={navigate} />);
    expect(container.querySelectorAll("[data-accessory-thumbnail-source]")).toHaveLength(0);
    container.querySelectorAll<HTMLButtonElement>("button").forEach(button => { expect(button).toBeDisabled(); fireEvent.click(button); });
    expect(navigate).not.toHaveBeenCalled();
  });
  it("shows the real Hard Eva photograph, exact features/specs and original product identity", () => {
    const { container } = render(<MobileAccessoryProductPage presentation={presentation} product={product} active live load />);
    expect(product).toMatchObject({ id: "hard eva black bag", sku: "BSTHEB51000", pagina: 28 });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("HARD EVA BLACK");
    expect(screen.getByRole("img", { name: "HARD EVA BLACK" })).toHaveAttribute("data-accessory-hero-source", "mobile/hard-eva-black.webp");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    const features = screen.getByRole("region", { name: "Características del paletero" });
    for (const feature of presentation.features) expect(features).toHaveTextContent(`${feature.title}${feature.description}`);
    expect([...features.querySelectorAll("strong")].map(item => item.textContent)).toEqual([
      "Hard Eva material", "Compartimento individual", "Bolsillo individual", "Doble sistema de transporte", "Compartimento Thermotech",
    ]);
    expect(features.querySelectorAll("p")).toHaveLength(4);
    expect([...container.querySelectorAll("dd")].map(item => item.textContent)).toEqual(["62x35x35 cm", "Hard Eva y PVC"]);
    expect(container.querySelector("footer")).toHaveTextContent("REF: BSTHEB51000EAN: 8436612942124");
    expect(container.querySelectorAll('[data-product-id="hard eva black bag"]')).toHaveLength(3);
    const bag = screen.getByRole("button", { name: "Ver ficha y opciones de pedido de Paletero Hard Eva Black" });
    expect(bag).toHaveAttribute("data-product-id", "hard eva black bag");
    expect(bag).toHaveAttribute("aria-haspopup", "dialog");
    expect(bag).toHaveClass("mobile-premium-product-page__product-button");
    expect(bag.parentElement).toHaveClass("mobile-accessory-product__hero");
    expect(bag.querySelector("svg")).not.toBeNull();
  });
  it("cannot act on a mismatched product and defers the photograph offscreen", () => {
    const { container } = render(<MobileAccessoryProductPage presentation={presentation} product={products[0]} active={false} live={false} load={false} />);
    expect(container.querySelectorAll("[data-product-id], [data-accessory-hero-source]")).toHaveLength(0);
    screen.getAllByRole("button").forEach(button => expect(button).toBeDisabled());
  });
  it("registers Eternal on P29 with the same template data and three original modal actions", () => {
    const eternal = mobileAccessoryPresentations.find(item => item.pageId === 29)!;
    const original = products.find(item => item.id === "hard eva eternal")!;
    expect(original).toMatchObject({ sku: "BSTETE51000", pagina: 29 });
    expect(eternal).toMatchObject({ productId: original.id, category: "PALETEROS", title: "HARD EVA ETERNAL",
      image: "mobile/hard-eva-eternal.webp", ref: "BSTETE51000", ean: "8436612942131" });
    expect(eternal.features).toEqual(presentation.features);
    expect(eternal.specs).toEqual([["DIMENSIONES", "62x35x35 cm"], ["MATERIALES", "Hard Eva y PVC"]]);
    const {container} = render(<MobileAccessoryProductPage presentation={eternal} product={original} active live load />);
    expect(screen.getByRole("heading", {name:"HARD EVA ETERNAL"})).toBeVisible();
    expect(screen.getByRole("img", {name:"HARD EVA ETERNAL"})).toHaveAttribute("data-accessory-hero-source", eternal.image);
    expect(container.querySelector("footer")).toHaveTextContent("REF: BSTETE51000EAN: 8436612942131");
    expect(container.querySelectorAll('[data-product-id="hard eva eternal"]')).toHaveLength(3);
    const bag = screen.getByRole("button", {name:"Ver ficha y opciones de pedido de Paletero Hard Eva Eternal"});
    expect(bag.parentElement).toHaveClass("mobile-accessory-product__hero");
    expect(bag).toHaveAttribute("aria-haspopup", "dialog");
  });
});
