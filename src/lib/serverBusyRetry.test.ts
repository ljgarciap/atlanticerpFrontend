import { describe, expect, it } from 'vitest'
import { isRetryableMethod, isServerBusy, serverBusyDelay } from './serverBusyRetry'

const busy = { response: { status: 503, data: { code: 'server_busy', message: 'Servicio ocupado' } } }

describe('serverBusyRetry', () => {
  it('reconoce el 503 server_busy de nginx, en JSON, texto y Blob (descargas)', async () => {
    expect(await isServerBusy(busy)).toBe(true)
    expect(await isServerBusy({ response: { status: 503, data: '{"code":"server_busy"}' } })).toBe(true)
    expect(await isServerBusy({ response: { status: 503, data: new Blob(['{"message":"x","code":"server_busy"}']) } })).toBe(true)
  })

  it('no trata como saturación otros 503 ni otros estados', async () => {
    expect(await isServerBusy({ response: { status: 503, data: { code: 'pac_unavailable' } } })).toBe(false)
    expect(await isServerBusy({ response: { status: 500, data: { code: 'server_busy' } } })).toBe(false)
    expect(await isServerBusy({ response: { status: 503, data: new Blob(['otra cosa']) } })).toBe(false)
    expect(await isServerBusy({ message: 'Network Error' })).toBe(false)
    expect(await isServerBusy(null)).toBe(false)
  })

  it('solo reintenta lecturas', () => {
    for (const m of ['get', 'GET', 'head', 'options', undefined]) expect(isRetryableMethod(m)).toBe(true)
    for (const m of ['post', 'put', 'patch', 'delete']) expect(isRetryableMethod(m)).toBe(false)
  })

  it('la espera crece por intento y varía ±30 % para que las llamadas simultáneas no coincidan', () => {
    expect([0, 1, 2].map(n => serverBusyDelay(n, () => 0.5))).toEqual([600, 1500, 3500])
    expect(serverBusyDelay(0, () => 0)).toBe(420)
    expect(serverBusyDelay(0, () => 1)).toBe(780)
    expect(serverBusyDelay(9, () => 0.5)).toBe(3500)
  })
})
