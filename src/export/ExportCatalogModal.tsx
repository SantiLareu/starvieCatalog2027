import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { CommerceCatalog } from "../commerce/types";
import { buildExportRows, exportCategories, exportFileName, exportSubcategories, type ExportSelection } from "./catalogExport";
import { downloadExportWorkbook } from "./exportWorkbook";
import "./export.css";

export default function ExportCatalogModal({ catalog, onClose, openerRef }: {
  catalog: CommerceCatalog;
  onClose: () => void;
  openerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [scope, setScope] = useState<ExportSelection["scope"]>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const generatingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const categories = useMemo(() => exportCategories(catalog), [catalog]);
  const subcategories = useMemo(() => category === null ? [] : exportSubcategories(catalog, category), [catalog, category]);

  useEffect(() => {
    if (category === null || !categories.includes(category)) setCategory(categories[0] ?? null);
  }, [categories, category]);
  useEffect(() => {
    if (subcategory === null || !subcategories.includes(subcategory)) setSubcategory(subcategories[0] ?? null);
  }, [subcategories, subcategory]);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const opener = openerRef.current;
    return () => opener?.focus({ preventScroll: true });
  }, [openerRef]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!generatingRef.current) onClose();
      } else if (event.key === "Tab") {
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)") ?? [])];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const selection: ExportSelection = scope === "all" ? { scope } : scope === "category"
    ? { scope, category: category ?? "" } : { scope, category: category ?? "", subcategory: subcategory ?? "" };
  const rows = buildExportRows(catalog, selection);
  const canDownload = rows.length > 0 && !generating && (scope === "all" || category !== null) &&
    (scope !== "subcategory" || subcategory !== null);
  const scopeLabel = scope === "all" ? "Catálogo completo" :
    [category || "Sin categoría", ...(scope === "subcategory" ? [subcategory || "Sin subcategoría"] : [])].join(" / ");

  const download = async () => {
    if (!canDownload || generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setError("");
    try {
      await downloadExportWorkbook(rows, exportFileName(selection));
      onClose();
    } catch {
      setError("No pudimos generar el Excel. Intentá nuevamente.");
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  return createPortal(<div className="catalog-export-backdrop" role="presentation"
    onClick={event => { if (event.target === event.currentTarget && !generatingRef.current) onClose(); }}
    onMouseMove={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()}>
    <div className="catalog-export-dialog" ref={dialogRef} role="dialog" aria-modal="true"
      aria-labelledby="catalog-export-title" aria-describedby="catalog-export-description" aria-busy={generating}>
      <header className="catalog-export-header">
        <div><p>STARVIE 2027</p><h2 id="catalog-export-title">Descargar productos</h2></div>
        <button className="catalog-export-close" type="button" ref={closeRef} disabled={generating}
          onClick={onClose} aria-label="Cerrar exportación">×</button>
      </header>
      <div className="catalog-export-content">
        <p id="catalog-export-description">Elegí el alcance y descargá una planilla Excel para tu sistema de gestión de artículos.</p>
        <fieldset className="catalog-export-scopes" disabled={generating}>
          <legend>Alcance</legend>
          {([['all', 'Catálogo completo'], ['category', 'Por categoría'], ['subcategory', 'Por categoría y subcategoría']] as const).map(([value, label]) =>
            <label key={value}><input type="radio" name="catalog-export-scope" value={value} checked={scope === value}
              onChange={() => { setScope(value); setError(""); }} />{label}</label>)}
        </fieldset>
        {scope !== "all" ? <div className="catalog-export-filters">
          <div className="catalog-export-field"><label htmlFor="export-category">Categoría</label><select id="export-category" disabled={generating || categories.length === 0} value={category ?? ""}
            onChange={event => { setCategory(event.target.value); setSubcategory(null); setError(""); }}>
            {categories.map(value => <option key={value} value={value}>{value || "Sin categoría"}</option>)}
          </select></div>
          {scope === "subcategory" ? <div className="catalog-export-field"><label htmlFor="export-subcategory">Subcategoría</label><select id="export-subcategory" disabled={generating || subcategories.length === 0}
            value={subcategory ?? ""} onChange={event => { setSubcategory(event.target.value); setError(""); }}>
            {subcategories.map(value => <option key={value} value={value}>{value || "Sin subcategoría"}</option>)}
          </select></div> : null}
        </div> : null}
        <div className="catalog-export-summary" role="status"><span>{scopeLabel}</span>
          <strong>{rows.length} {rows.length === 1 ? "producto" : "productos"}</strong></div>
        <p className="catalog-export-columns">SKU · Nombre · Categoría · Subcategoría · Precio</p>
        {rows.some(row => row[4] === null) ? <p className="catalog-export-note">Los productos sin precio se incluyen con la celda Precio vacía.</p> : null}
        {error ? <p className="catalog-export-error" role="alert">{error}</p> : null}
      </div>
      <footer className="catalog-export-actions">
        <button type="button" disabled={generating} onClick={onClose}>Cancelar</button>
        <button type="button" className="catalog-export-download" disabled={!canDownload} onClick={() => void download()}>
          {generating ? "Generando Excel…" : "Descargar Excel"}</button>
      </footer>
    </div>
  </div>, document.body);
}
