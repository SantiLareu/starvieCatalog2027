import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useDistributor } from "../../commerce/distributor/DistributorContext";
import { formatCuitInput, hasValidCuitShape, normalizeCuitInput } from "../../commerce/distributor/cuit";
import type { DistributorLoginError } from "../../commerce/distributor/types";
import "./distributor.css";

function loginErrorMessage(error: DistributorLoginError): string {
  switch (error.kind) {
    case "invalid-cuit":
      return "El CUIT/CUIL no es válido. Revisá los 11 dígitos y el dígito verificador.";
    case "invalid-credentials":
      return "CUIT/CUIL o contraseña incorrectos.";
    case "invalid-request":
      return "Revisá los datos ingresados e intentá de nuevo.";
    case "rate-limited":
      return "Demasiados intentos. Esperá unos minutos e intentá de nuevo.";
    case "unavailable":
      return "El acceso para distribuidores todavía no está activo en el servidor. Podés seguir navegando el catálogo como visitante.";
    case "network":
      return "Sin conexión con el servidor. Revisá tu conexión e intentá de nuevo.";
  }
}

export function DistributorLoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { login } = useDistributor();
  const [cuit, setCuit] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cuitRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  // Cerrar siempre limpia la contraseña de la memoria: tipeada o no, nunca
  // sobrevive al modal (no hay storage, pero tampoco queda en el estado).
  const closeAndClear = useCallback(() => {
    setPassword("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowPassword(false);
    const timer = window.setTimeout(() => cuitRef.current?.focus(), 30);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) closeAndClear();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, closeAndClear]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const digits = normalizeCuitInput(cuit);
    if (!hasValidCuitShape(digits)) {
      setError(loginErrorMessage({ kind: "invalid-cuit" }));
      return;
    }
    if (password.length === 0) {
      setError("Ingresá tu contraseña.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(digits, password);
      // La contraseña no sobrevive al intento: ni en estado ni en storage.
      setPassword("");
      if (result.kind === "ok") {
        closeAndClear();
      } else {
        setError(loginErrorMessage(result.error));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="distributor-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!submitting) closeAndClear();
      }}
    >
      <section
        className="distributor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="distributor-login-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close distributor-modal__close"
          type="button"
          onClick={closeAndClear}
          disabled={submitting}
          aria-label="Cerrar acceso de distribuidores"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <p className="distributor-modal__eyebrow">StarVie 2027 · Trade</p>
        <h2 id="distributor-login-title">Acceso distribuidores</h2>
        <p className="distributor-modal__intro">
          Ingresá con tu CUIT/CUIL para ver tus precios especiales. El descuento
          lo define y lo valida el servidor en cada pedido.
        </p>

        <form onSubmit={submit} noValidate>
          <div className="distributor-field">
            <label htmlFor="distributor-cuit">CUIT / CUIL</label>
            <input
              ref={cuitRef}
              id="distributor-cuit"
              name="cuit"
              inputMode="numeric"
              autoComplete="username"
              placeholder="20-12345678-9"
              value={cuit}
              disabled={submitting}
              onChange={(event) => setCuit(formatCuitInput(event.target.value))}
              aria-invalid={error != null}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <div className="distributor-field">
            <label htmlFor="distributor-password">Contraseña</label>
            <div className="distributor-password">
              <input
                id="distributor-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                disabled={submitting}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error != null}
              />
              <button
                type="button"
                className="distributor-password__toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={showPassword}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="distributor-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="distributor-submit" type="submit" disabled={submitting}>
            {submitting ? "Ingresando…" : "Ingresar"}
          </button>
          <p className="distributor-modal__note">
            Sesión segura por cookie del servidor. No guardamos tu contraseña
            ni tu token en el navegador.
          </p>
        </form>
      </section>
    </div>,
    document.body,
  );
}
