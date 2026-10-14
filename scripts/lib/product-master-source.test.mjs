import { describe, expect, it } from "vitest";
import path from "node:path";
import { productBuildSource } from "./product-master-source.mjs";

describe("editing masters stay outside the published runtime", () => {
  const root = path.resolve("tmp/source-contract");
  it("keeps existing non-migrated sources in public", () => {
    expect(productBuildSource(root, "products/palas/front.webp", new Map())).toEqual({
      target: path.join(root, "public/products/palas/front.webp"), identity: "products/palas/front.webp",
    });
  });
  it("uses the archived original and its stable cache identity for regenerated variants", () => {
    const relative = "products/bolsos/front.webp";
    const record = { masterPath: "source-assets/product-masters/products/bolsos/front.png", canonicalSource: "products/bolsos/front.png" };
    expect(productBuildSource(root, relative, new Map([[relative, record]]))).toEqual({
      target: path.join(root, record.masterPath), identity: record.canonicalSource,
    });
  });
  it("rejects source paths escaping either allowed directory", () => {
    expect(() => productBuildSource(root, "../private.png", new Map())).toThrow(/fuera/);
    const relative = "products/bolsos/front.webp";
    expect(() => productBuildSource(root, relative, new Map([[relative, { masterPath: "private.png" }]]))).toThrow(/fuera/);
  });
});
