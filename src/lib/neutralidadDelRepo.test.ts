import { describe, expect, it } from 'vitest'

/**
 * Fase 4b (docs/specs/fase4b-dataset-demo-generico.md §6.1) — contrato de neutralidad del frontend: ni organizaciones, marcas, bancos y lugares del cliente
 * anterior ni el vocabulario de su sector en `src` y `e2e`. Misma lista que `Tests\Support\TerminosDelClienteAnterior` del backend.
 *
 * Excepciones TEMPORALES con dueño (`ALLOWED`): son términos del MODELO (claves y etiquetas de categoría del catálogo de productos, campo `dialux`) y salen cuando su fase termine. Solo pueden encogerse: el contrato falla si un dueño ya no tiene ningún uso.
 */
const ENTIDADES = [
  'decameron', 'westland', 'costa bella', 'torre delta', 'torre pac[ií]fic', 'torre business park', 'hotel riu', 'grupo constructor delta',
  'minsa', 'ministerio de salud', 'ulatina', 'universidad latina', 'supermercado el rey', 'elrey', 'aeropuertospa', 'plazatocumen', 'plaza tocumen',
  'grupopacifico', 'cl[ií]nica san fernando', 'clinicasf', 'pitsa', 'constructoramc', 'ff-inversiones', 'atlapa', 'iluminex', 'lightcorp', 'luxtech',
  'atlantic home', 'signature lighting', 'nordic glow', 'proline comercial', 'banco general', 'banistmo', 'global bank', 'multibank', 'multiplaza',
  'super 99', 'paitilla', 'albrook', 'tocumen', 'bethania', 'costa del este', 'punta pac[ií]fica', 'condado del rey', 'farmacias transporte',
  'automotriz rey', 'ocean view', 'grupo melo', 'gelabert', 'farallon', 'illuminations',
  // Fase 8 — nombres de almacén del cliente anterior (los almacenes son configurables).
  'showrooms?', 'obarrio',
  // Fase 14f — la zona franca de Colón (Panamá) salió del núcleo.
  'zona.?libre',
]
const SECTOR_CI = [
  'iluminaci', 'iluminacon', 'luminaria', 'l[aá]mpara', 'lamparas', 'downlight', 'candelabro', 'bombill', 'chandelier', 'luminaire', 'dialux',
  // Fase 9c — campos de la ficha técnica de iluminación (ahora un catálogo por empresa).
  'luminous', 'lum[ií]nic', 'flujo luminoso', 'casquillo', 'color_temperature', 'temperatura de color', 'ip_rating', 'socket_type',
]
// siglas: distinguen mayúsculas
const SECTOR_CS = ['\\bLED\\b', '(?<![A-Za-z])LAMP(?![A-Za-z])']

const ALLOWED: Record<string, string> = {}

