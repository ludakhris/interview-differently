# Adaptive learning checkpoints: demo notes

A prototype, now built on the products that own each piece (GitHub issue #90). Fictional store, fictional learners. Not offered to
programs.

## Running the demo

- Board (staff), **Adaptive Learner Monitoring**: `/lms/cohorts/demo-adaptive-cohort/adaptive?site=cedarmill`, or at
  Lantern Hill: `/lms/cohorts/demo-adaptive-lh-cohort/adaptive?site=lanternhill`. The seed builds both from the same
  code (`SITES` in `apps/api/scripts/seed-adaptive-demo.ts`), so change the course there and rerun it; an edit made
  in one provider's course editor does not reach the other.
  **▶ Play the demo** runs Maya and Theo live; when they finish it becomes **▶ Replay the demo** (it resets them
  first). **↺ Reset demo** starts over without playing. AI-written videos and practice reach learners straight away.
- Learner view: join with code `ADAPTIVE-SQL`, open SQL Fundamentals (adaptive), start with the diagnostic.
- Run four dev servers: the API, the LMS (`learn`, 5174), Interview Differently (`web`, 5173, which serves the checkpoint
  chat) and Spark (`spark`, 5175, which plays the videos). The checkpoint and the video run inside the course page.
- Full reset (also needed after changing the seed or the scripts). The first line adds the checkpoint tool once per
  environment. On dev, run both inside the dev API's container (`railway ssh -s api-dev -e dev`, from a deploy that has
  the current scripts; `docs/dev-api.md`); locally, drop the `--allow-host` flag:

```bash
npm run seed:lti-tools -- --allow-host postgres.railway.internal
```

```bash
npm run seed:adaptive-demo -- --allow-host postgres.railway.internal
```

How the pieces fit (who owns what, the LTI launch into a frame, the evidence feed): `docs/adaptive-integration.md`.

## The story

- **Maya** has written a little SQL. Her first morning at the store is a chat of colleagues' requests, not a test.
  She shows three skills, so those lessons and checkpoints are skipped (open to review). She misses one JOIN request,
  so the diagnostic stops asking about JOINs and adds help. Once she shows JOINs, that help stops being required.
  She is ready about two hours sooner than the full path.
- **Theo** has never written SQL and starts from the beginning. Slips in module checkpoints add help picked for a
  beginner: a short video Claude writes from his own mistakes, plus targeted practice. He closes
  each gap with a retry.
- **The board** shows both side by side: time to job-ready (proved time counts toward ready; the marker is the course
  as written), each learner's job goals ticked off as they are proven, and their path as a timeline scaled by time.
  Hover the dashed "skipped" marker for what the evidence showed; green stops are help added for a gap, each with the
  goal it is for. **See what Maya saw** replays her screen: every request and answer, hints, practice, videos.
- **Student comparison mode** (checkbox on the board): pick any learners (type to find one in a big cohort); the board
  shows only them, with the course as written as a lane of its own beside their timelines, at the same time scale.

## To close the demo: content approval

Content approval is off in the demo so the story flows. To finish, switch on **Staff approve AI-written practice and
videos before learners see them** on the board: from then on, anything Claude writes waits in a review queue on the
board (intro, every task or scene) for Approve or Send back, and the learner sees "your instructor is checking it".
Organizations choose: speed (off) or a person in the loop (on).

## How it maps to the eight steps

