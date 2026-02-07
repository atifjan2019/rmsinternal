import type { APIRoute } from 'astro';
import { addFeedback } from '../../lib/storage';
import { v4 as uuidv4 } from 'uuid';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { linkId, name, email, comment, rating } = body;

        if (!linkId || !name || !email || !comment || rating === undefined) {
            return new Response(JSON.stringify({ error: 'All fields are required' }), { status: 400 });
        }

        const newFeedback = {
            id: uuidv4(),
            linkId,
            name,
            email,
            comment,
            rating,
            createdAt: new Date().toISOString(),
        };

        await addFeedback(newFeedback);
        return new Response(JSON.stringify(newFeedback), { status: 201 });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to submit feedback' }), { status: 500 });
    }
};
