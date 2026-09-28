# Checkout StarVie ↔ realstep-api: integración local

## Alcance y aislamiento

El harness `/home/santl/realstep-api/test/local-http.mjs` empaqueta el Worker productivo **sin modificarlo** y lo ejecuta en Miniflare. Escucha solo en `127.0.0.1:8787`. Usa `test/local-catalog.json`, Durable Objects SQLite locales, KV local y rate limiting local de 60 solicitudes por minuto.

`outboundService` responde únicamente al catálogo fixture, Resend simulado y Siteverify simulado. Cualquier otra salida recibe HTTP 599 local. `RESEND_API_KEY` es una cadena ficticia; Siteverify usa el secret oficial de prueba y reconoce tokens locales de prueba, con consumo único. No se lee `.dev.vars` ni se usan secretos de producción.

El Worker productivo solo permite `https://starvie.real-step.com.ar` como Origin y consulta su catálogo en esa URL. Para probar el frontend desde `http://localhost:5173`, **solo el adaptador local** traduce el Origin de entrada al permitido y traduce las cabeceras CORS de salida a localhost. El test `x-local-raw-origin: 1` demuestra que el Worker sin adaptar responde 403 a localhost. Este adaptador no está en la configuración publicada.

## Arranque y comandos

En WSL, desde `/home/santl/realstep-api`:

```bash
PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH" node test/local-http.mjs
```

Esperar `LOCAL_REALSTEP_READY http://127.0.0.1:8787`. Detener con Ctrl+C al terminar. En Windows, desde `C:\starvieCatalog2027`:

```powershell
$env:STARVIE_LOCAL_INTEGRATION='1'
npm test -- src/commerce/localHttp.test.tsx --testTimeout=10000 --hookTimeout=10000
Remove-Item Env:STARVIE_LOCAL_INTEGRATION
```

La suite HTTP usa `orders.ts` y `CheckoutModal.tsx` reales desde Vitest en Windows; su `fetch` atraviesa HTTP hasta Miniflare en WSL. Simula el widget de Turnstile para evitar depender de su script remoto. El test usa `submitFn` inyectado **solo en la prueba** para fijar `baseUrl` local y prohibir cualquier llamada a la API publicada. Para una sesión manual de Vite, fijar `VITE_API_BASE_URL=http://127.0.0.1:8787`, `VITE_TURNSTILE_ENABLED=true` y la sitekey pública oficial de prueba al iniciar Vite. El script oficial del widget sí requeriría conexión a Cloudflare; los tests automatizados no la requieren.

## Resultados definitivos del 27-09-2026

El bloqueo anterior estaba relacionado con procesos `workerd` en WSL. Tras un reinicio autorizado de WSL, se completó la validación con solicitudes HTTP reales desde Vitest en Windows hacia el Worker local de Miniflare en WSL.

| Verificación | Resultado |
| --- | --- |
| Integración HTTP real Windows ↔ WSL | 9/9 aprobadas |
| Commerce frontend | 232 aprobadas, 9 omitidas por requerir el harness HTTP |
| Frontend completo | 293 aprobadas, 9 omitidas por la misma razón |
| Backend completo | 85 aprobadas |
| Build StarVie | Correcto |
| Sintaxis backend | Correcta |
| `git diff --check` | Correcto en ambos repositorios |

Las nueve pruebas omitidas en las suites habituales se ejecutaron por separado mediante el harness HTTP real y aprobaron sus nueve casos. Se verificaron 201/completed con `orderId`, consulta idempotente, 409, 400 sin token, 403 por token consumido o vencido, 502 terminal, 202 processing, 429, timeout seguido de recuperación, CORS del adaptador y el flujo del modal React.

Resend fue completamente simulado: se interceptaron 12 solicitudes destinadas a Resend, el contador de salidas de red inesperadas fue 0 y no se enviaron correos reales. Al finalizar se detuvieron los procesos locales. No quedaron procesos Vitest, Vite ni `workerd` activos, ni puertos 8787 o 5173 escuchando. No hubo deploy, commit ni push. No se modificó Head.

## Pendientes antes de producción

1. Activar Turnstile de forma coordinada: el widget real para `starvie.real-step.com.ar` ya fue creado y la Site Key pública y `TURNSTILE_SECRET_STARVIE` están preparados, pero los flags del frontend y del Worker siguen desactivados.
2. Comprobar que la versión del Worker que se publique incluya el secret, el hostname y la action `order_starvie` esperados, sin exponer el valor del secret.
3. Validar los orígenes y el catálogo publicados antes de producción.
4. Coordinar el despliegue del frontend y backend.
