import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import esCommon   from './locales/es/common.json'
import esAuth     from './locales/es/auth.json'
import esSecurity from './locales/es/security.json'
import esSettings from './locales/es/settings.json'
import esCrm      from './locales/es/crm.json'
import esVentasDiseno from './locales/es/ventasDiseno.json'
import esCompras   from './locales/es/compras.json'
import esAiUsage   from './locales/es/aiUsage.json'
import esBodega    from './locales/es/bodega.json'
import esServicios from './locales/es/servicios.json'
import esAdminContab from './locales/es/adminContab.json'
import esLogs      from './locales/es/logs.json'
import enCommon   from './locales/en/common.json'
import enAuth     from './locales/en/auth.json'
import enSecurity from './locales/en/security.json'
import enSettings from './locales/en/settings.json'
import enCrm      from './locales/en/crm.json'
import enVentasDiseno from './locales/en/ventasDiseno.json'
import enCompras   from './locales/en/compras.json'
import enAiUsage   from './locales/en/aiUsage.json'
import enBodega    from './locales/en/bodega.json'
import enServicios from './locales/en/servicios.json'
import enAdminContab from './locales/en/adminContab.json'
import enLogs      from './locales/en/logs.json'

const savedLang = localStorage.getItem('atlanticerp_lang') ?? 'es'

i18n.use(initReactI18next).init({
  resources: {
    es: { common: esCommon, auth: esAuth, security: esSecurity, settings: esSettings, crm: esCrm, ventasDiseno: esVentasDiseno, compras: esCompras, aiUsage: esAiUsage, bodega: esBodega, servicios: esServicios, adminContab: esAdminContab, logs: esLogs },
    en: { common: enCommon, auth: enAuth, security: enSecurity, settings: enSettings, crm: enCrm, ventasDiseno: enVentasDiseno, compras: enCompras, aiUsage: enAiUsage, bodega: enBodega, servicios: enServicios, adminContab: enAdminContab, logs: enLogs },
  },
  lng:          savedLang,
  fallbackLng:  'en',
  defaultNS:    'common',
  ns:           ['common', 'auth', 'security', 'settings', 'crm', 'ventasDiseno', 'compras', 'aiUsage', 'bodega', 'servicios', 'adminContab', 'logs'],
  interpolation: { escapeValue: false },
})

// BUG-07/10 (SCRUM-29): document.documentElement.lang nunca se actualizaba,
// rompiendo screen readers/WCAG 3.1.1 cuando la UI cambiaba de idioma.
document.documentElement.lang = i18n.language
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
