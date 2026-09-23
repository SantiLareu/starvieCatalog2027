import { useEffect, useState } from "react";
import { CommerceProvider } from "./commerce/CommerceContext";
import { Magazine } from "./components/Magazine";
import { PadelViewerLab } from "./components/PadelViewerLab";
import type { CatalogMetadata } from "./types/catalog";

export default function App() {
  const isViewerLab = window.location.pathname === "/viewer-lab"
    || new URLSearchParams(window.location.search).has("viewer-lab");
  return isViewerLab ? <PadelViewerLab /> : <CatalogApp />;
}

function CatalogApp() {
  const [catalog, setCatalog] = useState<CatalogMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/catalog/catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CatalogMetadata>;
      })
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el catálogo. Ejecuta npm run build:pdf-pages.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <main className="startup-message error-message">{error}</main>;
  if (!catalog) {
    return (
      <main className="startup-message" role="status">
        <span>✦</span><strong>STARVIE</strong><small>Preparando 2027</small>
      </main>
    );
  }

  return (
    <CommerceProvider>
      <Magazine catalog={catalog} />
    </CommerceProvider>
  );
}
