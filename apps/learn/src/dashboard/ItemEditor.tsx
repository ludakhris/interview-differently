import type { CourseItemDto, CourseSkill, KnowledgeCheckQuestion, LearnToolList } from '@id/types'
import { useState } from 'react'
import { useLoad } from './api'
import { useApp } from './app-context'
import {
  toolConfig,
  toolItemLabel,
  toolLabelable as labelableIn,
  referenceWording,
  toolOptions,
  toolRefProblem,
} from './toolKinds'

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
  interview: 'Practice interview',
  scorm: 'Interactive lesson',
  video: 'Video',
  external_link: 'External course',
  tool: 'Connected tool',
  profile: 'Talent profile',
}

export const TYPE_LABEL: Record<string, string> = {
  lesson: 'Lesson',
  knowledge_check: 'Knowledge check',
  interview: 'Practice interview',
  scorm: 'SCORM package',
  video: 'Video',
  external_link: 'Link to an external course',
  tool: 'Connected tool',
  profile: 'Talent profile form',
}

const emptyQuestion = (): KnowledgeCheckQuestion => ({
  prompt: '',
  options: ['', ''],
  correctIndex: 0,
})

/** Edits one item in place. The fields shown depend on its type. */
export function ItemEditor(props: {
  /** The course the item belongs to: the tools on offer depend on its provider. */
  courseId: string
  item: CourseItemDto
  /** The course's skills, for tagging questions and choosing remediation. */
  skills: CourseSkill[]
  busy: boolean
  onSave: (draft: ItemDraft) => void
  /** True for a new item that is not saved yet: nothing exists until the author saves it. */
  isNew?: boolean
  onCancel: () => void
  /** Upload a preview image, or remove it with null. Only external course items use it. */
  onImage?: (file: File | null) => void
}) {
  const { item } = props
  const { href } = useApp()
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
  const [skill, setSkill] = useState(String(item.config.skill ?? ''))
  const [pickedTool, setToolId] = useState(String(item.config.toolId ?? 'id-interview'))
  // Only a connected-tool item needs the registry; the others skip the request.
  const registry = useLoad<LearnToolList>(
    item.type === 'tool' ? `/learn/courses/${props.courseId}/tools` : null
  )
  const tools = toolOptions(
    registry.data?.tools ?? null,
    pickedTool,
    props.isNew ? null : { labelled: item.label !== null }
  )
  // A new item starts on the first tool this provider may use, not on one that is off or off limits.
  const toolId =
    props.isNew && registry.data && !tools.some((t) => t.id === pickedTool)
      ? (tools[0]?.id ?? pickedTool)
      : pickedTool
  // What stops a tool item being saved: the list has not loaded, failed, or has nothing to pick.
  const toolBlock =
    item.type !== 'tool'
      ? null
      : registry.loading
        ? 'Loading the connected tools…'
        : registry.error
          ? 'Could not load the connected tools. Reload the page and try again.'
          : tools.length === 0
            ? 'No connected tools are available to this provider. Ask a system administrator.'
            : null
  const toolLabelable = (id: string) => labelableIn(id, tools)
  const { label: refLabel, help: refHelp } = referenceWording(
    registry.data?.tools.find((t) => t.toolId === toolId)
  )
  const [toolRef, setToolRef] = useState(String(item.config.ref ?? ''))
  // How this item is used in a learner's plan: ordinary content, extra content only flagged
  // learners get, or ordinary content that flagged learners must complete again.
  const [planMode, setPlanMode] = useState<'none' | 'extra' | 'review'>(
    item.config.remediationFor ? 'extra' : item.config.reviewFor ? 'review' : 'none'
  )
  const [planSkill, setPlanSkill] = useState(
    String(item.config.remediationFor ?? item.config.reviewFor ?? '')
  )
  const [countsAsInterview, setCountsAsInterview] = useState(item.config.countsAsInterview === true)
  const [optional, setOptional] = useState(item.config.optional === true)
  const [problem, setProblem] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(String(item.config.maxAttempts ?? 1))
  const [passScore, setPassScore] = useState(
    item.config.passScore ? String(item.config.passScore) : ''
  )
  const [timeLimit, setTimeLimit] = useState(
    item.config.timeLimitMinutes ? String(item.config.timeLimitMinutes) : ''
  )
  const [questionsText, setQuestionsText] = useState(
    Array.isArray(item.config.questions) && item.type === 'interview'
      ? (item.config.questions as string[]).join('\n')
      : ''
  )

  // A practice interview or an assessment tool is evidence, so it cannot be remediation content.
  const canBeRemediation = item.type !== 'interview' && item.type !== 'tool'

  function save() {
    const config: Record<string, unknown> =
      item.type === 'lesson'
        ? { body }
        : item.type === 'knowledge_check'
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
              : item.type === 'tool'
                ? toolConfig({
                    tools,
                    toolId,
                    ref: toolRef,
                    skill,
                    attempts,
                    timeLimit,
                    passScore,
                    countsAsInterview,
                    optional,
                  })
                : {
                    role,
                    ...(skill ? { skill } : {}),
                    maxAttempts: Number(attempts) || 1,
                    questions: questionsText
                      .split('\n')
                      .map((q) => q.trim())
                      .filter(Boolean),
                  }
    const saved: Record<string, unknown> = { ...(item.type === 'scorm' ? item.config : config) }
    delete saved.remediationFor
    delete saved.reviewFor
    if (planSkill && canBeRemediation && planMode === 'extra') saved.remediationFor = planSkill
    if (planSkill && canBeRemediation && planMode === 'review') saved.reviewFor = planSkill
    const refProblem = item.type === 'tool' ? toolRefProblem(toolRef) : null
    setProblem(refProblem)
    if (refProblem) return
    props.onSave({
      type: item.type,
      title,
      label: item.type === 'tool' ? toolItemLabel(toolId, label, tools) : null,
      config: saved,
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

      {item.type === 'knowledge_check' && (
        <QuestionBuilder questions={questions} skills={props.skills} onChange={setQuestions} />
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

      {item.type === 'profile' && (
        <p className="dash-muted">
          Learners fill in their own talent profile here: resume, education, experience and what
          they are looking for. There is nothing to set up.
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

      {item.type === 'tool' && (
        <>
          <label className="dash-field">
            <span>Tool</span>
            <select value={toolId} onChange={(e) => setToolId(e.target.value)}>
              {tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {registry.data?.canManage && (
              <small className="dash-muted">
                <a href={href('/lms/admin/tools')}>Manage connected tools</a>
              </small>
            )}
          </label>
          {toolLabelable(toolId) && (
            <>
              <label className="dash-field">
                <span>When it runs</span>
                <select value={label} onChange={(e) => setLabel(e.target.value as 'pre' | 'post')}>
                  <option value="pre">Before the course (pre-assessment)</option>
                  <option value="post">After the course (post-assessment)</option>
                </select>
                <small className="dash-muted">
                  It stands in for the course's own pre or post assessment: it is required to finish
                  the course and its best score counts toward the gain.
                </small>
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
              </label>
              <label className="dash-field">
                <span>Time limit (minutes, optional)</span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={timeLimit}
                  placeholder="No limit"
                  onChange={(e) => setTimeLimit(e.target.value)}
                />
                <small className="dash-muted">
                  The best score counts. A started attempt can be resumed. The timer starts when the
                  learner opens the attempt.
                </small>
              </label>
            </>
          )}
          {!(toolLabelable(toolId) && label === 'pre') && (
            <label className="dash-field">
              <span>Pass mark (%, optional)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={passScore}
                placeholder="Any score counts"
                onChange={(e) => setPassScore(e.target.value)}
              />
              <small className="dash-muted">
                The score a learner must reach for this to count as done. Below it the item stays to
                do and they try again. Leave it blank and any scored attempt completes it.
              </small>
            </label>
          )}
          <label className="dash-field">
            <span>{refLabel}</span>
            <input
              value={toolRef}
              maxLength={200}
              placeholder={refLabel}
              onChange={(e) => setToolRef(e.target.value)}
            />
            <small className="dash-muted">{refHelp}</small>
          </label>
          {!toolLabelable(toolId) && (
            <label className="dash-check">
              <input
                type="checkbox"
                checked={countsAsInterview}
                onChange={(e) => setCountsAsInterview(e.target.checked)}
              />
              <span>Counts toward interview readiness</span>
              <small className="dash-muted">
                Tick this if the learner's best score here should count as their practice interview
                score. Leave it unticked for a simulation or other practice: the learner still sees
                its own score beside it in the course outline, but it does not feed their readiness.
              </small>
            </label>
          )}
          {!toolLabelable(toolId) && (
            <label className="dash-check">
              <input
                type="checkbox"
                checked={optional && !countsAsInterview}
                disabled={countsAsInterview}
                onChange={(e) => setOptional(e.target.checked)}
              />
              <span>Optional</span>
              <small className="dash-muted">
                {countsAsInterview
                  ? 'Not available: this item counts toward interview readiness, so the course needs it.'
                  : 'Tick this if learners can finish the course without it. It still shows in the outline and its score is kept.'}
              </small>
            </label>
          )}
        </>
      )}

      {(item.type === 'interview' || item.type === 'tool') && (
        <SkillSelect
          label={item.type === 'tool' ? 'Skill this builds' : 'Skill this interview builds'}
          skills={props.skills}
          value={skill}
          onChange={setSkill}
          help="Its best score counts toward the skill. Below the skill's pass mark, the remediation content for it is added to the learner's plan."
        />
      )}

      {canBeRemediation && (
        <>
          <label className="dash-field">
            <span>Part of a learner's plan</span>
            <select
              value={planMode}
              onChange={(e) => setPlanMode(e.target.value as 'none' | 'extra' | 'review')}
            >
              <option value="none">Ordinary course content</option>
              <option value="extra">Extra content, only for learners flagged on a skill</option>
              <option value="review">Review: flagged learners must complete it again</option>
            </select>
            <small className="dash-muted">
              Extra content is hidden from everyone else. A review stays where it is in the course
              and is also added to a flagged learner's plan as a new item they must complete again.
              Either way the learner's progress total grows by one.
            </small>
          </label>
          {planMode !== 'none' && (
            <SkillSelect
              label="When this skill is flagged"
              skills={props.skills}
              value={planSkill}
              onChange={setPlanSkill}
            />
          )}
        </>
      )}

      {problem && (
        <p className="dash-banner dash-banner-error" role="alert">
          {problem}
        </p>
      )}
      {toolBlock && (
        <p className="dash-muted" role="status">
          {toolBlock}
        </p>
      )}
      <div className="dash-form-actions">
        <button
          type="button"
          className="dash-btn"
          onClick={save}
          disabled={props.busy || toolBlock !== null}
        >
          {props.busy ? 'Saving…' : props.isNew ? 'Add item' : 'Save item'}
        </button>
        <button type="button" className="dash-btn-quiet" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Pick one of the course's skills, or none. */
function SkillSelect(props: {
  label: string
  skills: CourseSkill[]
  value: string
  onChange: (id: string) => void
  help?: string
}) {
  const none = props.skills.length === 0
  return (
    <label className="dash-field">
      <span>{props.label}</span>
      <select
        value={props.value}
        disabled={none && !props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">{none ? 'No skills yet: add them in the course settings' : 'None'}</option>
        {props.skills.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
        {props.value && !props.skills.some((s) => s.id === props.value) && (
          <option value={props.value}>{props.value} (no longer a course skill)</option>
        )}
      </select>
      {props.help && <small className="dash-muted">{props.help}</small>}
    </label>
  )
}

function QuestionBuilder(props: {
  questions: KnowledgeCheckQuestion[]
  skills: CourseSkill[]
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
          <SkillSelect
            label="Skill (optional)"
            skills={props.skills}
            value={q.skill ?? ''}
            onChange={(id) => {
              const next: KnowledgeCheckQuestion = { ...q, skill: id }
              if (!id) delete next.skill
              set(i, next)
            }}
          />
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
