import type { APIRoute } from "astro";
import { initializeUsersTable, getUserByUsername, createUser, hashPassword } from "../../../lib/auth";

export const GET: APIRoute = async () => {
    try {
        // 1. Create Users Table
        await initializeUsersTable();

        const messages: string[] = [];

        // 2. Create Default Admin User
        const admin = await getUserByUsername("admin");
        if (!admin) {
            await createUser("admin", "admin123");
            messages.push("Created default admin user.");
        } else {
            messages.push("Admin user already exists.");
        }

        // 3. Create Requested User
        const targetEmail = "atifjan2019@gmail.com";
        const targetUser = await getUserByUsername(targetEmail);
        if (!targetUser) {
            await createUser(targetEmail, "Test@#1234$");
            messages.push(`Created user ${targetEmail}.`);
        } else {
            messages.push(`User ${targetEmail} already exists.`);
        }

        return new Response(JSON.stringify({ messages }), { status: 200 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500 });
    }
};