// Nombres y apodos de PERSONAS del cliente anterior como SHA-256 de la palabra normalizada (minúsculas, sin acentos). Van en hash a propósito:
// este repositorio es público y la lista no debe publicar los nombres que prohíbe.
const NOMBRES_SHA256 = new Set([
  '01a0eedaf62153cf1acefc6322866e67b3dc78c10ed7626ec6d8fe508c589b79',
  '057e3bb503f7ec4f6ee10618208867540b4fd1b181a2edf6a84be2c009058279',
  '07d046d5fac12b3f82daf5035b9aae86db5adc8275ebfbf05ec83005a4a8ba3e',
  '0f83de146cdf1f860db9e1173aa734f43ca0c61374e5b8ed650ec4dcf86c5512',
  '1310262bb01b48c1cf4202d9aad0aeeaefceb227c33f0dbf348a3a4f9fe3d275',
  '21598187b9c958935c9b8ac7870f2564c7725fa5e7d82a51d94f5e9c71608d03',
  '32c151a9033ee62828fde406a8e9fa5eb23809c04e1147f14d05f6af4b5e64a9',
  '35091410bb0ef630d2cc14f0851c12a4461191cabc6926e3544f99bdc5e813bc',
  '395acd169ca407da8ba4ce63046bbea547468235c2823b28d28a4d66f1bd7bb6',
  '41d41e4a03aa8226c9819a94f0d5ca5caf01afaf51c22e33309f9d6ff13783a3',
  '4bbfa1f1b0462b4844b74c34fdd297aba2a82ac2355e64308578f5acf1f5e8bf',
  '4f22df54942898f169802bbfe34d6d5b1455cdeb50b387bd5b6a3a6a2496cef7',
  '57f6c877d2c6118c8bde0754aeee6ffda08846339350ddff9fe2d1ce0512528d',
  '59345b420d4ba04daa9ffc2c7621fbd8d3e4ef29d16da08579c12d81e379d06c',
  '5a40556b200bb380c49368613afd1116f9b927700d60a734983c9dd7129b9809',
  '5a5ad3c9a74843acf0c3e9bd4c4ef2d8b2bad95f0731363825954715c0f4c977',
  '5a8707f9fa11b436e2a6019a8590e4b1a45cccd3b8873ae1532e10b38fc61b96',
  '5ff7c9f274d859afca8e59d2916c35fcb6bd5fdb538a9a36e5e2e4cd99f1ffba',
  '62f385917c82d24eb2c96390033915e61c1705b25afc867378be34c4e5428e8e',
  '6b5fd0df09e0aa7e2ab460fc73ecca55dbedf017d3a0b11eabf44cc66028ce92',
  '6c08730892267973a25c439936bc3b38e253b4d6100df43ad910abe5cc2a3241',
  '6f5249419be8a2d6afbb0bb2d6c2877fbbe9c2085601d8e63f80506f570c0883',
  '70a1ed14005ea8536bd99e687f033b835239ab02b6cdae718800261c3649db92',
  '71be92cbdfe91357146afad81827a981ec58f5a3e69e9bd4527acd74b1927938',
  '7722aba40e28d98f1440213fb4a13b66ff1c48b32ecd6c9b836221628f21e158',
  '7738d0bedfd2a4a2b4c42c9525fa071398e626f2193676699e9c8ecfad76313a',
  '881ae53cc84995968d861b087e0eb91d20f4dbcc8c3ba057bf9f093e9d00c7cc',
  '91c8715b79fcc3d7030dbb8ba7f85d7604d3292f19c5f4774a014ac1ead278cc',
  '960f984285701c6d8dba5dc71c35c55c0397ff276b06423146dde88741ddf1af',
  '9c77693c75d8a6cc0100a40388afa458dcf545c7bd31751c2a3d9c68a291869a',
  'a051e62c16c385ab646c4161a67a338bc8e7efdff2c797e53fcdb72b9fc2b4d0',
  'a662d1703995859154db34856d9f261096aac3d3551a06f1f8f1dfee6b57dcd3',
  'ab2a0d5e0f4b35e54180cf8ed61c39a5e1810114fccf4a55498190cc12e86017',
  'ab9232111a8fcad4f2c04ad4427fc5c9e379214d6b7ff46c75c60c3c5c66b026',
  'b4a53bd82f8c8d4d33a4cee4050e44a02bf5301d99bbb3da393c3557e8f8bcc6',
  'b7defeadbe01293b070bedf8136c4886081fdb8a25af19792c157636d7f055ff',
  'b9cb71b66bb9b74e8ad44c08ea0e14f8110137157559effbd2448c3a64921343',
  'db6b1fc75f56c2494045c1b5b8074efad400ab50e3dd6b23ca57b10c76229cf6',
  'dd11026bd5405bae566e506fcd555a22c488ff2c33dc40d76e75c537cbfdfd0a',
  'dde6dd20d06c19870092b70d64a48403822d45179f286e50bdababbd454b0c4b',
  'e4ee06d13f52021bfbfc793ebce404608a0efd7786e1accad9d113d099fbab48',
  'e97ad92640f905b114b31925194b32e68dba2c9a8e7bb2a9e6323020d11995b6',
  'eda06e5e9f54890e4c81e034081887a708f66c0fdbbfbd17c1356bf4e57835f9',
  'ef5df1b59629f73ea70216000670e7454cc6b5779e805d68952d634e1e203b81',
  'f037578e00aebc82d7ed47b23e5f4690c48578aeba1a3fa4df58f92af5e75840',
  'b27efa31a25a8ec090058f211f2ddfdeb485903104a2e18dd4976d77d5196060',
  'aeddd4f60ed666e9e80e9a1faf07c116291fd350b0a314a340642892b8eccda9',
  '21dfc18dd04cd6a356e2f1e36e8285bc060a5d589d3ac707e56ac9654903b589',
  'b6e81b71ac210e45b216fccb3302f1ebc798947ba9ddca6b83ed1ddc63b2ff70',
  'cffdd87c9d5a2e40d4131c922daeeeb8abd63742437104bd7d6b6cdd8a5c29b6',
  'c17323fc0b1bab00dda3764def32f1432d0af144bfd5f7f8c87e719696430559',
  'b59a2aa4cfb38f4a6dfb1ebe4ef42c1b321afb7543086910c06e8c74f115d1e9',
  '0df2b318462f5a520d9afa4cc3de851e08302a52ebf0b9789a13132f34e2ab3a',
])

