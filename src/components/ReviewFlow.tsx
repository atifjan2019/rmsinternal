import React, { useState } from 'react';

interface ReviewLink {
    id: string;
    slug: string;
    businessName: string;
    gmbReviewLink: string;
}

interface Props {
    link: ReviewLink;
}

export default function ReviewFlow({ link }: Props) {
    const [rating, setRating] = useState<number | null>(null);
    const [step, setStep] = useState<'rating' | 'feedback' | 'thanks'>('rating');
    const [formData, setFormData] = useState({ name: '', email: '', comment: '' });
    const [loading, setLoading] = useState(false);

    const handleRatingClick = (selectedRating: number) => {
        setRating(selectedRating);
        if (selectedRating === 5) {
            window.location.href = link.gmbReviewLink;
        } else {
            setStep('feedback');
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const formDataToSend = new FormData();
        formDataToSend.append('Source', link.businessName);
        formDataToSend.append('rating', rating?.toString() || '');
        formDataToSend.append('Name', formData.name);
        formDataToSend.append('Email', formData.email);
        formDataToSend.append('Message', formData.comment);

        try {
            // Fire and forget submission to Google Script
            fetch('https://script.google.com/macros/s/AKfycbwfh8qn32XU9rCaSb-JHkbXwipgHMEMfOydnhc0fA0vnloyIuz_0OPpHZy1LZP1RKHMAA/exec', {
                method: 'POST',
                mode: 'no-cors',
                body: formDataToSend
            });

            // Also save to internal API (optional, but good for backup)
            fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    linkId: link.id,
                    rating,
                    ...formData,
                }),
            }).catch(() => { }); // Ignore internal API errors

            // Show thanks immediately
            setTimeout(() => {
                setStep('thanks');
            }, 500);
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            // Even if it fails, we show thanks to keep the flow smooth
            setStep('thanks');
        } finally {
            setLoading(false);
        }
    };

    if (step === 'thanks') {
        return (
            <div className="animate-slide-up py-4">
                <div className="mb-6 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-500">
                        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Thank You!</h2>
                <p className="text-slate-500">We appreciate your honest feedback. It helps us improve our service.</p>
                <button
                    onClick={() => setStep('rating')}
                    className="mt-8 text-sm font-semibold text-[#EE314F] hover:text-[#d42a45] transition-colors"
                >
                    Go Back
                </button>
            </div>
        );
    }

    if (step === 'feedback') {
        return (
            <div className="animate-slide-up text-left">
                <button
                    onClick={() => setStep('rating')}
                    className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Change Rating
                </button>

                <h2 className="text-xl font-bold text-slate-900 mb-2">How can we improve?</h2>
                <p className="text-sm text-slate-500 mb-8">Please let us know about your experience so we can fix it.</p>

                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Your Name</label>
                        <input
                            required
                            type="text"
                            placeholder="John Doe"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-900 focus:border-[#EE314F]/50 focus:outline-none transition-all"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Your Email</label>
                        <input
                            required
                            type="email"
                            placeholder="john@example.com"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-900 focus:border-[#EE314F]/50 focus:outline-none transition-all"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Comments</label>
                        <textarea
                            required
                            rows={4}
                            placeholder="Tell us what went wrong..."
                            className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-900 focus:border-[#EE314F]/50 focus:outline-none transition-all resize-none"
                            value={formData.comment}
                            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                        />
                    </div>
                    <button
                        disabled={loading}
                        type="submit"
                        className="w-full rounded-2xl bg-slate-900 py-5 text-sm font-bold text-white shadow-lg hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {loading ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="animate-slide-up">
            <p className="mb-8 text-base sm:text-lg text-slate-700 font-medium leading-relaxed max-w-[280px] mx-auto">
                We value your feedback! Rate your experience with us.
            </p>

            {/* Star Rating Row */}
            <div className="mb-8 flex justify-center gap-2 sm:gap-3">
                {[1, 2, 3, 4, 5].map((s) => (
                    <button
                        key={s}
                        onClick={() => handleRatingClick(s)}
                        className="group flex flex-col items-center gap-1 focus:outline-none"
                    >
                        <div className="relative">
                            <div className="absolute -inset-2 rounded-full bg-[#FAB005]/20 scale-0 group-hover:scale-100 transition-transform duration-300 blur-md"></div>
                            <svg
                                className={`relative h-11 w-11 sm:h-14 sm:w-14 transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-1 group-active:scale-95 ${rating && s <= rating ? "text-[#FAB005]" : "text-[#FAB005]/60"
                                    } group-hover:text-[#FAB005]`}
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
