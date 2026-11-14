import { describe, expect, it } from "vitest";
import { formatCuitInput, hasValidCuitShape, normalizeCuitInput } from "./cuit";

describe("CUIT/CUIL (pista de formato del cliente)", () => {
  it("acepta un CUIT válido con o sin guiones", () => {
    // 20-11111111-2: dígito verificador válido según módulo 11 del servidor.
    expect(hasValidCuitShape("20111111112")).toBe(true);
    expect(hasValidCuitShape("20-11111111-2")).toBe(true);
  });

  it("rechaza dígito verificador incorrecto y formas cortas", () => {
    expect(hasValidCuitShape("20111111113")).toBe(false);
    expect(hasValidCuitShape("2011111111")).toBe(false);
    expect(hasValidCuitShape("")).toBe(false);
  });

  it("rechaza prefijos fuera del conjunto del servidor", () => {
    expect(hasValidCuitShape("99111111119")).toBe(false);
  });

  it("formatea progresivamente mientras se escribe", () => {
    expect(formatCuitInput("20")).toBe("20");
    expect(formatCuitInput("2012345")).toBe("20-12345");
    expect(formatCuitInput("20123456789")).toBe("20-12345678-9");
    expect(normalizeCuitInput("20-12345678-9")).toBe("20123456789");
  });
});
