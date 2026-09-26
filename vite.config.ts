import { defineConfig } from 'vite';
import vinext from 'vinext';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    vinext(),
    tailwindcss(),
    cloudflare({
      persistState: process.env.COLLABEDGE_E2E_STATE_PATH
        ? { path: process.env.COLLABEDGE_E2E_STATE_PATH }
        : undefined,
      inspectorPort: process.env.COLLABEDGE_E2E_STATE_PATH ? false : undefined,
      viteEnvironment: {
        name: 'rsc',
        childEnvironments: ['ssr'],
      },
    }),
  ],
});
