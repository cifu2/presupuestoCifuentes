/**
 * Memoización **por proceso**, no por grafo de módulos (CIF-577).
 *
 * Next.js compila el servidor en varios grafos de módulos —la capa RSC de las páginas y la de las
 * rutas HTTP, entre otras— y cada grafo instancia este módulo por su cuenta. Una caché a nivel de
 * módulo da, por tanto, un valor distinto a cada capa: en modo demostración, dos catálogos en
 * memoria, y el panel no ve lo que publica una ruta HTTP del **mismo** proceso (hallazgo de
 * CIF-545). `globalThis` sí es único en el proceso, así que el registro vive ahí y las dos capas
 * comparten la misma instancia.
 *
 * Alcance: un proceso, no un despliegue. En Vercel cada ruta es una función distinta —procesos
 * separados—, así que esto no convierte el modo demostración en un catálogo de preview: eso lo
 * resuelve el seed sobre la base (docs/despliegue.md §3.1). Lo que arregla es que la demo y el
 * `next start` local (un proceso, varios grafos) se comporten como una sola aplicación.
 */

/** Nombre del registro en `globalThis`: con espacio de nombres para no chocar con nadie. */
const REGISTRY_KEY = '__cifucorpProcessSingletons__'

type Registry = Map<string, unknown>

function registry(): Registry {
  const holder = globalThis as unknown as Record<string, unknown>
  const current = holder[REGISTRY_KEY]

  if (current instanceof Map) {
    return current as Registry
  }

  const created: Registry = new Map()
  holder[REGISTRY_KEY] = created

  return created
}

/**
 * El valor ya creado para `key` en este proceso, o el que devuelve `create` la primera vez.
 *
 * El valor se guarda **después** de construirlo: si `create` lanza, no queda un hueco en el registro
 * y el siguiente intento vuelve a construirlo. Las factorías del contenedor son síncronas y no hay
 * `await` entre la comprobación y la escritura, así que dos llamadas no pueden intercalarse a mitad.
 */
export function getProcessSingleton<T>(key: string, create: () => T): T {
  const singletons = registry()
  const existing = singletons.get(key)

  if (existing !== undefined) {
    return existing as T
  }

  const created = create()
  singletons.set(key, created)

  return created
}
