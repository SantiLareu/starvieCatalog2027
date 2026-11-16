# StarVie 2027 — operación de la etapa estable

Guía de entrada operativa; no reemplaza los detalles técnicos enlazados. B2B completo: otro proyecto.
Este cierre solo documenta: no migra datos, no prueba pedidos reales ni publica cambios.

## Versiones y evidencia

| Componente | Versión estable / comprobación |
| --- | --- |
| Frontend GitHub Pages | `b664e9e726793c4eec5877e6f968131f1db816d5`; `origin/main` coincide. |
| Manifiesto publicado | `sha256-c1eba26ae8892f914362a80c1ac7df5d67d37be6f2004d9dfc74f53fa3284229`; coincide con el hash del código limpio. |
| Worker distribuidores | `realstep-api-distributor-candidate`, v14: `59f645b9-c6d8-4d92-b87a-aa694903bcf6`, tráfico activo 100%. |
| Worker público | `realstep-api`: `aa367056-3f96-40f2-bd77-b87200230706`, activo según consulta de su configuración. |

[Actions de la publicación frontend](https://github.com/SantiLareu/starvieCatalog2027/actions/runs/43901479944): finalizado con éxito.
Frontend: https://starvie.real-step.com.ar. API pública: https://api.real-step.com.ar; `/health` responde correctamente.
La URL de distribuidores es independiente y se compila mediante `VITE_DISTRIBUTOR_API_BASE_URL`.
Pedidos públicos, distribuidores y correos reales: éxito confirmado por el operador; no repetido en este cierre.
Última validación de la corrección: TypeScript, build y 532 tests focalizados aprobados; navegador E2E pendiente de bibliotecas locales.

## Arquitectura y contratos

- React 19 + TypeScript + Vite 8; StPageFlip, Swiper; alojamiento estático en Pages.
- `CommerceProvider` mantiene catálogo/carrito; `DistributorProvider` maneja sesión y cotizaciones; `Magazine` presenta el catálogo.
- Login/cotización/pedidos de distribuidor usan su cliente HTTP y Worker; no comparten el envío público.
- Workers recalculan disponibilidad, precios y descuentos; D1 guarda cuentas/sesiones; Durable Objects coordinan autenticación y pedidos.
- KV conserva el índice de fallos; Durable Objects son la autoridad de estado/idempotencia; el rate limiter protege endpoints y Resend entrega correos.
- El POST lleva identidad de productos y cantidades, contacto y clave idempotente; nunca precios como autoridad.
- Carrito: identidad/cantidad en `localStorage`; contacto solo en `sessionStorage`; cookies de sesión HttpOnly, sin tokens en storage.
- `sessionId` opaco del backend comprueba continuidad en memoria; no se fabrica identidad desde descuento o vencimiento.

## Productos y precios

1. En un checkout limpio actualizado, editar `catalog/products.xlsx`; mantener `id` único y estable.
2. Ejecutar `npm run import-products` y `npm run check-products`; revisar el diff de datos generados.
3. `disponible=false` conserva el hotspot y marca falta de disponibilidad; eliminar la fila retira el producto del catálogo vivo.
4. Hotspots nuevos requieren geometría explícita en `src/data/CatalogData.ts`; no editarla para un cambio de precio.
5. Precio/SKU faltantes: consultar [productos-pendientes.md](productos-pendientes.md); no sustituir ausencia por cero.
6. Si cambian imágenes/PDF, usar sus scripts específicos; para precios no regenerar páginas ni modificar PageFlip.
7. Publicar datos y manifiestos coherentes mediante el mismo deploy; el Worker consulta el catálogo publicado.
Cambios de precio se aplican sin aviso al carrito; disponibilidad se reconcilia. [Detalle técnico](PRODUCCION.md).

## Alta de distribuidores en D1 — procedimiento futuro, no ejecutado aquí

- Usar el checkout backend operativo `/home/santl/realstep-distributor-candidate`; verificar versión, configuración y binding antes de escribir.
- Confirmar que `DISTRIBUTOR_DB` apunta al D1 correcto (`realstep-distributors-db` en la configuración revisada); no usar la base local.
- Verificar esquema existente de `distributors`; no reaplicar migraciones por rutina ni crear otra base para un alta.
- Preparar el registro con contraseña introducida en prompt oculto:
  `node scripts/distributor-admin.mjs remote-add --cuit <CUIT_VALIDO> --database <D1_CONFIRMADO> --discount 20 --prepare-remote`
- Ese comando prepara un SQL privado con hash scrypt; no contacta a Cloudflare ni crea la cuenta todavía.
- Solo el operador autorizado aplica el archivo preparado con `npx wrangler d1 execute <D1_CONFIRMADO> --remote --file <SQL_PRIVADO>`.
- El registro incluye ID, CUIT normalizado, `password_hash`, `discount_percent`, estado `enabled`, epoch y fechas; nunca contraseña plana.
- No mostrar ni versionar contraseña, hash, SQL privado o datos de cuenta; transferir credenciales por el canal privado acordado.
- El comando `add` sin prefijo `remote-` administra D1 local: no da de alta cuentas de producción.
- Validar después login y cotización sin crear pedidos. Cambiar estado/epoch o revocar sesiones requiere operación autorizada separada.

## Login, descuento y pedidos

- Distribuidor ingresa con CUIT y contraseña; la cookie mantiene sesión y el servidor autoriza el descuento configurado en D1.
- El descuento comercial actual es 20%; no está fijado como autoridad en el frontend ni debe alterarse desde el navegador.
- Solo una cotización vigente confirma importes y porcentaje visibles; logout/expiración invalidan precios privados, sin vaciar el carrito.
- Público: `POST /api/orders`, catálogo `starvie`; conserva su flujo e idempotencia propios.
- Distribuidor: `POST /api/distributor/orders`; la sesión identifica la cuenta y el backend separa sus claves de otras cuentas/canales.
- Cada compra independiente genera una clave nueva y conserva su registro; doble clic no produce dos envíos simultáneos.
- Aceptación válida registrada: confirmación automática; no se necesita recepción ni aprobación administrativa para otra compra.
- Envío incierto: informar que no pudo confirmarse; no reintentar automáticamente. Otra compra requiere acción explícita y nueva clave.
- Repetir el contenido con otra clave puede duplicar una compra que sí llegó; idempotencia protege el mismo intento, no compras distintas.
- Rechazo previo de Turnstile permite reintento explícito del mismo intento con token fresco; no confundirlo con un pedido aceptado.
- Cada compra activa queda aislada por su referencia y sesión; una respuesta tardía de otra sesión no se aplica al carrito actual.

## Historial UNRESOLVED

No borrar referencias, limpiar almacenamiento, reasignar dueño ni marcar RECEIVED/NOT_RECEIVED sin evidencia verificable.
Esto incluye registros del navegador y registros del backend/D1: una operación sobre ellos requiere justificación y autorización separadas.
Las referencias antiguas permanecen intactas; no bloquean el inicio de compras independientes del distribuidor ni exigen conciliación.

## Turnstile, Resend y configuración — solo nombres

- Variables frontend de Actions: `VITE_DISTRIBUTOR_API_BASE_URL`, `VITE_TURNSTILE_ENABLED`, `VITE_TURNSTILE_SITE_KEY`.
- Variable de desarrollo público: `VITE_API_BASE_URL`. Ninguna `VITE_*` puede contener secretos; modificar variables exige rebuild.
- Variables backend: `DISTRIBUTOR_AUTH_ENABLED`, `DISTRIBUTOR_HOST`, `PUBLIC_ORDERS_ENABLED`, `TURNSTILE_ENABLED_CATALOGS`.
- Overrides opcionales: `TURNSTILE_ACTION_STARVIE`, `TURNSTILE_HOSTNAME_STARVIE`.
- Secretos backend: `RESEND_API_KEY`, `TURNSTILE_SECRET_STARVIE`; fallback de Turnstile: `TURNSTILE_SECRET_KEY`.
- Bindings: `DISTRIBUTOR_DB`, `DISTRIBUTOR_AUTH`, `ORDER_COORDINATOR`, `REALSTEP_IDEMPOTENCY`, `ORDER_RATE_LIMITER`.
- Legado administrativo, fuera del checkout normal: `DISTRIBUTOR_RECONCILIATION_ENABLED`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_HOST`.
- Turnstile usa acción `order_starvie`; token de un solo uso, solo en el POST que lo necesita; verificación/secret en el Worker.
- Solo el valor literal `false` desactiva la protección frontend; activa sin sitekey bloquea el envío. No desactivar para resolver incidentes.
- Resend se invoca desde el backend para los correos comerciales/cliente; no reenviar pedidos para comprobar entrega ni registrar contactos en logs públicos.

## Deploy y rollback seguro

- Siempre desde una base limpia actualizada; revisar diff y autorización. `main` del árbol original atrasado no es base de publicación.
- Push aprobado a `main` activa `.github/workflows/deploy.yml`; valida variables, compila `dist` y publica Pages. No subir backend junto al frontend por rutina.
- Antes del próximo cambio funcional: validaciones correspondientes de [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md); este cierre documental no repite suites.
- Después: Actions verde, dominio, `/products.json`, `/products-version.json`, `/app-version.json` y widget, sin enviar pedidos reales.
- Rollback frontend: elegir revisión conocida compatible, revisar datos/config y crear un revert normal; no force ni reescritura de historial.
- El revert de datos puede restaurar precios anteriores: revisar Excel/JSON antes de publicarlo; no borrar historiales del navegador.
- Rollback backend: operador autorizado selecciona versión compatible del Worker correcto; comprobar primero bindings y esquema.
- El rollback del Worker no restaura D1, KV ni Durable Objects: no revierte pedidos ni correos. [Reglas de Cloudflare](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## Git e inventario para ordenar después — nada eliminado

- Original `/home/santl/starvieCatalog2027`: `main=c7c52a9`, `origin/main=b664e9e`; conserva cambios y archivos sin seguimiento.
- Pendientes originales: workflows/documentación/auditorías, comercio/distribuidores, precios/UI/mobile, PageFlip/PdfPage y specs; no publicar el conjunto indiscriminadamente.
- `/home/santl/starvie-checkout-recovered`: HEAD separado `b664e9e`, limpio; conservar hasta respaldar evidencia de la publicación.
- `/home/santl/starvie-pilot`: `pilot/distributor-system-candidate=b2833c9`; pendientes `.github/workflows/e2e-pr.yml` y `vite.local.config.ts`.
- `.git/gentle-ai/candidate-views/95fe833e-e7ae-4ffa-bf6a-ca0d27ba94f4`: HEAD separado `3acc25c`, limpio; candidato a archivo tras revisar procedencia.
- `/tmp/starvie-checkout-isolated`: directorio ausente, registro prunable; su índice permitió recuperar el patch: no ejecutar prune sin asegurar respaldo.
- `/home/santl/starvie-checkout-recovery-artifacts`: patch, manifiesto y comprobantes persistentes; conservar fuera del commit documental.
- `/home/santl/starvie-stable-docs`: base `b664e9e`, solo esta guía nueva; sin commit/publicación durante el cierre.
- Locales candidatos a legado: `src/commerce/scopedOrderAttempt.ts` y `src/commerce/distributor/attemptIdentity.ts`; no forman parte del release: comparar/respaldar antes de decidir.
- Legado versionado a evaluar: `CheckoutUncertainNotice.tsx` y helpers de conciliación; conservan tests/historia, sin uso en el checkout normal. No eliminarlos ahora.
- Solapamiento: `PRODUCCION.md` y `DEPLOY_CHECKLIST.md` repiten validaciones; el primero conserva explicaciones antiguas del marcador global.
- `docs/distributors.md` backend mezcla estado «local/no desplegado» y fases anteriores; no usar esos rótulos como estado actual.
- Auditorías `commit-preparation-*`, `precommit-audit-*`, `png16-audit-*`, `phase-1-notes.md`, `viewer-lab-report.md` y `design/`: clasificar como evidencia histórica antes de archivar.
- `mobile-pilot.md` y documentos mobile/desktop son historial técnico; enlazar lo vigente, sin tratarlos como instrucciones operativas duplicadas.

## Pendientes y próxima revisión visual

- No hay portal B2B completo, gestión integral de clientes ni backoffice nuevo en este alcance; llevarlos al proyecto separado.
- Revisar compatibilidad de productos sin precio en ambos Workers; no inferirla solo de pedidos exitosos con precio.
- Reanudar E2E visual cuando el entorno tenga bibliotecas de Chromium; el éxito de correos no cubre regresiones visuales.
- Revisar precios/badges, saltos de línea y controles a 320/360 px, orientación y zoom, con foco/contraste accesibles.
- Revisar nitidez Retina/4K contra peso de descarga y memoria antes de regenerar imágenes; ver [calidad visual](catalog-visual-quality.md).
- Transparencia real de páginas PDF requiere separar fondo y contenido: CSS no vuelve transparentes bitmaps opacos; ver [escena desktop](desktop-stage.md).
- Revisar consistencia entre modal, hojas mobile y carrito; conservar navegación, hotspots, física de tapas y movimiento reducido.
