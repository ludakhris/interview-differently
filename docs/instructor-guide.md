# Instructor guide

Answers to questions that have come up while running classes. Each answer names the screen and buttons as they appear in the app; if you change one of those screens, update this guide in the same commit.

Writing or editing an assessment? See [assessment-format.md](assessment-format.md).

## Assessments

### Where do I see students taking an assessment live?

On the delivery's results panel:

1. **Tools ▾ → Admin → Assessments**, then click the assessment.
2. In its list of deliveries, find the one your class is taking (e.g. `pre · Data Analysis — Fall 2026`) and click **Results →**.

The panel shows:

- a summary line — `3 submitted · 5 in progress · 2 not started`
- under each student: `in progress · 7 of 12 answered · last saved 10:41`, `submitted …`, or (greyed out) `not started` for cohort members who haven't opened it yet
- **↻ Refresh** (top right) — the panel doesn't update on its own; click it for fresh numbers. The `updated …` stamp shows when it last loaded.

Good to know:

- "Answered" means the student has saved something for that question — not that it's finished or correct. Nothing is graded until they submit.
- Answers save about 1.5 seconds after a student stops typing, so the count can trail slightly.
- Students who join through an invite link aren't in the cohort until they open the link, so they're not in the "not started" count beforehand. Opening the link starts their attempt, so they appear straight away as in progress.
- The institution analytics (**Institutions & Cohorts → your institution → Assessments**) only count submitted attempts, so use the results panel while the class is still working.

## SQL Sandbox

### How many rows does a query show, and can I change it?

The status bar under the results has a **show [500] rows** picker: 100, 500, 1,000 or 5,000. The choice is remembered in that browser. When a query returns more than the limit, the bar says `showing first 500 of 1,200`. The maximum is 5,000 because showing more can freeze the browser tab.

### How do I get query results out?

Use the buttons at the right of the same status bar:

- **Copy** — copies the results as tab-separated text, which pastes straight into Excel or Google Sheets as cells.
- **↓ CSV** — downloads a `.csv` file named after the dataset and the time.

Both always include **every row** the query returned, not just the rows on screen. They're hidden when there's no result or the last query failed, and they aren't available inside assessments.

### A student has more than one dataset — which one opens?

None, until they choose. With two or more datasets, the Sandbox shows a **Choose a dataset to start** banner with one button per dataset; they can switch later from the menu on the left. With only one dataset, it opens automatically. Tell students which dataset to pick for the exercise.

## LearnDifferently courses

### How do I add a pre or post assessment to a course?

Pre and post assessments are Interview Differently assessments; the course item launches one and brings the score back. Knowledge checks are unchanged: they stay inside the course (**+ Knowledge check**).

1. An Interview Differently admin imports the assessment (**Tools ▾ → Admin → Assessments → + Import**; format in [assessment-format.md](assessment-format.md)) and tells you its **slug**.
2. In LearnDifferently, open **Courses**, click the course, and under the module that should hold it click **+ Interview Differently assessment**.
3. In the item editor that opens, set the title, then:
   - **When it runs**: Before the course (pre-assessment) or After the course (post-assessment). It is required to finish the course and counts toward the gain.
   - **Attempts allowed**: 1 to 5. The best score counts.
   - **Time limit (minutes, optional)**: 5 to 240. The timer starts when the learner opens the attempt.
   - **Reference**: the assessment's slug. A wrong slug only shows up when a learner opens it, so open it yourself first.
4. **Save**.

There is no longer an **Assessment** button with questions typed into the course. Existing ones keep working and can still be edited until they are migrated (below).

### Migrating existing assessments

`apps/api/scripts/migrate-assessment-items.ts` converts every old in-course Assessment item into an Interview Differently assessment. Each item's questions become a bank with slug `ld-<item id>` (one section, every question asked, owned by the course's provider) and the item becomes a connected assessment with 1 attempt, keeping its Pre/Post label. Learners' existing scores, statuses and attempts are untouched. Rerunning converts nothing twice.

From `apps/api`:

```
npm run migrate:assessment-items                       # dry run: report only
npm run migrate:assessment-items -- --apply            # convert
npm run migrate:assessment-items -- --allow-host <host>   # a database that is not local or the dev database
```

The report lists items converted, questions converted, learners with progress on them, items skipped and why, and items whose questions carried a skill tag: their per-question results are no longer read, so that evidence stops feeding the remediation plan (re-tag the skill on a knowledge check or interview if it matters).

Production needs the owner's OK, and run it only after the API with connected-tool support is deployed; until then the converted items would not open.

### How do I add a SCORM package to a course?

In the dashboard (staff only, signed in to LearnDifferently):

1. Open **Courses**, then click the course.
2. Under the module that should hold it, find the **Add:** row and click **+ SCORM package**.
3. Choose the `.zip`. The server checks it before keeping anything and shows a plain-language error if it can't use the file.

Learners see it as an **Interactive lesson**. Its score and completion count toward the course and appear in the cohort gradebook.

Good to know:

- Supported: SCORM 1.2 and SCORM 2004 packages, up to 100 MB zipped (3,000 files, 250 MB unzipped). The zip must contain `imsmanifest.xml` with a launch file.
- To replace a package, delete the item and upload the new one.
- Only the manifest's default launch file is played, so packages with several separate lessons inside (multi-SCO sequencing) may not behave as authored.
- Uploaded content runs on the app's own address, so only upload packages you trust.

## Datasets

### Saving a dataset fails with "Request Entity Too Large"

The setup script is over the size limit, which is about 5 MB (raised from 100 KB on 2026-09-28). Split the data into a smaller dataset, or cut rows. Keep scripts well under the limit anyway: every student's browser loads the whole script each time they open the Sandbox, so very large scripts load slowly.
