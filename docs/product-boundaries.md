# Product boundaries: what belongs in each of the five pieces

Learn Differently is five connected products that share one learner record and one learning loop:
learn a little, practice it, prove it, then learn exactly what closes the gap. Each product owns one
verb in that loop. This document says which product a feature belongs to, so the LMS does not grow a
job board, the simulator does not grow a cohort manager, and so on.

Read it before scoping any non-trivial feature. If a request crosses a boundary, say so and propose
the split before building. This applies to people and to agents.

## The five pieces, one verb each

| #   | Product                                 | Verb        | The one job                                                                   | Lives today                                       |
| --- | --------------------------------------- | ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| 01  | Learning Management (LMS)               | Structure   | Pathways, cohorts, progress, credentials, institutional reporting             | `apps/learn` (`/lms/*`), `apps/api/src/learn`     |
| 02  | Micro Learning                          | Spark       | Short lessons that end in an exercise, plus integrations with outside content | not built                                         |
| 03  | Skill Simulator (Interview Differently) | Practice    | Job simulations and exercises, AI co-work, scoring and coaching               | `apps/web` and the shared API; see section 03     |
| 04  | Job Board Match                         | Opportunity | Roles from outside boards matched to proven skills; the gap; apply with proof | not built                                         |
| 05  | Talent Match                            | Placement   | Employers search verified talent, profile sharing, hires                      | partly, inside the LMS (`/lms/talent`, see below) |

The test for any feature: **which verb does it serve, and who is the user?** A feature serves one verb.
If it seems to serve two, it is two features, one per product, joined through the learner record.

## The shared core (not a product)

Some things every product needs. They are shared infrastructure, owned by nobody's roadmap, and no
product may fork its own copy:

