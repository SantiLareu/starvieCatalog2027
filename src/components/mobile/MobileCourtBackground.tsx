import "./mobile-court.css";

/** Shared, decorative court plate. CSS loads its assets only on portrait phones. */
export function MobileCourtBackground({ variant = "product" }: {
  variant?: "cover" | "lineup" | "news" | "product" | "stage";
}) {
  return <div className={`mobile-court-scene mobile-court-scene--${variant}`} aria-hidden="true">
    {variant !== "stage" ? <span className="mobile-court-scene__wall-logo" /> : null}
  </div>;
}
