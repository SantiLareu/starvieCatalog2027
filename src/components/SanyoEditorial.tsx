import { useEffect, useState } from "react";
import "./sanyo-editorial.css";

/**
 * Derivado editorial 16:9 (1920×1080, WebP) compuesto desde el master
 * oficial, que permanece intacto: Sanyo con pala + bloque COLLECTION
 * ETERNAL / by SANYO GUTIÉRREZ / firma + Sanyo junto al bolso.
 */
export const SANYO_BANNER_SRC = "/banners/sanyo-editorial-1920.webp";

type SanyoEditorialProps = {
  /** Solo presentada y estable: habilita el reveal suave. */
  visible: boolean;
  /** Asigna la imagen al acercarse o preparar un salto; conserva la fuente después. */
  load?: boolean;
};

/**
 * Página editorial virtual de Sanyo: la fotografía oficial domina la
 * hoja a sangre. Sin textos, CTA ni datos superpuestos: toda la
 * información ya vive en el asset. Contenido estático siempre
 * (estable durante el flip); el fundido corre solo en `live`.
 */
export function SanyoEditorial({ visible, load = visible }: SanyoEditorialProps) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (load) setLoaded(true); }, [load]);
  return (
    <section
      className="sanyo-editorial"
      data-live={visible ? "true" : "false"}
      aria-label="Sanyo Gutiérrez, Collection Eternal 2027"
      aria-hidden={!visible}
    >
      <img
        className="sanyo-editorial__photo"
        src={load || loaded ? SANYO_BANNER_SRC : undefined}
        alt="Sanyo Gutiérrez con el paletero blanco, Collection Eternal by Sanyo Gutiérrez"
        width={1920}
        height={1080}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    </section>
  );
}
