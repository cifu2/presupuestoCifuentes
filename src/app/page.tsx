const mvpScope = [
  'Configurador público con vista previa 2D y precio en vivo',
  'Tarifas versionadas por vigencia y tamaño máximo por serie',
  'Presupuesto en PDF y por email, multi-idioma',
  'Panel de administración para catálogo y precios',
]

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">
          Fabricantes de puertas a medida
        </p>
        <h1 className="text-4xl font-bold text-brand-900">
          Puertas Cifuentes · Presupuestos a medida
        </h1>
        <p className="text-lg text-brand-700">
          El configurador público estará disponible aquí. Esta página es el esqueleto del MVP y su
          única función ahora mismo es probar la estructura, el despliegue y la puerta de calidad.
        </p>
      </header>

      <section aria-labelledby="alcance-mvp" className="flex flex-col gap-3">
        <h2 id="alcance-mvp" className="text-xl font-semibold text-brand-900">
          Alcance del MVP
        </h2>
        <ul className="flex flex-col gap-2 text-brand-700">
          {mvpScope.map((item) => (
            <li key={item} className="rounded-lg border border-brand-500/20 bg-white px-4 py-3">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-sm text-brand-500">
        Arquitectura hexagonal y SOLID · Next.js + PostgreSQL · Vercel
      </footer>
    </main>
  )
}
