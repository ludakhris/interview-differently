# Assessment markdown format

Assessments are authored as one markdown file and imported under **Admin → Tools ▾ → Assessments → + Import**. Re-importing a file with the same `slug` replaces the question bank; existing deliveries and attempts are kept.

Keep the source file out of the repo — it contains the answers.

## Skeleton

```markdown
---
slug: sql-fundamentals-v1          # stable id; re-import replaces by slug
title: SQL Fundamentals Pre/Post
dataset: sql-fundamentals          # Dataset.slug (Admin → Datasets)
draw: 4                            # default questions drawn per section; omit for "all"
---

## Section 1: Querying Basics
> draw: 5                          # optional per-section override

**1.1 (MC)** Which clause is used to filter individual rows before any grouping happens?
A) SELECT  B) WHERE  C) HAVING  D) ORDER BY
**Answer: B**

**1.2 (MC)** By default, does `ORDER BY signup_date` sort oldest-first or newest-first?
A) Oldest first (ascending)
B) Newest first (descending)
**Answer: A. ASC is the default when nothing is specified.**

**1.7 (Hands-On SQL)** Return the 5 most recently signed-up customers from Texas, most recent first.
> ordered
**Answer:**
```sql
SELECT first_name, last_name, signup_date
FROM customers
WHERE state = 'TX'
ORDER BY signup_date DESC
LIMIT 5;
```

---

## Section 2: Aggregations
…
```

## Rules

**Frontmatter** — required: `slug`, `title`, `dataset`. Optional: `draw` (positive integer). Anything between the frontmatter and the first section heading is ignored, so delivery notes can stay at the top of the file.

**Sections** — `## Section N: Title` (also accepts `—` or `-` as the separator). An optional `> draw: N` line directly under the heading overrides the frontmatter default. A section that draws more questions than it has uses all of them and reports a warning.

**Questions** start with `**N.N (Type)**` followed by the prompt. `N.N` must be unique across the whole file. Backticked spans in prompts and options render as inline code.

| Type | Written as | Notes |
|---|---|---|
| Multiple choice | `(MC)` | Options as `A) text` — all on one line (two or more spaces between them) or one per line. `**Answer: X**` with the option letter; trailing explanation after the letter is allowed and ignored. |
| Hands-on SQL | `(Hands-On SQL)` | `**Answer:**` on its own line, then a ```` ```sql ```` fence with the reference query. |
| Scenario / short answer | `(Scenario)` | Not supported yet — skipped with a warning. |

**SQL flags** — `>` lines between the prompt and `**Answer:**`:

- `> ordered` — the student's row order must match the reference query's.
- `> strictColumns` — the student's column names must match (case-insensitive).

Without flags, grading ignores row order and column names but still requires the same column count.

## Grading

- **MC** — exact option letter.
- **SQL** — the student's query and the reference query both run on a fresh copy of the dataset on the server; result sets must match (numbers compare to 6 decimal places, so `5985.00` = `5985`). A query that errors scores zero and the error is recorded for the admin view.
- Students see per-section totals only. The per-question breakdown is in **Admin → Assessments → delivery → Results** (and the CSV export).

Import runs every reference query first and refuses the file if any fail, so a typo in an answer key never reaches students.

## Deliveries

A delivery schedules the bank to one cohort with a label (`pre`, `post`, …), an optional open/close window, and an optional time limit. Each student gets one attempt per delivery; the questions are drawn at random when they start, so pre and post papers differ while keeping the same per-section counts. Answers save as the student works; submission is graded server-side.
