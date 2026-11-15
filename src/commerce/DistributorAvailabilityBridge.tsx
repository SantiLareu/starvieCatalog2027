/**
 * Puente de disponibilidad para el inicio de sesión de distribuidor.
 *
 * - Vive bajo los DOS proveedores (CommerceProvider por fuera,
 *   DistributorProvider por dentro): así puede leer el carrito y la sesión.
 * - No renderiza nada: sólo dispara la reconciliación cuando la
 *   autenticación de distribuidor pasa de anónima a autenticada.
 * - La reconciliación usa el catálogo YA cargado: no hay ninguna consulta
 *   extra, no se duplica el polling y la persistencia del carrito no cambia
 *   (el carrito sigue compartido entre cuentas del mismo navegador).
 */
import { useEffect, useRef } from "react";
import { useCommerce } from "./CommerceContext";
import { useOptionalDistributor } from "./distributor/DistributorContext";

export function DistributorAvailabilityBridge() {
  const commerce = useCommerce();
  const distributor = useOptionalDistributor();
  const isAuthenticated = distributor?.isAuthenticated ?? false;
  const reconcileAvailability = commerce.reconcileAvailability;
  // Estado de autenticación anterior: sólo la TRANSICIÓN (anónimo →
  // autenticado) reconcilia; un simple re-render no vuelve a reconciliar.
  const wasAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && !wasAuthenticatedRef.current) {
      reconcileAvailability();
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, reconcileAvailability]);
  return null;
}
