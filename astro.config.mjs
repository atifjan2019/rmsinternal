import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
    integrations: [react(), tailwind({
        applyBaseStyles: false,
    })],
    output: 'server',
    // maxDuration: auto-reply passes call the GBP API + AI generation and can exceed the default limit
    adapter: vercel({ maxDuration: 60 })
});
