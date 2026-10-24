// Casos de prueba de navigation.yml — `semgrep --test`. Cada `ruleid:` DEBE saltar; cada `ok:` NO.
export function Nav({ url }: { url: string }) {
  // ruleid: atlanticerp-window-open-dynamic
  window.open(url)
  // ruleid: atlanticerp-window-open-dynamic
  window.open(url, '_blank')

  // ok: atlanticerp-window-open-dynamic
  window.open('https://example.com/ayuda')
  // ok: atlanticerp-window-open-dynamic
  window.open(url, '_blank', 'noopener,noreferrer')

  // ruleid: atlanticerp-target-blank-no-rel
  const a = <a href={url} target="_blank">sin rel</a>
  // ok: atlanticerp-target-blank-no-rel
  const b = <a href={url} target="_blank" rel="noopener noreferrer">con rel</a>
  // ok: atlanticerp-target-blank-no-rel
  const c = <a href={url}>misma pestaña</a>

  return <div>{a}{b}{c}</div>
}
