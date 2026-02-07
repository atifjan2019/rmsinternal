import type { APIRoute } from 'astro';
import { getAllLinks, addLink, deleteLink } from '../../lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';

export const GET: APIRoute = async (context) => {
    try {
        const runtime = (context.locals as any).runtime;
        const links = await getAllLinks(runtime);
        return new Response(JSON.stringify(links), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch links' }), { status: 500 });
    }
};

export const POST: APIRoute = async (context) => {
    try {
        const { request } = context;
        const runtime = (context.locals as any).runtime;
        const body = await request.json();
        const { businessName, gmbReviewLink, logoUrl, backgroundImageUrl } = body;

        if (!businessName || !gmbReviewLink) {
            return new Response(JSON.stringify({ error: 'Business name and GMB review link are required' }), { status: 400 });
        }

        const slug = nanoid(10);
        const newLink = {
            id: uuidv4(),
            slug,
            businessName,
            gmbReviewLink,
            logoUrl: logoUrl || "",
            backgroundImageUrl: backgroundImageUrl || "",
            createdAt: new Date().toISOString(),
        };

        await addLink(newLink, runtime);
        return new Response(JSON.stringify(newLink), { status: 201 });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to create link' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async (context) => {
    try {
        const { url } = context;
        const runtime = (context.locals as any).runtime;
        const id = url.searchParams.get('id');
        if (!id) return new Response(JSON.stringify({ error: 'Link ID is required' }), { status: 400 });

        const deleted = await deleteLink(id, runtime);
        if (!deleted) return new Response(JSON.stringify({ error: 'Link not found' }), { status: 404 });

        return new Response(JSON.stringify({ message: 'Link deleted' }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to delete link' }), { status: 500 });
    }
};
