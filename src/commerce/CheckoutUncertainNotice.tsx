import { useState } from "react";

export const UNCERTAIN_ORDER_MESSAGE =
  "No pudimos confirmar si RealStep recibió tu pedido.\nNo vuelvas a enviarlo todavía.";

/** Mensaje para un pedido que el servidor REGISTRÓ (502 con orderId): el
 *  pedido existe y persiste, y el cliente puede haber recibido ya el correo
 *  de aviso. El aviso de incertidumbre sería falso aquí. */
export const FAILED_ORDER_MESSAGE =
  "El pedido llegó al servidor y puede que ya te hayan notificado por correo.\nNo vuelvas a enviarlo todavía.";

/** Mensaje para un 409: la respuesta no lleva ningún dato del pedido
 *  anterior, así que el resultado no se puede verificar desde el catálogo. */
export const CONFLICT_ORDER_MESSAGE =
  "El resultado de este pedido no se puede verificar desde el catálogo.\nNo vuelvas a enviarlo todavía.";

// Existing commercial contact: src/components/BackCover.tsx. No admin URL.
const REALSTEP_WHATSAPP_URL = "https://wa.me/5492235440976";

export function CheckoutUncertainNotice({ reference, showWarning = true, message = UNCERTAIN_ORDER_MESSAGE, resolutionMechanism = "none" }: {
  reference: string | null;
  showWarning?: boolean;
  /**
   * Mensaje propio del estado. Por defecto el aviso de incertidumbre; los
   * estados que el servidor conservó (`failed`) o que no se pueden verificar
   * (`conflict`) usan un mensaje verdadero para su caso. La referencia, la
   * copia, el contacto y la limitación de conciliación NO cambian.
   */
  message?: string;
  /**
   * Mecanismo de resolución disponible. `none` (por defecto) es el checkout
   * público: consultar a RealStep NO habilita una compra nueva. `reconciliation`
   * es el canal distribuidor, donde el backend expone la resolución
   * administrativa de la referencia.
   */
  resolutionMechanism?: "none" | "reconciliation";
}) {
  const [copyResult, setCopyResult] = useState<{ reference: string; ok: boolean } | null>(null);
  const result = copyResult?.reference === reference ? copyResult : null;
  const copyReference = async () => {
    if (!reference) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(reference);
      setCopyResult({ reference, ok: true });
    } catch {
      setCopyResult({ reference, ok: false });
    }
  };

  return (
    <aside className="future-note" aria-label="Pedido sin confirmar">
      {showWarning ? <p style={{ whiteSpace: "pre-line" }}>{message}</p> : null}
      {reference ? (
        <>
          <p>Referencia del pedido: <code>{reference}</code></p>
          <button className="cart-retry" type="button" onClick={() => void copyReference()}>
            Copiar referencia
          </button>
          {result ? <p role="status">{result.ok
            ? "Referencia copiada."
            : "No pudimos copiarla. Seleccioná la referencia y copiala manualmente."}</p> : null}
        </>
      ) : <p>No pudimos recuperar una referencia válida. Conservamos el registro; no inicies otra compra.</p>}
      <p>Compartí la referencia con RealStep para investigar el resultado: <a
        href={REALSTEP_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
        aria-label="WhatsApp comercial de RealStep"
      >WhatsApp comercial de RealStep</a>.</p>
      {resolutionMechanism === "reconciliation" ? (
        <p>Podés consultar la resolución de esta referencia con el botón «Consultar estado del pedido». Sólo una resolución de RealStep habilita continuar: la consulta por sí sola no habilita nada.</p>
      ) : (
        <p>Consultar con RealStep no habilita por sí solo una compra nueva: este catálogo todavía no tiene un mecanismo verificable para resolverlo manualmente.</p>
      )}
      <p>Los reintentos habilitados conservan esta misma referencia; no inician una compra nueva.</p>
    </aside>
  );
}
