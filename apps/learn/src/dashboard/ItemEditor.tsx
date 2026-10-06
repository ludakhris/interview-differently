import type { CourseItemDto, KnowledgeCheckQuestion } from '@id/types'
import { useState } from 'react'

export interface ItemDraft {
  type: string
  title: string
  label: 'pre' | 'post' | null
  config: Record<string, unknown>
}

/** What learners see. Authors see TYPE_LABEL; "SCORM" means nothing to a learner. */
export const LEARNER_TYPE_LABEL: Record<string, string> = {
  lesson: 'Lesson',
  knowledge_check: 'Knowledge check',
  assessment: 'Assessment',
  interview: 'Practice interview',
  scorm: 'Interactive lesson',
  video: 'Video',
  external_link: 'External course',
}

export const TYPE_LABEL: Record<string, string> = {
  lesson: 'Lesson',
  knowledge_check: 'Knowledge check',
  assessment: 'Assessment',
  interview: 'Practice interview',
  scorm: 'SCORM package',
  video: 'Video',
  external_link: 'Link to an external course',
}

const emptyQuestion = (): KnowledgeCheckQuestion => ({
  prompt: '',
  options: ['', ''],
  correctIndex: 0,
})

/** Edits one item in place. The fields shown depend on its type. */
export function ItemEditor(props: {
  item: CourseItemDto
  busy: boolean
  onSave: (draft: ItemDraft) => void
  onCancel: () => void
  /** Upload a preview image, or remove it with null. Only external course items use it. */
  onImage?: (file: File | null) => void
}) {
  const { item } = props
  const [title, setTitle] = useState(item.title)
  const [label, setLabel] = useState<'pre' | 'post'>(item.label === 'post' ? 'post' : 'pre')
  const [body, setBody] = useState(String(item.config.body ?? ''))
  const [questions, setQuestions] = useState<KnowledgeCheckQuestion[]>(
    Array.isArray(item.config.questions) ? (item.config.questions as KnowledgeCheckQuestion[]) : []
  )
  const [videoUrl, setVideoUrl] = useState(
    typeof item.config.videoId === 'string'
      ? `https://youtu.be/${item.config.videoId}${item.config.startSeconds ? `?t=${item.config.startSeconds}` : ''}`
      : ''
  )
  const [linkUrl, setLinkUrl] = useState(String(item.config.url ?? ''))
  const [linkNote, setLinkNote] = useState(String(item.config.instructions ?? ''))
  const [linkSummary, setLinkSummary] = useState(String(item.config.summary ?? ''))
  const [role, setRole] = useState(String(item.config.role ?? ''))
  const [attempts, setAttempts] = useState(String(item.config.maxAttempts ?? 1))
  const [questionsText, setQuestionsText] = useState(
    Array.isArray(item.config.questions) && item.type === 'interview'
      ? (item.config.questions as string[]).join('\n')
      : ''
  )

  function save() {
    const config: Record<string, unknown> =
      item.type === 'lesson'
        ? { body }
        : item.type === 'knowledge_check' || item.type === 'assessment'
          ? { questions }
          : item.type === 'video'
            ? { url: videoUrl }
            : item.type === 'external_link'
              ? {
                  url: linkUrl,
                  summary: linkSummary,
                  instructions: linkNote,
                  imageKey: item.config.imageKey,
                }
              : {
                  role,
                  maxAttempts: Number(attempts) || 1,
                  questions: questionsText
                    .split('\n')
                    .map((q) => q.trim())
                    .filter(Boolean),
                }
    props.onSave({
      type: item.type,
      title,
      label: item.type === 'assessment' ? label : null,
      config: item.type === 'scorm' ? item.config : config,
    })
  }

  return (
    <div className="dash-itemeditor">
      <label className="dash-field">
        <span>Title</span>
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>

      {item.type === 'lesson' && (
        <label className="dash-field">
          <span>Lesson text</span>
          <textarea
            rows={10}
            value={body}
            maxLength={20000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the lesson here. Short is good: one skill, one exercise."
          />
        </label>
      )}

      {(item.type === 'knowledge_check' || item.type === 'assessment') && (
        <QuestionBuilder questions={questions} onChange={setQuestions} />
      )}

      {item.type === 'assessment' && (
        <>
          <fieldset className="dash-field">
            <legend>When it runs</legend>
            <label className="dash-radio">
              <input type="radio" checked={label === 'pre'} onChange={() => setLabel('pre')} />
              Before the course (pre-assessment)
            </label>
            <label className="dash-radio">
              <input type="radio" checked={label === 'post'} onChange={() => setLabel('post')} />
              After the course (post-assessment)
            </label>
          </fieldset>
        </>
      )}

      {item.type === 'video' && (
        <label className="dash-field">
          <span>YouTube link</span>
          <input
            value={videoUrl}
            maxLength={300}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => setVideoUrl(e.target.value)}
          />
          <small className="dash-muted">
            Paste the link from YouTube. Add ?t=90 to start at 1:30. Learners finish the video by
            watching at least 90% of it. If the video is removed or will not embed, they can mark it
            done by hand and the record says so.
          </small>
          {typeof item.config.videoId === 'string' && (
            <img
              className="dash-video-thumb"
              src={`https://i.ytimg.com/vi/${encodeURIComponent(item.config.videoId)}/hqdefault.jpg`}
              alt="The saved video"
              width={240}
              height={180}
            />
          )}
        </label>
      )}

      {item.type === 'external_link' && (
        <>
          <label className="dash-field">
            <span>Link</span>
            <input
              value={linkUrl}
              maxLength={500}
              placeholder="https://www.udemy.com/course/…"
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <small className="dash-muted">
              Opens on the provider's own site. Allowed: Udemy, Coursera, Khan Academy, edX,
              Microsoft Learn, Google Skillshop, Pluralsight and LinkedIn Learning.
            </small>
          </label>
          <label className="dash-field">
            <span>About this course</span>
            <textarea
              rows={3}
              value={linkSummary}
              maxLength={600}
              onChange={(e) => setLinkSummary(e.target.value)}
              placeholder="A sentence or two on what the course covers and why it is in this program."
            />
            <small className="dash-muted">Shown on the course card the learner sees.</small>
          </label>
          <div className="dash-field">
            <span>Preview image (optional)</span>
            {typeof item.config.imageUrl === 'string' && (
              <img
                className="dash-extcard-image"
                src={item.config.imageUrl}
                alt="Preview of the card image"
                width={320}
                height={180}
              />
            )}
            <div className="dash-form-actions">
              <label
                className={
                  props.busy ? 'dash-btn-quiet dash-file-disabled' : 'dash-btn-quiet dash-file'
                }
              >
                {item.config.imageUrl ? 'Replace image' : 'Upload image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={props.busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) props.onImage?.(f)
                  }}
                />
              </label>
              {item.config.imageUrl ? (
                <button
                  type="button"
                  className="dash-btn-quiet"
                  disabled={props.busy}
                  onClick={() => props.onImage?.(null)}
                >
                  Remove image
                </button>
              ) : null}
            </div>
            <small className="dash-muted">
              PNG, JPEG or WebP, up to 2 MB, best at 16:9. A screenshot of the course page works.
            </small>
          </div>
          <label className="dash-field">
            <span>What the learner should do there</span>
            <textarea
              rows={3}
              value={linkNote}
              maxLength={1000}
              onChange={(e) => setLinkNote(e.target.value)}
              placeholder="Complete sections 1 and 2, then come back and mark this done."
            />
            <small className="dash-muted">
              We cannot see what happens on the other site. The learner confirms they finished, and
              the record says it was self-reported.
            </small>
          </label>
        </>
      )}

      {item.type === 'scorm' && (
        <p className="dash-muted">
          SCORM {String(item.config.version ?? '')} package, {String(item.config.files ?? 0)} files.
          To use a different package, delete this item and upload the new one.
        </p>
      )}

      {item.type === 'interview' && (
        <>
          <label className="dash-field">
            <span>Role being interviewed for</span>
            <input
              value={role}
              maxLength={120}
              placeholder="Medical Assistant"
              onChange={(e) => setRole(e.target.value)}
            />
          </label>
          <label className="dash-field">
            <span>Attempts allowed</span>
            <input
              type="number"
              min={1}
              max={5}
              value={attempts}
              onChange={(e) => setAttempts(e.target.value)}
            />
            <small className="dash-muted">
              1 to 5. The default is 1. With more than one, the best score counts.
            </small>
          </label>
          <label className="dash-field">
            <span>Questions (one per line, up to 6)</span>
            <textarea
              rows={6}
              value={questionsText}
              onChange={(e) => setQuestionsText(e.target.value)}
              placeholder={
                'Tell me about a time you stayed calm under pressure.\nHow do you make sure you get the details right?'
              }
            />
            <small className="dash-muted">
              Learners type an answer to each. Each answer is scored and coached, and their best
              score counts toward interview readiness.
            </small>
          </label>
        </>
      )}

      <div className="dash-form-actions">
        <button type="button" className="dash-btn" onClick={save} disabled={props.busy}>
          {props.busy ? 'Saving…' : 'Save item'}
        </button>
        <button type="button" className="dash-btn-quiet" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function QuestionBuilder(props: {
  questions: KnowledgeCheckQuestion[]
  onChange: (q: KnowledgeCheckQuestion[]) => void
}) {
  const { questions, onChange } = props
  const set = (i: number, q: KnowledgeCheckQuestion) =>
    onChange(questions.map((x, j) => (j === i ? q : x)))
  return (
    <div className="dash-questions">
      {questions.length === 0 && <p className="dash-muted">No questions yet. Add one below.</p>}
      {questions.map((q, i) => (
        <fieldset key={i} className="dash-question">
          <legend>Question {i + 1}</legend>
          <label className="dash-field">
            <span>Question</span>
            <input
              value={q.prompt}
              maxLength={300}
              onChange={(e) => set(i, { ...q, prompt: e.target.value })}
            />
          </label>
          <p className="dash-muted">Answers. Select the correct one.</p>
          {q.options.map((o, j) => (
            <div key={j} className="dash-option">
              <input
                type="radio"
                name={`correct-${i}`}
                aria-label={`Answer ${j + 1} is correct`}
                checked={q.correctIndex === j}
                onChange={() => set(i, { ...q, correctIndex: j })}
              />
              <input
                value={o}
                maxLength={200}
                aria-label={`Answer ${j + 1}`}
                onChange={(e) =>
                  set(i, { ...q, options: q.options.map((x, k) => (k === j ? e.target.value : x)) })
                }
              />
              {q.options.length > 2 && (
                <button
                  type="button"
                  className="dash-btn-quiet"
                  onClick={() =>
                    set(i, {
                      ...q,
                      options: q.options.filter((_, k) => k !== j),
                      correctIndex:
                        q.correctIndex === j
                          ? 0
                          : q.correctIndex > j
                            ? q.correctIndex - 1
                            : q.correctIndex,
                    })
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className="dash-form-actions">
            {q.options.length < 6 && (
              <button
                type="button"
                className="dash-btn-quiet"
                onClick={() => set(i, { ...q, options: [...q.options, ''] })}
              >
                Add answer
              </button>
            )}
            <button
              type="button"
              className="dash-btn-quiet"
              onClick={() => onChange(questions.filter((_, k) => k !== i))}
            >
              Remove question
            </button>
          </div>
        </fieldset>
      ))}
      {questions.length < 20 && (
        <button
          type="button"
          className="dash-btn-secondary"
          onClick={() => onChange([...questions, emptyQuestion()])}
        >
          Add question
        </button>
      )}
    </div>
  )
}
