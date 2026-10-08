# Product boundaries: what belongs in each of the five pieces

Learn Differently is five connected products that share one learner record and one learning loop:
learn a little, practice it, prove it, then learn exactly what closes the gap. Each product owns one
verb in that loop. This document says which product a feature belongs to, so the LMS does not grow a
job board, the simulator does not grow a cohort manager, and so on.

Read it before scoping any non-trivial feature. If a request crosses a boundary, say so and propose
the split before building. This applies to people and to agents.

## The five pieces, one verb each

| #   | Product                                 | Verb        | The one job                                                                   | Lives today                                        |
| --- | --------------------------------------- | ----------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| 01  | Learning Management (LMS)               | Structure   | Pathways, cohorts, progress, credentials, institutional reporting             | `apps/learn` (`/lms/*`), `apps/api/src/learn`      |
| 02  | Micro Learning                          | Spark       | Short lessons that end in an exercise, creators, office hours                 | not built                                          |
| 03  | Skill Simulator (Interview Differently) | Practice    | Job simulations and exercises, AI co-work, scoring and coaching               | `apps/web`, `apps/api/src/{scenarios,scoring,...}` |
| 04  | Job Board Match                         | Opportunity | Roles matched to proven skills, the gap to the next role, apply with evidence | not built                                          |
| 05  | Talent Match                            | Placement   | Employers search verified talent, profile sharing, hires                      | partly, inside the LMS (`/lms/talent`, see below)  |

The test for any feature: **which verb does it serve, and who is the user?** A feature serves one verb.
If it seems to serve two, it is two features, one per product, joined through the learner record.

## The shared core (not a product)

Some things every product needs. They are shared infrastructure, owned by nobody's roadmap, and no
product may fork its own copy:

- **Identity and sign-in** (Clerk): one account per person across all five.
- **Institutions, workspaces, roles and memberships**: agencies, providers, organizations, staff and
  learner roles. Products read them; the LMS admin screens edit them, but the data is core.
- **The learner record**: enrollments, item progress, verified skills, credentials, attempt results,
  placements. One record per person. Each product writes only its own slice (see the table below)
  and reads the rest.
- **The skills vocabulary** (`apps/api/src/learn/skills.ts` today): one list of skill names so a
  simulation, a lesson, a credential and a job posting all mean the same thing by "Ticket triage".
- **Audit, data-access log, notifications, the attention bell, tenant branding, LTI plumbing.**

Rule: a product may read anything in the record. Only the owning product writes its slice.

## What each product owns, reads, and must not grow

### 01 Learning Management (Structure)

- **Owns:** courses and pathways, modules and items, cohorts and sessions, enrollment and join
  requests, attendance, gradebook and progress, credentials and badges, outcomes dashboards and
  exports for institutions and funders, learner support items and instructor notes (case
  management), SCORM playback, the LTI platform side (launching tools into a pathway).
- **Writes to the record:** enrollment, progress, completion, credential, attendance.
- **Reads:** attempt scores and verified skills (from the Simulator), lesson views (Micro Learning),
  placements (Talent Match), to report them.
- **Must not grow:** job listings or matching logic, employer accounts, candidate search, resume or
  compensation storage, a video library or creator tools, scenario authoring, its own AI grading of
  simulations or interviews, a lesson feed. The LMS places content in a pathway; it does not make
  the content, score the practice, or match the person to a job.

### 02 Micro Learning (Spark)