- **Identity and sign-in** (Clerk): one account per person across all five, on one Clerk instance. This is the
  target; today there are two instances (see issue #81).
- **Institutions, workspaces, roles and memberships**: agencies, providers, organizations, staff and
  learner roles. Products read them; the LMS admin screens edit them, but the data is core.
- **The learner record**: enrollments, item progress, verified skills, credentials, attempt results,
  placements. One record per person. Each product writes only its own slice (see the table below)
  and reads the rest.
- **The skills vocabulary**: one list of skill names so a simulation, a lesson, a credential and a
  job posting all mean the same thing by "Ticket triage". It does not exist yet: today each course
  carries its own free-form skill list (`Course.skills`), and the logic that judges a skill
  (`apps/api/src/learn/skills.ts`) lives in the LMS. The list belongs in shared code; the
  per-course target score stays with the course.
- **Audit, data-access log, notifications, the attention bell, tenant branding, and the shared LTI
  store and signing.** Each side of LTI keeps its own half: the LMS is the platform, the Simulator is
  the tool.

Rule: a product may read anything in the record. Only the owning product writes its slice.

Who writes the shared rows: institutions, cohorts and memberships are edited through the LMS admin
screens, plus the one automatic membership write described under the Simulator (the system cohort).
The skills vocabulary changes only with the project owner's approval. Employer organizations are
Talent Match rows, not core rows.

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

Spark is an **integrator first**. A rich community of educators and content providers already makes
excellent lessons. Spark connects to where they work and brings the content into the learner's
pathway, so creators keep working in the tools they love and we do not duplicate their libraries.

- **Owns:** connectors to outside learning sources and content providers (video platforms, course
  marketplaces, publisher libraries, creators' own sites): discovery, linking or embedding,
  licensing and attribution, and the completion signal coming back; a small native lesson format
  (short video, text, image) for partners who have nothing elsewhere; curation of the library; the
  lesson to exercise handoff ("every lesson ends in an exercise"); office hours and live drop-ins;
  streaks and engagement nudges; lesson recommendations driven by gaps ("you missed X, here is the
  3-minute lesson on X").
- **How it reaches the learner:** an outside lesson becomes an LMS item that references Spark
  content, so it sits in the pathway and shows in progress. Spark supplies the connector and the
  content reference; the LMS places it and reports it. This hand-off is the first integration to
  build and is part of the Spark scope, not an LMS extra.
- **Completion rule:** Spark writes only a content-level event (viewed or completed, with its
  source). The LMS alone turns that into item completion, by its own rule. Many providers report
  nothing back, so an unverifiable lesson counts as **viewed**, never completed, unless the provider
  reports completion or the learner passes the exercise that follows. Name the mechanism (webhook,
  LTI, standard activity statements) before promising a signal.
- **If a connector breaks** or a provider removes content, the lesson shows as unavailable and the
  LMS item is not marked complete; Spark owns the notice to staff.
- **Writes to the record:** lesson views and completion events (including those reported by an
  outside provider), streaks.
- **Reads:** verified skills and gaps (Simulator), pathway placement (LMS), employer demand
  (matching) to decide what to recommend next.
- **Must not grow:** cohorts or enrollment, grading, credentials, job content. A creator studio or
  hosting platform that competes with the providers we integrate; build the connector before the
  tool. A curated library of providers is not a community marketplace for scenarios (still out of
  scope). Native lessons exist to fill gaps, not to replace what creators already publish.

### 03 Skill Simulator (Practice)

**Honest starting point.** Interview Differently began as, and still is, a separate product: its
own site (interviewdifferently.com), its own sign-in, its own cohort and institution features. The
code already sits in this repository (`apps/web`) and shares one API and one database with the LMS,
but it does not yet behave like a product that sits beside the LMS. We also reuse it as the Practice
piece. That history is why today's code breaks the rules below. The direction is to make it a
Simulator product like the LMS, with its own area of the app, that uses the LMS for everything about
cohorts, institutions and rosters and keeps only the practice. Issue #81 lists what has to move
and tracks it. New work follows the rules below now, even where old code does not.

- **Owns:** scenarios and simulations (text, immersive, voice), working alongside an AI agent,
  exercises and assessments, tools such as the SQL sandbox and datasets, scoring and dimension
  scores, feedback and coaching, the scenario builder, and the evidence that makes a skill
  "verified" (the attempt, its score and its work sample). The LTI tool side.
- **Writes to the record:** attempts, scores, verified skills with their evidence.
- **Reads:** the cohort and pathway context for the work in front of it, from the LTI launch and the
  shared cohort and institution rows it points at (a real foreign key, so the data joins once and
  works everywhere); the skills vocabulary. It reads those rows and never creates or edits them.
- **Must not grow:** cohort management and enrollment screens, course catalogs, institution-level
  dashboards, student rosters, its own sign-up and accounts, resumes, job boards. Attempt-level
  analytics ("how did this person do on this scenario") are the Simulator's; institution-level
  rollups ("how is this provider doing") are LMS Outcomes. A standalone consumer experience may keep
  its own front door, but the data behind it is still the shared learner record, and cohorts,
  institutions and rosters still come from the LMS.
- **Every attempt belongs to a cohort.** A person with no program belongs to the system cohort
  "Interview Differently Standalone" (under the institution "Interview Differently"), created by the
  seed in every environment and excluded from institution and funder rollups. Joining that cohort
  automatically on standalone sign-up or launch is the one membership write the Simulator may make,
  done through the shared membership service, never by editing cohort rows directly. An LTI launch
  must name a real cohort or be rejected.

### 04 Job Board Match (Opportunity)

Like Spark, Opportunity is an **integrator**. Job boards, employer systems and labor-market feeds
already exist; we connect to them rather than rebuild them. We may host a few postings ourselves
(for example from partner employers who have nowhere else), but the product's weight is on
**matching**: ranking roles against proven skills, showing the gap, and sending the application with
evidence.

- **Owns:** connectors to job boards, employer systems and labor-market data (ingesting postings and
  employer demand, and where an outside system allows it, passing an application on); a small
  native posting form for partners with nowhere else; mapping every posting to the skills
  vocabulary; matching roles to proven skills; the gap between a person's verified skills and a
  role; "apply with evidence"; the learner's job search activity; and the demand signal that flows
  back ("employers ask for X most") to Micro Learning and the LMS.
- **Writes to the record:** matches, applications, interviews.
- **Reads:** verified skills and work samples (Simulator), the person's target roles, availability
  and sharing choices (Talent Match profile), credentials (LMS).
- **Must not grow:** employer-side candidate search, training content, cohorts, resume editing, a
  full job board or applicant tracking system of our own.
- **Terms of the sources:** many boards and employer systems require a partnership or forbid
  scraping. Connect only where the source allows it; an integration is a contract, not just code.

### 05 Talent Match (Placement)

- **Owns:** employer accounts and seats, candidate search by verified skills, the talent profile
  (resume, experience, industries, compensation, availability, target roles), who may see the
  profile (learner-controlled sharing), viewing work samples, the hiring pipeline through to a
  recorded hire (record the stages up to the hire; no employer-side workflow tooling, which would
  make it an applicant tracking system), hiring from partner cohorts, and **knowing that a hire happened**.
- **Writes to the record:** profile, sharing consent, placements (hires), each with its source.
- **Reads:** verified skills and evidence (Simulator), credentials and cohort membership (LMS),
  applications and matches (Job Board Match).
- **Must not grow:** teaching, grading, cohorts, instructor notes. Placement data is written here
  and reported by LMS Outcomes; Talent Match does not build its own funder reports.

**How we learn a hire happened.** Placement is the hardest fact to capture, because it happens
outside our product. Talent Match is the single writer of a placement, and stores each with its
`source` so reports can say how sure we are. Job Board Match only supplies the "matched through us"
link. LMS Outcomes holds the funder-grade evidence and decides which sources count in each report.

1. **Matched through us.** A learner matched or applied through Job Board Match, or an employer
   searched and hired through Talent Match. We know the match; we still ask for the outcome.
2. **Employer confirmed.** An employer hiring from a partner cohort confirms the hire and start
   date, with their consent to share it.
3. **Learner reported.** A one-tap "I got a job" with employer, role and start date. People rarely
   report without a reason, so test recognition (an alumni page) and an alumni network first.
   Rewards or gifts are **not to be built** without written approval from the program's funder,
   because they can distort reported placements.
4. **Public signals: not built.** Watching a learner's professional profile for job changes needs
   legal review of each platform's terms, and the learner's explicit, revocable consent. Scraping is
   never an option. Until reviewed, this does not exist.

Placement and profile data are personal data: store only what the source needs, let a learner see
and delete what they reported, and keep every read in the data-access log.

Programs that report placement to a funder will still need their own follow-up, because the
required evidence is stricter than a learner's word.

## Where code lives (target, not current)

The "Lives today" column above is accurate now. This is the layout the code is moving to, tracked
in issue #81:

```
apps/
  api/         one shared API
  learn/       Learn Differently: homepage, product pages, the LMS at /lms/*
  simulator/   Skill Simulator, its own domain (renamed from apps/web)
  (later)      spark/, opportunity/, talent/ : each its own app when built
packages/      types (per product), skills (shared vocabulary)
apps/api/src/
  core/        auth, prisma, storage, config, shared LTI store, institutions, cohorts, memberships
  lms/         courses, progress, attendance, outcomes, record, LTI platform
  simulator/   scenarios, scoring, assessments, tools, datasets, sql-runner, LTI tool, ...
  talent/      talent profile, search, sharing
```

Import rule, enforced by tests: `simulator/` may not import `lms/` or `talent/`, `lms/` may not
import `simulator/`, `talent/` may not import `lms/`, and all of them may import `core/`. Until the
folders exist, new backend code is written as if they did: name it for its product and import
nothing across products.

## Five questions before building

1. **Which verb?** Structure, Spark, Practice, Opportunity or Placement. Pick one.
2. **Who is the user?** Learner, instructor or case manager, agency staff, creator, employer. An
   employer-facing screen is never in the LMS. An instructor-facing screen is never in Talent Match.
3. **What does it write?** Find the slice of the learner record. The product that owns that slice
   owns the feature.
4. **Does it depend on another product's code?** No feature may. The only dependency allowed is on
   shared rows (institutions, cohorts, memberships, the learner record, the system cohort). If the
   feature only works because two products are in one codebase, it is leaning on the wrong product.
5. **Does it need another product's data?** Read it through the shared core or an API. Never copy
   the table into the other product.

If the answers point to two products, split the work into two issues, one per product, and link
them.

## Known bleed: what not to do

Some existing code already crosses the boundaries above. Do not copy it or build on it. The full
inventory and the plan to remove it is [issue #81](https://github.com/ludakhris/interview-differently/issues/81);
this section only says what to avoid.

- **Simulator:** do not add or extend institution, cohort, member, student-roster, enrollment or
  join screens, institution-level dashboards, per-cohort settings or assessment scheduling, or
  institution-scoped roles. Use the LMS. A Simulator table may point at a cohort or
  institution (they are shared-core rows); it must not create, edit or manage them.
- **LMS:** do not add scoring of practice attempts, verified-skill logic, or anything for employers
  or job seekers. The talent profile API stays a separate `talent` module: add no new imports of LMS course or
  cohort services (it imports a few today, which is debt listed in #81; instructor notes and the
  cohort profile requirement sit beside it too), and `Cohort` gets no talent fields beyond `requiresProfile` and `profileRefreshMonths`.
  Learner support items and instructor notes are case management and stay in the LMS.
- **Matching:** target roles and industries in the talent profile are fine as data. Ranking roles
  against skills or computing the gap is Job Board Match; do not build it into talent search.
- **Shared core:** do not add a second sign-in instance, a second user table, or a private
  copy of the learner record or skills list in any product.
- **Allowed, so do not "fix" it:** the LMS reading Simulator assessments and scenarios to fill its
  "place content in a course" picker. It reads through the HTTP API or shared rows, never by
  importing Simulator modules.

## Issue prefixes

GitHub issue titles carry the product (see `CLAUDE.md`): `[LMS]`, `[ID]` (Skill Simulator),
`[MicroLearning]`, `[Matching]` (Job Board Match and Talent Match; name the piece after the prefix,
for example `[Matching] Talent Match: employer search`). Areas such as Talent, Attendance or
Support are subtitles under their product, never prefixes.

This repository is public. Describe the framework in plain words here and on the site; internal
names for it stay out of the repository.
