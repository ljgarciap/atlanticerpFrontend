// Casos de prueba de xss-sinks.yml — `semgrep --test`. Cada `ruleid:` DEBE saltar; cada `ok:` NO.
import DOMPurify from 'dompurify'

export function Html({ html, el }: { html: string; el: HTMLElement }) {
  // ruleid: atlanticerp-dangerous-html
  el.innerHTML = html
  // ruleid: atlanticerp-dangerous-html
  document.write(html)

  // ok: atlanticerp-dangerous-html
  el.innerHTML = '<b>fijo</b>'
  // ok: atlanticerp-dangerous-html
  el.innerHTML = DOMPurify.sanitize(html)

  // (los comentarios `{/* ... */}` dentro de JSX no los lee `--test`: cada caso JSX va en su propia sentencia)
  // ruleid: atlanticerp-dangerous-html
  const peligroso = <div dangerouslySetInnerHTML={{ __html: html }} />
  // ok: atlanticerp-dangerous-html
  const saneado = <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
  // ok: atlanticerp-dangerous-html
  const constante = <div dangerouslySetInnerHTML={{ __html: '<hr/>' }} />

  return <div>{peligroso}{saneado}{constante}</div>
}

export function store(value: string) {
  // ruleid: atlanticerp-persisted-token
  localStorage.setItem('atlanticerp-refresh-token', value)
  // ruleid: atlanticerp-persisted-token
  sessionStorage.setItem('jwt', value)

  // ok: atlanticerp-persisted-token
  localStorage.setItem('sidebar-collapsed', 'true')
  // ok: atlanticerp-persisted-token
  localStorage.setItem('language', value)
}
