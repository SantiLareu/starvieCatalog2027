import { useState } from "react";
import { useDistributor } from "../../commerce/distributor/DistributorContext";
import { DistributorLoginModal } from "./DistributorLoginModal";
import "./distributor.css";

/**
 * Punto de entrada de distribuidores en la toolbar.
 * - Sin sesión: botón "Distribuidores" que abre el login.
 * - Con sesión: distintivo "Distribuidor" + cierre de sesión. El header no
 *   muestra porcentajes: el descuento vive en la ficha, la hoja y el carrito.
 * - Backend no disponible: el login informa que el acceso aún no está activo
 *   en el servidor; nunca se presenta como autenticación operativa.
 */
export function DistributorAccountButton() {
  const { auth, discountPercent, logout } = useDistributor();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutNotice, setLogoutNotice] = useState<string | null>(null);

  if (auth.status === "authenticated" && discountPercent != null) {
    return (
      <div className="distributor-account">
        <span className="distributor-account__badge" title="Precios de distribuidor activos">
          Distribuidor
        </span>
        <button
          className="distributor-account__logout"
          type="button"
          disabled={loggingOut}
          onClick={() => {
            setLoggingOut(true);
            setLogoutNotice(null);
            void logout()
              .then((result) => {
                /* El servidor no confirmó la revocación: la sesión sigue
                   viva y no se anuncia un cierre exitoso. */
                if (result.kind === "unconfirmed") setLogoutNotice("La sesión sigue activa");
              })
              .finally(() => setLoggingOut(false));
          }}
        >
          {loggingOut ? "Saliendo…" : "Salir"}
        </button>
        {logoutNotice ? (
          <span className="distributor-expired" role="status">
            {logoutNotice}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        className="distributor-entry"
        type="button"
        onClick={() => setLoginOpen(true)}
        disabled={auth.status === "checking"}
      >
        {auth.status === "checking" ? "Distribuidores…" : "Distribuidores"}
      </button>
      {auth.status === "anonymous" && auth.expired ? (
        <span className="distributor-expired" role="status">
          Sesión vencida
        </span>
      ) : null}
      <DistributorLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
