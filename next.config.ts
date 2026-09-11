import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El layout raíz vive en `src/app/[locale]/layout.tsx`, así que Next no puede componer el 404
  // por defecto: sin esto sirve su página interna sin `lang` ni estilos. Ver `docs/i18n.md`.
  experimental: {
    globalNotFound: true,
  },
}

const withNextIntl = createNextIntlPlugin()

export default withNextIntl(nextConfig)
