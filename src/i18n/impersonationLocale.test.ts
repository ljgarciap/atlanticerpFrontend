import { describe, expect, it } from 'vitest'
import esCommon from './locales/es/common.json'
import enCommon from './locales/en/common.json'
import esSecurity from './locales/es/security.json'
import enSecurity from './locales/en/security.json'

// SCRUM-1158 — los textos de «Ver como usuario» existen en es y en en, con las mismas claves, y sin glyphs/emoji embebidos (regla de
// iconografía del cliente, SCRUM-56: el icono se renderiza aparte del texto).

function flatten(obj: unknown, prefix = ''): Record<string, string> {
  if (typeof obj === 'string') return { [prefix]: obj }
  if (obj === null || typeof obj !== 'object') return {}
  return Object.entries(obj as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [k, v]) => ({ ...acc, ...flatten(v, prefix ? `${prefix}.${k}` : k) }), {})
}

const GLOBAL_KEYS = [
  'impersonation_max_minutes', 'impersonation_reason_min_length', 'impersonation_alert_sessions_per_day', 'impersonation_alert_targets_per_hour',
  'impersonation_alert_blocked_writes_per_session',
]

const blocks = {
  'common.impersonation':       [esCommon.impersonation, enCommon.impersonation],
  'security.impersonate':       [esSecurity.impersonate, enSecurity.impersonate],
  'security.impersonations':    [esSecurity.impersonations, enSecurity.impersonations],
} as const

describe('i18n — Ver como usuario', () => {
  for (const [name, [es, en]] of Object.entries(blocks)) {
    it(`${name}: mismas claves en es y en, y ninguna vacía`, () => {
      const f = { es: flatten(es), en: flatten(en) }
      expect(Object.keys(f.es).length).toBeGreaterThan(0)
      expect(Object.keys(f.es).sort()).toEqual(Object.keys(f.en).sort())
      for (const v of [...Object.values(f.es), ...Object.values(f.en)]) expect(v.trim()).not.toBe('')
    })

    it(`${name}: sin emoji ni símbolos de icono embebidos`, () => {
      const all = [...Object.values(flatten(es)), ...Object.values(flatten(en))]
      for (const v of all) expect(v).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿←-⇿✓✔✕]/u)
    })
  }

  it('la acción de la fila y la pestaña existen en es y en', () => {
    expect(esSecurity.users.actions.impersonate).toBeTruthy()
    expect(enSecurity.users.actions.impersonate).toBeTruthy()
    expect(esSecurity.nav.impersonations).toBeTruthy()
    expect(enSecurity.nav.impersonations).toBeTruthy()
  })

  it('los 5 ajustes globales tienen rótulo en es y en, y el grupo existe', () => {
    for (const common of [esCommon, enCommon]) {
      const tab = common.globalSettings.globalTab as { groups: Record<string, string>; labels: Record<string, string> }
      expect(tab.groups.impersonation).toBeTruthy()
      for (const key of GLOBAL_KEYS) expect(tab.labels[key]).toBeTruthy()
    }
  })

  it('el aviso de tope de intentos de los ajustes con contraseña existen en es y en', () => {
    for (const common of [esCommon, enCommon]) {
      const tab = common.globalSettings.globalTab as unknown as Record<string, unknown>
      expect(tab.throttledWait).toBeTruthy()
    }
  })
})
