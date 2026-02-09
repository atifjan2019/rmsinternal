import type { APIRoute } from "astro";
import { hashPassword } from "../../../lib/auth";

export const GET: APIRoute = async ({ locals }) => {
    // @ts-ignore - Cloudflare runtime bindings
    const DB = locals.runtime.env.DB;

    try {
        // 1. Create Users Table
        await DB.prepare(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                created_at INTEGER
            );
        `).run();

        const messages = [];

        // 2. Create Default Admin User
        let admin = await DB.prepare("SELECT * FROM users WHERE username = ?").bind("admin").first();
        if (!admin) {
            const hashedPassword = await hashPassword("admin123");
            await DB.prepare(
                "INSERT INTO users (id, username, password, created_at) VALUES (?, ?, ?, ?)"
            ).bind(crypto.randomUUID(), "admin", hashedPassword, Date.now()).run();
            messages.push("Created default admin user.");
        } else {
            messages.push("Admin user already exists.");
        }

        // 3. Create Requested User
        const targetUserEmail = "atifjan2019@gmail.com";
        let targetUser = await DB.prepare("SELECT * FROM users WHERE username = ?").bind(targetUserEmail).first();
        if (!targetUser) {
            const hashedPassword = await hashPassword("Test@#1234$");
            await DB.prepare(
                "INSERT INTO users (id, username, password, created_at) VALUES (?, ?, ?, ?)"
            ).bind(crypto.randomUUID(), targetUserEmail, hashedPassword, Date.now()).run();
            messages.push(`Created user ${targetUserEmail}.`);
        } else {
            messages.push(`User ${targetUserEmail} already exists.`);
        }

        return new Response(JSON.stringify({ messages }), { status: 200 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500 });
    }
};