| Step                        | Built?                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define the goal             | Yes: skills, pass marks, the evidence rule ("80% on the latest 2 answers"), and two policy switches (let learners skip what they have shown; staff approve AI-written practice and videos)                                      |
| Learn about the student     | Yes: a work simulation (colleagues' requests in a chat, a picture of the result wanted, rows checked as you run) that stops probing a skill after one clear miss; plus self-report, which also picks what kind of help they get |
| Identify gaps               | Yes, by rule. "Not learned this yet" is no evidence, not a gap: the lessons will teach it                                                                                                                                       |
| Build a plan from a library | Yes, small: a library per skill (lessons, checkpoints, help for gaps, content made per learner); the plan picks by skill and by learner (a video for someone new to SQL, reading for the rest)                                  |
| Support the student         | Yes: AI hints, explanations and examples; AI practice and AI videos aimed at the learner's own mistakes                                                                                                                         |
| Check learning              | Yes: checkpoints graded on real data                                                                                                                                                                                            |
| Adjust the plan             | Yes: adds help for gaps, skips what the learner has shown, makes help optional once a gap closes                                                                                                                                |
| Keep staff informed         | Yes: the board, with time to job-ready and a review queue                                                                                                                                                                       |

## How AI is used

| Where                         | Model             | Why                                                                                          |
| ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| Hints, explanations, examples | Claude Haiku 5.5  | Must feel instant; a code check refuses any reply containing the answer                      |
| Practice written per learner  | Claude Sonnet 5.5 | Every answer key runs on the data before anyone sees it                                      |
| Videos written per learner    | Claude Sonnet 5.5 | A storyboard played with captions and a voice (macOS `say` locally); staff can approve first |

Rules, not AI, grade answers, judge mastery and change the plan. Models are set by environment variables
(`CHECKPOINT_HELP_MODEL`, `CHECKPOINT_CONTENT_MODEL`, `SPARK_LESSON_MODEL`).

## What's saved

Each product keeps its own part. AI-written content is library content: it is kept apart from any learner, course or
provider, so it outlives all three.

| What                                | Saved                                                                                                      | Where (owner)                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| AI video lesson                     | Title, every scene's narration and visual, the model, prompt version, token counts, who reviewed it        | `Lesson` (Spark), library              |
| AI practice set                     | Intro, every request and answer key, the model, prompt version, token counts, the review                   | `PracticeSet` (Simulator), library     |
| Who was given which                 | The learner, cohort and course item a lesson or practice set was used for                                  | `LessonUse`, `PracticeSetUse`          |
| Every answer and pass               | The SQL, right or not, and why                                                                             | `PracticeEvent` answer (Simulator)     |
| Every hint, explanation and example | The text shown, any example SQL, the model (or "rules")                                                    | `PracticeEvent` help (Simulator)       |
| How a video was watched             | Started, each scene reached, replayed, finished, and the voice                                             | `LessonEvent` (Spark)                  |
| The evidence and why the path moved | Latest result per request (read from the Simulator), the skill and score behind each item added or skipped | `ItemProgress`, `PlanItem`, `PlanSkip` |
| Time spent                          | Active seconds per item per day                                                                            | `ActivitySession`                      |

Staff see it on the board under each learner: **See what Maya saw** replays it in order (videos as their storyboard).
Removing a learner from a cohort removes their history; the library content stays. An approved lesson or practice set
that a person reviewed is given to the next learner with the same gap before anything new is written.

## Questions a skeptic will ask

- **"Who decided she knows it?"** The organization's evidence rule, on her two most recent graded answers. AI content
  never counts as evidence.
- **"Can the AI just give the answer?"** Hints are told not to, and a code check throws away any reply containing the
  answer query. Videos use a different example; they are not yet checked against answer keys.
- **"Is the AI's content right?"** Practice answer keys run on the data first; staff can approve practice and videos
  before learners see them.
- **"Is that a real video?"** No: a narrated storyboard played in the browser, ready in seconds. A real video vendor
  could render the same script later.

## Known limits

- One SQL course; checkpoints and videos are set up by the seed, not the course editor.
- Narration: when the API runs on a Mac (the local demo), macOS `say` reads it in the Mac's default voice (set
  `SPARK_SAY_VOICE` to pick another, for example `Ava (Premium)`); recordings are cached. Anywhere else (Railway),
  the browser's built-in voice reads it instead, which varies by browser.
- Sending back shared content from one cohort removes it from that cohort's learners, but if another cohort still
  uses it, it stays approved in the library and could be given to the same learners again.
- Checkpoint answers in a diagnostic are final; two answers sent at the same instant could both be recorded.
