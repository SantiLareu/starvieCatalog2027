import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,expect,it} from "vitest";
import {MobileEternalEditorial,eternalEditorialAssets} from "./MobileEternalEditorial";

afterEach(cleanup);
it("presents Eternal with HTML titles, the real player/bag photograph and actual signature, without product controls", () => {
  const {container} = render(<MobileEternalEditorial visible />);
  expect(screen.getByRole("heading",{name:"ETERNAL"})).toBeVisible();
  expect(screen.getByText("COLLECTION",{exact:true})).toBeVisible();
  expect(screen.getByText("by Sanyo Gutiérrez")).toBeVisible();
  expect(screen.getByRole("img",{name:"Firma de Sanyo Gutiérrez"})).toHaveAttribute("src",expect.stringContaining(eternalEditorialAssets.signature));
  expect(screen.getByRole("img",{name:"Sanyo Gutiérrez junto al paletero Hard Eva Eternal"})).toHaveAttribute("src",expect.stringContaining(eternalEditorialAssets.portrait));
  expect(container.querySelectorAll("button, [data-product-id], dl")).toHaveLength(0);
  expect(screen.queryByText(/REF:|EAN:|DIMENSIONES|MATERIALES|EXPLORAR/)).toBeNull();
});
it("defers both real crops until nearby and retains them during native flips", () => {
  const {container,rerender} = render(<MobileEternalEditorial visible={false} load={false} />);
  expect(container.querySelectorAll("img[src]")).toHaveLength(0);
  rerender(<MobileEternalEditorial visible={false} load />);
  expect(container.querySelectorAll("img[src]")).toHaveLength(2);
  rerender(<MobileEternalEditorial visible={false} load={false} />);
  expect(container.querySelectorAll("img[src]")).toHaveLength(2);
  expect(container.firstElementChild).toHaveAttribute("data-live","false");
  expect(container.firstElementChild).toHaveAttribute("aria-hidden","true");
});
