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

## Datasets

### Saving a dataset fails with "Request Entity Too Large"

The setup script is over the size limit, which is about 5 MB (raised from 100 KB on 2026-09-28). Split the data into a smaller dataset, or cut rows. Keep scripts well under the limit anyway: every student's browser loads the whole script each time they open the Sandbox, so very large scripts load slowly.
