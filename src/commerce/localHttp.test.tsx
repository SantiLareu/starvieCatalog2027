/** Run only with STARVIE_LOCAL_INTEGRATION=1 and the WSL local-http harness. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CheckoutModal } from './CheckoutModal';
import { submitOrder, type OrderPayload } from './orders';
import type { CommerceProduct, PresentedLine } from './types';

const BASE = 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:5173';
const nativeFetch = globalThis.fetch;
const seenUrls: string[] = [];
const enabled = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.STARVIE_LOCAL_INTEGRATION === '1';

function payload(email = 'local@example.test', key = crypto.randomUUID()): OrderPayload {
  return {
    contact: { name: 'Test Local', legalName: 'Local SRL', email },
    lines: [{ productId: 'raptor+', qty: 1 }],
    idempotencyKey: key,
  };
}

const localFetch: typeof fetch = (input, init) => {
  seenUrls.push(String(input));
  if (!String(input).startsWith(BASE)) throw new Error('Local integration must not call a published API');
  const headers = new Headers(init?.headers);
  headers.set('Origin', ORIGIN);
  return nativeFetch(input, { ...init, headers });
};

function post(data: OrderPayload, token?: string, fetchImpl = localFetch, timeoutMs = 15000) {
  return submitOrder(data, { baseUrl: BASE, turnstileToken: token, fetchImpl, timeoutMs });
}

describe.skipIf(!enabled)('StarVie → realstep-api: HTTP local aislado', () => {
  beforeAll(async () => {
    const health = await nativeFetch(`${BASE}/health`);
    expect(health.ok).toBe(true);
  });

  afterAll(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('CORS local usa adaptador; Worker sin adaptar rechaza localhost', async () => {
    const preflight = await nativeFetch(`${BASE}/api/orders`, {
      method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const raw = await nativeFetch(`${BASE}/api/orders`, {
      method: 'OPTIONS', headers: { Origin: ORIGIN, 'x-local-raw-origin': '1' },
    });
    expect(raw.status).toBe(403);
  });

  it('crea pedido con catálogo y orderId; mismo payload recupera completed; cambio da 409', async () => {
    const original = payload();
    const first = await post(original, `local-pass-${crypto.randomUUID()}`);
    expect(first.kind).toBe('completed');
    if (first.kind !== 'completed') return;
    expect(first.orderId).toMatch(/^RS-/);
    const emailsBeforeRetry = (await (await nativeFetch(`${BASE}/__local/stats`)).json()).resend;
    expect(await post(original)).toEqual(first);
    const emailsAfterRetry = (await (await nativeFetch(`${BASE}/__local/stats`)).json()).resend;
    expect(emailsAfterRetry).toBe(emailsBeforeRetry);
    const changed = { ...original, lines: [{ productId: 'raptor+', qty: 2 }] };
    expect((await post(changed)).kind).toBe('conflict');
  });

  it('Turnstile exige token; token gastado falla y retry del pedido existente no lo requiere', async () => {
    const noToken = payload();
    expect((await post(noToken)).kind).toBe('verificationRequired');
    const token = `local-pass-${crypto.randomUUID()}`;
    const created = await post(noToken, token);
    expect(created.kind).toBe('completed');
    expect((await post(payload(), token)).kind).toBe('verificationRequired');
    expect((await post(payload(), 'expired-token')).kind).toBe('verificationRequired');
    expect(await post(noToken)).toEqual(created);
  });

  it('fallo terminal devuelve 502 y no se clasifica como retryable', async () => {
    const result = await post(payload('terminal@example.test'), `local-pass-${crypto.randomUUID()}`);
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') expect(result.orderId).toMatch(/^RS-/);
  });

  it('timeout tras creación recupera el mismo pedido y orderId sin token repetido', async () => {
    const original = payload();
    const delayedFetch: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Origin', ORIGIN);
      headers.set('x-local-delay-response', '250');
      return nativeFetch(input, { ...init, headers });
    };
    expect((await post(original, `local-pass-${crypto.randomUUID()}`, delayedFetch, 50)).kind).toBe('unknown');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const recovered = await post(original);
    expect(recovered.kind).toBe('completed');
    if (recovered.kind === 'completed') expect(recovered.orderId).toMatch(/^RS-/);
  });

  it('rate limiting local devuelve HTTP 429 y Retry-After', async () => {
    let response: Response | null = null;
    for (let i = 0; i < 61; i++) {
      response = await nativeFetch(`${BASE}/api/orders`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'cf-connecting-ip': '192.0.2.44' },
        body: '{}',
      });
    }
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('60');
  });

  it('el modal React usa HTTP real y confirma sin enviar email real', async () => {
    const product = { id: 'raptor+', nombre: 'Raptor+ Local', disponible: true } as CommerceProduct;
    const presented: PresentedLine[] = [{ line: { productId: 'raptor+', qty: 1 }, product, subtotal: 500 }];
    let onToken: (token: string) => void = () => {};
    window.turnstile = {
      render: (_element, options) => { onToken = options.callback; return 'local-widget'; },
      reset: () => {}, remove: () => {},
    };
    vi.stubEnv('VITE_TURNSTILE_ENABLED', 'true');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    const clearCart = vi.fn();
    const submitFn: typeof submitOrder = (data, options) => submitOrder(data, {
      ...options, baseUrl: BASE, fetchImpl: localFetch,
    });
    render(<CheckoutModal open onClose={() => {}} presented={presented} total={500} clearCart={clearCart} submitFn={submitFn} />);
    fireEvent.change(screen.getByLabelText('Nombre y apellido *'), { target: { value: 'Test Local' } });
    fireEvent.change(screen.getByLabelText('Razón social *'), { target: { value: 'Local SRL' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico *'), { target: { value: 'ui@example.test' } });
    await waitFor(() => expect(screen.getByRole('group', { name: 'Verificación de seguridad' })).toBeVisible());
    act(() => onToken(`local-pass-${crypto.randomUUID()}`));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(seenUrls.length).toBeGreaterThan(0));
    expect(seenUrls.at(-1)).toBe(`${BASE}/api/orders`);
    expect(await screen.findByText(/^N° RS-/)).toBeVisible();
    expect(clearCart).toHaveBeenCalledOnce();
    cleanup();
    delete window.turnstile;
  });

  it('todo egreso queda dentro de catálogo, Resend y Siteverify simulados', async () => {
    const stats = await (await nativeFetch(`${BASE}/__local/stats`)).json();
    expect(stats).toMatchObject({ blocked: 0 });
    expect(stats.resend).toBeGreaterThan(0);
    expect(stats.siteverify).toBeGreaterThan(0);
  });

  it('fallo transitorio produce 202 processing y conserva la referencia en el retry', async () => {
    const original = payload('processing@example.test');
    const first = await post(original, `local-pass-${crypto.randomUUID()}`);
    expect(first.kind).toBe('unknown');
    const retry = await post(original);
    expect(retry.kind).toBe('processing');
    if (retry.kind === 'processing') expect(retry.orderId).toMatch(/^RS-/);
  });
});
