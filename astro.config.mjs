// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // User sites (<username>.github.io) are served from the domain root,
  // so no `base` is needed.
  site: 'https://kmasouri.github.io',
  // GitHub Pages adds the trailing slash itself; 'ignore' lets the dev server
  // accept /about and /about/ alike instead of showing Astro's warning page.
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/recycle-bin/') && !page.includes('/welcome/'),
    }),
  ],
  vite: {
    css: {
      lightningcss: {
        // XP.css has a few selectors lightningcss considers invalid (e.g.
        // `progress:not([value]):after:not([value])`, unused here). Drop them
        // with a warning instead of failing the build.
        errorRecovery: true,
      },
    },
  },
});
