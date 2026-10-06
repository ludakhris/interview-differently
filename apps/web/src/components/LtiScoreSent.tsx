/** Shown when the score is already with the course but the browser has no link to send the learner back on its own. */
export function LtiScoreSent({ courseUrl }: { courseUrl: string | null }) {
  return (
    <>
      <p className="font-display font-bold text-[18px] text-fg mb-2">Your score was sent.</p>
      <p className="text-[14px] text-slate-mid">
        Go back to your course.
        {courseUrl && (
          <>
            {' '}
            <a href={courseUrl} className="text-green underline font-semibold">
              Back to your course
            </a>
          </>
        )}
      </p>
    </>
  )
}
