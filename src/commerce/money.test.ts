import { describe, expect, it } from "vitest";
import { formatPrice } from "./money";

describe("formatPrice", () => {
  it("presenta pesos argentinos sin modificar el valor numérico", () => {
    expect(formatPrice(500)).toBe("500,00 $");
    expect(formatPrice(1234.5)).toBe("1.234,50 $");
  });
});
