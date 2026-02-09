import type { APIRoute } from "astro";
import { getUserByUsername, verifyPassword, createSession } from "../../../lib/auth";

export const POST: APIRoute = async ({ request }) => {
    try {
        const { username, password } = await request.json();

        // 1. Find user
        const user = await getUserByUsername(username);

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
    } catch (error: any) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), { status: 500 });
    }
};
