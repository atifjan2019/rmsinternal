/// <reference types="astro/client" />

declare namespace App {
    interface Locals {
        runtime: import('@astrojs/cloudflare').Runtime<Env>;
    }
}

interface Env {
    LINKS: KVNamespace;
    SESSION: KVNamespace;
}
