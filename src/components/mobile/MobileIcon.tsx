type Icon = "bag" | "close" | "zoom" | "Forma" | "Plano" | "Peso" | "Balance";
const paths: Record<Icon, string> = {
  bag: "M5 8h14l1 13H4L5 8Zm3 0V6a4 4 0 0 1 8 0v2",
  close: "m6 6 12 12M18 6 6 18",
  zoom: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5 0 6 6M7 10h6M10 7v6",
  Forma: "m12 2 8 5v10l-8 5-8-5V7l8-5Zm-4 8 4-4 4 4-4 8-4-8Z",
  Plano: "m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5",
  Peso: "M9 6a3 3 0 1 1 6 0M8 8h8l4 13H4L8 8Z",
  Balance: "M12 3v18M5 6h14M6 6l-4 9h8L6 6Zm12 0-4 9h8l-4-9ZM8 21h8",
};
export function MobileIcon({ name }: { name: Icon }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.3"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
