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
            window.open(link.gmbReviewLink, '_blank', 'noopener,noreferrer');
            setStep('thanks');
        } else {
            setStep('feedback');
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    linkId: link.id,
                    rating,
                    ...formData,
                }),
            });

            if (res.ok) {
                setStep('thanks');
            }
        } catch (error) {
            console.error('Failed to submit feedback:', error);
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
                                className={`relative h-11 w-11 sm:h-14 sm:w-14 transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-1 group-active:scale-95 ${rating && s <= rating ? "text-[#FAB005]" : "text-slate-200"
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

            {/* Main CTA Button (Default to 5 stars) */}
            <button
                onClick={() => handleRatingClick(5)}
                className="group/btn relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-[2rem] bg-[#EE314F] px-8 py-5 text-lg font-bold text-white transition-all duration-300 hover:bg-[#d42a45] hover:shadow-[0_20px_40px_-12px_rgba(238,49,79,0.35)] active:scale-[0.98]"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000"></div>
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Review on Google
            </button>
        </div>
    );
}
