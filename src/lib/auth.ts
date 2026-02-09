import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

// Security: All credentials MUST be set via environment variables
const JWT_SECRET = import.meta.env.JWT_SECRET;
const CF_ACCOUNT_ID = import.meta.env.CF_ACCOUNT_ID;
const CF_DATABASE_ID = import.meta.env.CF_DATABASE_ID;
const CF_API_TOKEN = import.meta.env.CF_API_TOKEN;

if (!JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET not set. Authentication will fail in production.");
}

const SECRET_KEY = new TextEncoder().encode(JWT_SECRET || "dev-only-secret");

// D1 HTTP API Query Helper
async function queryD1(sql: string, params: any[] = []) {
    if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_DATABASE_ID) {
        throw new Error("Missing Cloudflare D1 environment variables (CF_ACCOUNT_ID, CF_DATABASE_ID, CF_API_TOKEN).");
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
    });

    const data = await response.json();

    if (!data.success) {
        console.error("D1 Error:", JSON.stringify(data.errors));
        return { results: [], success: false };
    }

    const result = data.result && data.result[0] ? data.result[0] : { results: [] };
    return { results: result.results || [], success: true };
}

// Password utilities
export async function hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
}

// JWT utilities
export async function createSession(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(SECRET_KEY);
}

export async function verifySession(token: string | undefined) {
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, SECRET_KEY);
        return payload;
    } catch (error) {
        return null;
    }
}

// User management
export interface User {
    id: string;
    username: string;
    password: string;
    created_at: number;
}

export async function getUserByUsername(username: string): Promise<User | null> {
    const { results } = await queryD1(
        "SELECT * FROM users WHERE username = ? LIMIT 1",
        [username]
    );
    return results[0] as User | null;
}

export async function createUser(username: string, password: string): Promise<boolean> {
    const hashedPassword = await hashPassword(password);
    const { success } = await queryD1(
        "INSERT INTO users (id, username, password, created_at) VALUES (?, ?, ?, ?)",
        [crypto.randomUUID(), username, hashedPassword, Date.now()]
    );
    return success;
}
