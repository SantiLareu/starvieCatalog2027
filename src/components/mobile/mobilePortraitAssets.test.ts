import { describe, expect, it } from "vitest";
import { mobilePortraitReplacementPages } from "./mobilePortraitAssets";
import { mobileAccessoryPresentations, mobileNecessairesPresentation } from "../../data/mobileAccessoryPresentation";

describe("portrait PDF warmup eligibility", () => {
  it("excludes every registered replacement, including both products sharing P37", () => {
    expect([...mobilePortraitReplacementPages].sort((a,b) => a-b)).toEqual(Array.from({length:24},(_,i) => i+15));
    for (const presentation of mobileAccessoryPresentations)
      expect(mobilePortraitReplacementPages.has(presentation.pageId)).toBe(true);
    expect(mobilePortraitReplacementPages.has(mobileNecessairesPresentation.pageId)).toBe(true);
  });
  it("retains native cover, StarLab, lineup and back-cover PDF loading", () => {
    for (const number of [1,2,13,14,39]) expect(mobilePortraitReplacementPages.has(number)).toBe(false);
  });
});
