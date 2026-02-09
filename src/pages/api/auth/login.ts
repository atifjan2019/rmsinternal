import type { APIRoute } from "astro";
import { verifyPassword, createSession } from "../../../lib/auth";

interface User {
    id: string;
    username: string;
    password: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const { username, password } = await request.json() as any;
        // @ts-ignore - Cloudflare runtime bindings
        const DB = locals.runtime.env.DB;

        // 1. Find user
        const user = await DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first() as User | null;

        if (!user) {
            return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
        }

        // 2. Verify password
        const isValid = await verifyPassword(password, user.password);

        if (!isValid) {
            return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
        }

        // 3. Create Session Token
        const token = await createSession({ id: user.id, username: user.username });

        // 4. Set Cookie
        const headers = new Headers();
        headers.append(
            "Set-Cookie",
            `admin_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400; ${import.meta.env.PROD ? "Secure;" : ""}`
        );

        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
};