- **Owns:** short lessons (video, text, image), the creator library and curation, the lesson to
  exercise handoff ("every lesson ends in an exercise"), office hours and live drop-ins, streaks and
  engagement nudges, lesson recommendations driven by gaps ("you missed X, here is the 3-minute
  lesson on X").
- **Writes to the record:** lesson views and completions, streaks.
- **Reads:** verified skills and gaps (Simulator), pathway placement (LMS), employer demand
  (matching) to decide what to recommend next.
- **Must not grow:** cohorts or enrollment, grading, credentials, job content. A lesson placed by
  an instructor into a pathway is an LMS item that references Micro Learning content; the content,
  the creator and the feed belong here.

### 03 Skill Simulator (Practice)

- **Owns:** scenarios and simulations (text, immersive, voice), working alongside an AI agent,
  exercises and assessments, tools such as the SQL sandbox and datasets, scoring and dimension
  scores, feedback and coaching, the scenario builder, and the evidence that makes a skill
  "verified" (the attempt, its score and its work sample). The LTI tool side.
- **Writes to the record:** attempts, scores, verified skills with their evidence.
- **Reads:** who is in which pathway (LMS) to know which exercise to serve; the skills vocabulary.
- **Must not grow:** cohort management and enrollment screens, course catalogs, institution-level
  dashboards, resumes, job boards. Attempt-level analytics ("how did this person do on this
  scenario") are the Simulator's; institution-level rollups ("how is this provider doing") are LMS
  Outcomes.

### 04 Job Board Match (Opportunity)

- **Owns:** job postings and feeds, matching roles to proven skills, the gap between a person's
  verified skills and a role, "apply with evidence", the learner's job search activity, and the
  demand signal that flows back ("employers ask for X most") to Micro Learning and the LMS.
- **Writes to the record:** matches, applications, interviews.
- **Reads:** verified skills and work samples (Simulator), the person's target roles, availability
  and sharing choices (Talent Match profile), credentials (LMS).
- **Must not grow:** employer-side candidate search, training content, cohorts, resume editing.

### 05 Talent Match (Placement)

- **Owns:** employer accounts and seats, candidate search by verified skills, the talent profile
  (resume, experience, industries, compensation, availability, target roles), who may see the
  profile (learner-controlled sharing), viewing work samples, the hiring pipeline through to a
  recorded hire, hiring from partner cohorts.
- **Writes to the record:** profile, sharing consent, placements (hires).
- **Reads:** verified skills and evidence (Simulator), credentials and cohort membership (LMS),
  applications (Job Board Match).
- **Must not grow:** teaching, grading, cohorts, instructor notes. Placement data is written here
  and reported by LMS Outcomes; Talent Match does not build its own funder reports.

## Five questions before building

1. **Which verb?** Structure, Spark, Practice, Opportunity or Placement. Pick one.
2. **Who is the user?** Learner, instructor or case manager, agency staff, creator, employer. An
   employer-facing screen is never in the LMS. An instructor-facing screen is never in Talent Match.
3. **What does it write?** Find the slice of the learner record. The product that owns that slice
   owns the feature.
4. **Would it make sense alone?** Each product must be usable without the other four. If the
   feature only works because two products are in one codebase, it is leaning on the wrong product.
5. **Does it need another product's data?** Read it through the shared core or an API. Never copy
   the table into the other product.

If the answers point to two products, split the work into two issues, one per product, and link
them.

## Known bleed today, and the direction

The boundaries above are the target. These are the places the code already crosses them, and what
to do about each as the work continues:

- **Talent inside the LMS** (`/lms/talent`, `apps/api/src/learn/talent`): the talent profile,
  resume, compensation, search and sharing are Talent Match features hosted in the LMS shell because
  Talent Match does not exist as its own app yet. Keep the API in its own `talent` module with no
  dependency on cohort or course UI, so it can be lifted out whole. Do not add talent fields to
  `Cohort` beyond the existing `requiresProfile` and `profileRefreshMonths`. Learner support items
  and instructor notes are case management and stay in the LMS.
- **Institutions, cohorts and student analytics inside the Simulator** (`apps/web` admin pages for
  institutions, students, engagement, heatmaps): institution-level views belong to LMS Outcomes.
  New institution-level reporting goes in the LMS; the Simulator keeps attempt and scenario
  analytics.
- **Interview scoring inside the LMS** (`apps/api/src/learn/interview-scoring*.ts`): scoring a
  practice attempt is the Simulator's job. The LMS should receive a score over LTI, not compute one.
  Do not extend this; route new scoring through the Simulator.
- **Matching hints in the talent profile** (target roles, industries): fine as profile data. The
  matching logic itself (ranking roles against skills, computing the gap) is Job Board Match and
  must not be built into the talent search.

## Issue prefixes

GitHub issue titles carry the product (see `CLAUDE.md`): `[LMS]`, `[ID]` (Skill Simulator),
`[MicroLearning]`, `[Matching]` (Job Board Match and Talent Match; name the piece after the prefix,
for example `[Matching] Talent Match: employer search`). Areas such as Talent, Attendance or
Support are subtitles under their product, never prefixes. `CLAUDE.md` also lists `[Train]`; it has
not been used on an issue yet, so confirm which piece it names before using it.

This repository is public. Describe the framework in plain words here and on the site; internal
names for it stay out of the repository.
