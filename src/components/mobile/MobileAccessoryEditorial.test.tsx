import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,expect,it} from "vitest";
import {tamaraEditorialPresentation} from "../../data/mobileAccessoryEditorialPresentation";
import {MobileAccessoryEditorial} from "./MobileAccessoryEditorial";

afterEach(cleanup);
it("recomposes Tamara's actual imagery and signature with HTML type and no commercial controls", () => {
  const {container} = render(<MobileAccessoryEditorial presentation={tamaraEditorialPresentation} visible />);
  expect(screen.getByRole("heading",{name:"PRO"})).toBeVisible();
  expect(screen.getByText("T-ONE",{exact:true})).toBeVisible();
  expect(screen.getByText("by Tamara Icardo")).toBeVisible();
  for (const asset of [tamaraEditorialPresentation.portrait, tamaraEditorialPresentation.signature]) {
    expect(screen.getByRole("img",{name:asset.alt})).toHaveAttribute("src",expect.stringContaining(asset.src));
  }
  expect(container.querySelectorAll("button, [data-product-id], dl")).toHaveLength(0);
  expect(screen.queryByText(/REF:|EAN:|DIMENSIONES|MATERIALES|EXPLORAR/)).toBeNull();
});
it("loads crops only near the leaf and retains them during flips", () => {
  const {container,rerender} = render(<MobileAccessoryEditorial presentation={tamaraEditorialPresentation} visible={false} load={false} />);
  expect(container.querySelectorAll("img[src]")).toHaveLength(0);
  rerender(<MobileAccessoryEditorial presentation={tamaraEditorialPresentation} visible={false} load />);
  expect(container.querySelectorAll("img[src]")).toHaveLength(2);
  rerender(<MobileAccessoryEditorial presentation={tamaraEditorialPresentation} visible={false} load={false} />);
  expect(container.querySelectorAll("img[src]")).toHaveLength(2);
  expect(container.firstElementChild).toHaveAttribute("aria-hidden","true");
});
