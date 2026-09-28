import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
    size: "normal" | "compact";
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.dataset.starvieTurnstile = "";
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile unavailable"));
    script.onerror = () => reject(new Error("Turnstile script failed"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    document.querySelector("script[data-starvie-turnstile]")?.remove();
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

export function turnstileSiteKey(): string | null {
  const env = import.meta.env;
  if (env.VITE_TURNSTILE_ENABLED !== "true") return null;
  const key = env.VITE_TURNSTILE_SITE_KEY?.trim();
  return key || null;
}

export function turnstileEnabled(): boolean {
  return import.meta.env.VITE_TURNSTILE_ENABLED === "true";
}

export function TurnstileWidget({ siteKey, onToken, onUnavailable, resetSignal }: {
  siteKey: string;
  onToken: (token: string) => void;
  onUnavailable: (reason: "expired" | "error") => void;
  resetSignal: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const [reload, setReload] = useState(0);
  const lastResetSignal = useRef(resetSignal);
  const callbacks = useRef({ onToken, onUnavailable });
  callbacks.current = { onToken, onUnavailable };

  useEffect(() => {
    let active = true;
    loadTurnstile().then((api) => {
      if (!active || !container.current) return;
      const id = api.render(container.current, {
        sitekey: siteKey,
        action: "order_starvie",
        size: window.innerWidth < 380 ? "compact" : "normal",
        callback: (token) => { if (active) callbacks.current.onToken(token); },
        "expired-callback": () => { if (active) callbacks.current.onUnavailable("expired"); },
        "error-callback": () => { if (active) callbacks.current.onUnavailable("error"); },
      });
      widget.current = { api, id };
    }).catch(() => { if (active) callbacks.current.onUnavailable("error"); });
    return () => {
      active = false;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey, reload]);

  useEffect(() => {
    if (lastResetSignal.current === resetSignal) return;
    lastResetSignal.current = resetSignal;
    if (widget.current) widget.current.api.reset(widget.current.id);
    else setReload((value) => value + 1);
  }, [resetSignal]);

  return <div className="checkout-turnstile" ref={container} role="group" aria-label="Verificación de seguridad" />;
}
