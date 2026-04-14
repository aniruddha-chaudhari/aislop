'use client';

type AnimationMomentReview = {
  start: number;
  duration: number;
  type: string;
  content: string;
  subtitle?: string;
  visualStyle?: string;
  motion?: string;
  layout?: string;
  emphasis?: string;
  animationPrompt?: string;
};

export type AnimationPlanReviewData = {
  generatedAt: string;
  animationPlan: {
    videoDurationSeconds?: number;
    moments: AnimationMomentReview[];
  };
  researchSummary?: string | null;
  dialogueContext?: string;
  prompts?: {
    timelinePrompt?: string;
    directionPrompt?: string;
    timelinePlanJson?: string;
    dialogueWindowsByMoment?: string;
  };
};

type Props = {
  review: AnimationPlanReviewData | null;
  open: boolean;
  approving?: boolean;
  onClose: () => void;
  onApprove: () => void;
};

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? seconds : 0;
  return `${safe.toFixed(2)}s`;
}

export default function AnimationPlanReviewModal({
  review,
  open,
  approving,
  onClose,
  onApprove,
}: Props) {
  if (!open || !review) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Animation Plan Review</h2>
            <p className="text-sm text-zinc-400">
              {review.animationPlan.moments.length} moments ready for approval
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/5"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={approving}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {approving ? 'Generating Animation...' : 'Approve & Generate'}
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="min-h-0 overflow-y-auto border-r border-white/10 p-6">
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Generated</div>
                <div className="mt-2 text-sm text-zinc-100">{new Date(review.generatedAt).toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Duration</div>
                <div className="mt-2 text-sm text-zinc-100">
                  {review.animationPlan.videoDurationSeconds?.toFixed(2) ?? '0.00'}s
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Moments</div>
                <div className="mt-2 text-sm text-zinc-100">{review.animationPlan.moments.length}</div>
              </div>
            </div>

            <div className="space-y-4">
              {review.animationPlan.moments.map((moment, index) => (
                <div key={`${moment.start}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      Moment {index + 1}
                    </span>
                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                      {formatTime(moment.start)} to {formatTime(moment.start + moment.duration)}
                    </span>
                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                      {moment.type}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-100">{moment.content}</p>
                  {moment.subtitle ? (
                    <p className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-sm text-zinc-300">
                      {moment.subtitle}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                    {moment.visualStyle ? <span>Style: {moment.visualStyle}</span> : null}
                    {moment.motion ? <span>Motion: {moment.motion}</span> : null}
                    {moment.layout ? <span>Layout: {moment.layout}</span> : null}
                    {moment.emphasis ? <span>Emphasis: {moment.emphasis}</span> : null}
                  </div>
                  {moment.animationPrompt ? (
                    <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-5 text-zinc-300 whitespace-pre-wrap">
                      {moment.animationPrompt}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-6">
            {review.researchSummary ? (
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Research Summary
                </h3>
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-zinc-300 whitespace-pre-wrap">
                  {review.researchSummary}
                </pre>
              </section>
            ) : null}

            {review.dialogueContext ? (
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Dialogue Context
                </h3>
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-zinc-300 whitespace-pre-wrap">
                  {review.dialogueContext}
                </pre>
              </section>
            ) : null}

            {review.prompts?.timelinePlanJson ? (
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Timeline Plan JSON
                </h3>
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-zinc-300 whitespace-pre-wrap">
                  {review.prompts.timelinePlanJson}
                </pre>
              </section>
            ) : null}

            {review.prompts?.timelinePrompt ? (
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Timeline Prompt
                </h3>
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-zinc-300 whitespace-pre-wrap">
                  {review.prompts.timelinePrompt}
                </pre>
              </section>
            ) : null}

            {review.prompts?.directionPrompt ? (
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Direction Prompt
                </h3>
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-zinc-300 whitespace-pre-wrap">
                  {review.prompts.directionPrompt}
                </pre>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
