/**
 * SCRUM-863 (rebote QA — Gerencia, 2026-09-14) — el mensaje de bienvenida de cada módulo debe
 * mostrar únicamente el PRIMER nombre del usuario, nunca `first_name` completo. `first_name`
 * puede traer 2+ palabras ("Vendedor Disenador", "Vendedor Disenador", "Luis J") porque el campo almacena el
 * nombre de pila completo tal cual se registró, no un token único — ni backend ni frontend
 * recortaban esto antes de este fix, así que el saludo mostraba el nombre compuesto entero.
 *
 * Único punto de recorte para presentación — todos los Home/Header de módulo deben pasar el
 * nombre resuelto por acá antes de interpolarlo en el saludo, en vez de repetir `.split(' ')[0]`
 * suelto en cada componente (eso fue justamente lo que permitió que 6 módulos implementaran el
 * saludo de forma independiente sin que ninguno lo recortara). Nunca modifica el dato
 * almacenado — es solo para la presentación del saludo.
 */
export function firstNameOnly(fullFirstName: string | null | undefined): string {
  return (fullFirstName ?? '').trim().split(/\s+/)[0] ?? ''
}
