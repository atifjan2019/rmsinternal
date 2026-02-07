/// <reference types="astro/client" />

interface ImportMetaEnv {
    readonly CF_ACCOUNT_ID: string;
    readonly CF_DATABASE_ID: string;
    readonly CF_API_TOKEN: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
