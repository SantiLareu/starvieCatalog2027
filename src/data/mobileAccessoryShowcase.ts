/** P38 editorial layout; product identity always resolves against the live catalog.
 * The reference calls the weights "Power Balls" and the second overgrip "Tacky
 * Team". Keep the real catalog names/IDs: Power Balance and Tacky Touch.
 */
export const MOBILE_ACCESSORY_SHOWCASE_PAGE = 38;

export const mobileAccessoryShowcaseGroups = [
  { category: "Gorra", key: "cap", items: [{ productId: "black cap", title: "Black Cap", image: "mobile/accessory-black-cap.webp" }] },
  { category: "Pesos", key: "weights", items: [{ productId: "power balance", title: "Power Balance", image: "mobile/accessory-power-balance.webp" }] },
  { category: "Overgrips", key: "overgrips", items: [
    { productId: "overgrip premier soft", title: "Premier Soft", image: "mobile/accessory-premier-soft.webp" },
    { productId: "overgrip tacky touch", title: "Tacky Touch", image: "mobile/accessory-tacky-touch.webp" },
  ] },
  { category: "Muñequeras", key: "wristbands", items: [
    { productId: "muñequera Wristband white", title: "Wristband White", image: "mobile/accessory-wristband-white.webp" },
    { productId: "muñequera Wristband blue", title: "Wristband Blue", image: "mobile/accessory-wristband-blue.webp" },
    { productId: "muñequera Wristband black x2", title: "Wristband Black 2pack", image: "mobile/accessory-wristband-black.webp" },
  ] },
  { category: "Protector", key: "protector", items: [
    { productId: "protector transparent carbon", title: "Transparent Carbon", image: "mobile/accessory-protector-carbon.webp" },
  ] },
  { category: "Llaveros", key: "keyrings", items: [{
    productId: "key ring", title: "Key Ring",
    // Original product photograph extracted from the P38 PDF image, not artwork.
    image: "mobile/key-ring.webp",
  }] },
] satisfies ReadonlyArray<{
  category: string; key: string;
  items: ReadonlyArray<{ productId: string; title: string; image?: string }>;
}>;
