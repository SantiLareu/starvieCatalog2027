# Checkout StarVie ↔ realstep-api: integración local (estado definitivo)

## Alcance y aislamiento

El harness `/home/santl/realstep-api/test/local-http.mjs` empaqueta el Worker productivo **sin modificarlo** y lo ejecuta en Miniflare. Escucha solo en `127.0.0.1:8787`. Usa `test/local-catalog.json`, Durable Objects SQLite locales, KV local y rate limiting local de 60 solicitudes por minuto.

`outboundService` responde únicamente al catálogo fixture, Resend simulado y Siteverify simulado. Cualquier otra salida recibe HTTP 599 local. `RESEND_API_KEY` es una cadena ficticia; Siteverify usa el secret oficial de prueba y reconoce tokens locales de prueba, con consumo único. No se lee `.dev.vars` ni se usan secretos de producción.

El Worker productivo solo permite `https://starvie.real-step.com.ar` como Origin y consulta su catálogo en esa URL. Para probar el frontend desde `http://localhost:5173`, **solo el adaptador local** traduce el Origin de entrada al permitido y traduce las cabeceras CORS de salida a localhost. El test `x-local-raw-origin: 1` demuestra que el Worker sin adaptar responde 403 a localhost. Este adaptador no está en la configuración publicada.

## Integración frontend/backend

- Contrato real: `POST {base}/api/orders` con `{ catalogId: "starvie", contact, lines, idempotencyKey, turnstileToken? }`, implementado en `src/commerce/orders.ts` (`submitOrder`, `ORDERS_CATALOG_ID`, `ORDERS_PRODUCTION_API = "https://api.real-step.com.ar"`, override de desarrollo `VITE_API_BASE_URL`).
- Clasificación de respuestas en el frontend: 200/201 `completed` o `processing` (`accepted` se trata como `processing`), 202 siempre `processing`, 409 conflicto de idempotencia y 429 con `Retry-After`. Un 502 con `status="failed"` y `orderId` no vacío confirma un fallo terminal; un 502 incompleto o sin estado concluyente es incierto y se recupera mediante el intento persistido. Tras un timeout, el frontend consulta el estado con el mismo payload y la misma `idempotencyKey` sin token; si el Worker responde que falta el token, solicita uno fresco para continuar el mismo intento (`verificationRequired`).
- `src/commerce/localHttp.test.tsx` usa `orders.ts` y `CheckoutModal.tsx` reales desde Vitest; su `fetch` atraviesa HTTP hasta Miniflare en WSL. Simula el widget de Turnstile para no depender de su script remoto e inyecta `submitFn` **solo en la prueba** para fijar `baseUrl` local y prohibir llamadas a la API publicada.

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

Para una sesión manual de Vite, fijar `VITE_API_BASE_URL=http://127.0.0.1:8787`, `VITE_TURNSTILE_ENABLED=true` y la sitekey pública oficial de prueba al iniciar Vite. El script oficial del widget sí requeriría conexión a Cloudflare; los tests automatizados no la requieren.

## Servicios simulados utilizados

- Resend completamente simulado (12 solicitudes interceptadas, 0 salidas de red inesperadas, ningún correo real enviado).
- Siteverify simulado con el secret oficial de prueba; tokens locales de un solo uso.
- Widget de Turnstile simulado en Vitest (`window.turnstile` inyectado); en sesión manual se usa el script real de Cloudflare.

## Resultado de las pruebas de integración (27-09-2026)

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

Las nueve pruebas omitidas en las suites habituales se ejecutaron por separado mediante el harness HTTP real y aprobaron sus nueve casos. Se verificaron 201/completed con `orderId`, consulta idempotente, 409, 400 sin token, 403 por token consumido o vencido, 502 terminal confirmado, 202 processing, 429, timeout seguido de recuperación, CORS del adaptador y el flujo del modal React.

Al finalizar se detuvieron los procesos locales. No quedaron procesos Vitest, Vite ni `workerd` activos, ni puertos 8787 o 5173 escuchando. No hubo deploy, commit ni push. No se modificó Head.

## Estado actual de Turnstile (producción)

Turnstile está **activado en frontend y backend** en producción. El widget usa la acción `order_starvie`; el token se envía solo con el POST que lo obtiene y nunca se guarda en storage. Tras un timeout, el checkout consulta primero con el mismo payload y la misma `idempotencyKey` sin token; el Worker recupera el pedido existente antes de verificar Turnstile. Las referencias anteriores que indicaban que faltaba configurar o activar Turnstile quedaron obsoletas: la configuración ya fue coordinada (sitekey, hostname, acción, secret y habilitación de `starvie` en el Worker) y validada.

## Diferencias entre pruebas locales y producción

- Origen: local usa `http://localhost:5173` con adaptador CORS de prueba; producción exige `https://starvie.real-step.com.ar` sin adaptador.
- Catálogo: local usa `test/local-catalog.json`; producción consulta el catálogo publicado.
- Correo: local simula Resend (sin envíos); producción envía correos reales vía Resend.
- Siteverify: local usa secret de prueba y tokens de un solo uso; producción verifica contra Cloudflare con el secret real.
- Rate limiting y persistencia: locales (SQLite/KV en memoria local); producción con los bindings reales del Worker.

## Prueba real de extremo a extremo (producción)

Se realizó exitosamente una prueba real en producción: pedido procesado correctamente, correo interno recibido por los dos destinatarios de RealStep y confirmación recibida por el cliente. No se incluyen datos personales, identificadores de pedidos reales ni credenciales. No repetir pedidos reales sin autorización explícita.
