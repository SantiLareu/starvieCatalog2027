import { useEffect, useState } from "react";
import "./tamara-editorial.css";

/**
 * Derivado editorial 16:9 (1672×941 nativo, WebP) del asset oficial de
 * Tamara: T-ONE PRO / by TAMARA ICARDO / firma, jugadora y producto.
 * Composición completa sin recortes (el asset ya es 16:9).
 */
export const TAMARA_BANNER_SRC = "/banners/tamara-editorial-1672.webp";

type TamaraEditorialProps = {
  /** Solo presentada y estable: habilita el reveal suave. */
  visible: boolean;
  /** Asigna la imagen al acercarse o preparar un salto; conserva la fuente después. */
  load?: boolean;
};

/**
 * Página editorial virtual de Tamara: la fotografía oficial domina la
 * hoja a sangre. Sin textos, CTA ni datos superpuestos: toda la
 * información ya vive en el asset. Contenido estático siempre
 * (estable durante el flip); el fundido corre solo en `live`.
 */
export function TamaraEditorial({ visible, load = visible }: TamaraEditorialProps) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (load) setLoaded(true); }, [load]);
  return (
    <section
      className="tamara-editorial"
      data-live={visible ? "true" : "false"}
      aria-label="Tamara Icardo, T-One Pro 2027"
      aria-hidden={!visible}
    >
      <img
        className="tamara-editorial__photo"
        src={load || loaded ? TAMARA_BANNER_SRC : undefined}
        alt="Tamara Icardo con el paletero T-One Pro, by Tamara Icardo"
        width={1672}
        height={941}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    </section>
  );
}