// SHA-256 síncrono mínimo (vitest corre en el navegador simulado y el proyecto no incluye tipos de Node).
function sha256(msg: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const bytes = Array.from(new TextEncoder().encode(msg))
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff)
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < bytes.length; off += 64) {
    const w = new Array<number>(64)
    for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('')
}

function nombreDePersona(line: string): string | null {
  for (const w of line.match(/\p{L}+/gu) ?? []) {
    // La palabra entera y, además, cada parte de un identificador en camelCase (loginAsNombre, tokenNombre).
    for (const candidata of [w, ...(w.match(/\p{Lu}?\p{Ll}+|\p{Lu}+(?!\p{Ll})/gu) ?? [])]) {
      if (candidata.length < 4) continue
      const folded = candidata.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      if (NOMBRES_SHA256.has(sha256(folded))) return '[nombre de persona]'
    }
  }
  return null
}

const files = {
  ...import.meta.glob('/src/**/*.{ts,tsx,json}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/e2e/**/*.ts', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

// docs/: solo se revisan los NOMBRES DE PERSONAS (el vocabulario del sector queda como historia en los documentos fechados).
const docs = import.meta.glob('/docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function strip(text: string): string {
  let out = text
  for (const p of Object.keys(ALLOWED)) out = out.replace(new RegExp(p, 'giu'), '')
  return out
}

function find(text: string): string | null {
  const clean = strip(text)
  for (const e of ENTIDADES) { const m = clean.match(new RegExp(e, 'iu')); if (m) return m[0] }
  for (const s of SECTOR_CI) { const m = clean.match(new RegExp(s, 'iu')); if (m) return m[0] }
  for (const s of SECTOR_CS) { const m = clean.match(new RegExp(s, 'u')); if (m) return m[0] }
  return nombreDePersona(clean)
}

const SELF = 'neutralidadDelRepo.test.ts'

describe('neutralidad del repositorio (Fase 4b)', () => {
  it('se escanean los archivos (el glob no puede quedar vacío)', () => {
    expect(Object.keys(files).length).toBeGreaterThan(500)
  })

  it('src y e2e no llevan nombres ni vocabulario del cliente anterior', () => {
    const hits: string[] = []
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith(SELF)) continue
      content.split('\n').forEach((line, i) => {
        const t = find(line)
        if (t) hits.push(`${path}:${i + 1} «${t}»`)
      })
    }
    expect(hits.slice(0, 25), `${hits.length} línea(s) con términos del cliente anterior (se muestran 25)`).toEqual([])
  })

  it('docs/ no lleva nombres de personas', () => {
    const hits: string[] = []
    for (const [path, content] of Object.entries(docs)) {
      content.split('\n').forEach((line, i) => {
        if (nombreDePersona(line)) hits.push(`${path}:${i + 1}`)
      })
    }
    expect(Object.keys(docs).length, 'se escanean los documentos').toBeGreaterThan(20)
    expect(hits.slice(0, 25), `${hits.length} línea(s) de docs/ con nombres de personas (se muestran 25)`).toEqual([])
  })

  it('el control de nombres de personas funciona (SHA-256 de referencia y lista cargada)', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(nombreDePersona('texto sin nombres propios')).toBeNull()
    expect(NOMBRES_SHA256.size).toBeGreaterThan(40)
  })

  it('cada dueño de excepciones temporales sigue teniendo al menos un uso', () => {
    const all = Object.entries(files).filter(([p]) => !p.endsWith(SELF)).map(([, c]) => c).join('\n')
    const used = new Set<string>()
    for (const [p, owner] of Object.entries(ALLOWED)) if (new RegExp(p, 'iu').test(all)) used.add(owner)
    for (const owner of new Set(Object.values(ALLOWED))) {
      expect(used.has(owner), `ya no queda ningún uso de las excepciones de «${owner}»: bórralas de ALLOWED`).toBe(true)
    }
  })
})
