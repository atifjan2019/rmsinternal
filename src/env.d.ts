/// <reference types="astro/client" />

type D1Database = import("@cloudflare/workers-types").D1Database;

interface ImportMetaEnv {
    readonly CF_ACCOUNT_ID: string;
    readonly CF_DATABASE_ID: string;
    readonly CF_API_TOKEN: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Define the runtime environment shape for Cloudflare Adapter
interface Runtime {
    DB: D1Database;
}
