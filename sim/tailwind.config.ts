import type { Config } from 'tailwindcss'

/** Mirror of @theme in src/index.css (Tailwind v4). */
export default {
  theme: {
    extend: {
      colors: {
        dune: {
          bg: '#0C0C0B',
          panel: '#161513',
          amber: '#DE9B43',
          sand: '#CBB293',
          harkonnen: '#8A251A',
        },
      },
    },
  },
} satisfies Config
