# Assessment markdown format

Assessments are authored as one markdown file and imported under **Admin → Tools ▾ → Assessments → + Import**. Re-importing a file with the same `slug` replaces the question bank; existing deliveries and attempts are kept.

Keep the source file out of the repo — it contains the answers.

## Skeleton

```markdown
---
slug: sql-fundamentals-v1          # stable id; re-import replaces by slug
title: SQL Fundamentals Pre/Post
dataset: sql-fundamentals          # Dataset.slug (Admin → Datasets)
draw: { mc: 3, sql: 1 }            # default per section: 3 MC + 1 SQL; a plain number (draw: 4) is any-type; omit for "all"
expected_minutes: 30               # optional: how long it's designed to take, shown against actual times in analytics
---

## Section 1: Querying Basics
> draw: mc 4, sql 1                # optional per-section override (or a plain total: > draw: 5)

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

**Frontmatter** — required: `slug`, `title`, and `dataset` when the bank has any Hands-On SQL question (MC/Scenario-only banks omit it). Optional: `expected_minutes` — a positive whole number, how long the assessment is designed to take. It is shown next to students' actual start→submit times in the results and pre/post analytics; it is not a time limit (set that per delivery). Optional: `draw` — either a positive integer (questions of any type) or a per-type map `{ mc: 3, sql: 1 }` keyed by question type (`mc`, `scenario`, `sql`; a type not listed draws 0). Anything between the frontmatter and the first section heading is ignored, so delivery notes can stay at the top of the file.

**Sections** — `## Section N: Title` (also accepts `—` or `-` as the separator). An optional `> draw: …` line directly under the heading overrides the frontmatter default — a plain total (`> draw: 5`) or per-type counts (`> draw: mc 4, sql 1`; `mc: 4, sql: 1` also accepted). With per-type counts every student's paper has the same shape per section; each type is drawn from its own pool and the picks are shuffled together. A section that draws more than it has (overall, or of one type) uses all it has and reports a warning — it never substitutes another type.

**Questions** start with `**N.N (Type)**` followed by the prompt. `N.N` must be unique across the whole file. Backticked spans in prompts and options render as inline code. Scenario prompts additionally render as markdown (bold, italics, lists, tables); ```` ```sql ```` and ```` ```dax ```` fences are syntax-highlighted, other fences show as plain mono. MC and SQL prompts are plain text.

| Type | Written as | Notes |
|---|---|---|
| Multiple choice | `(MC)` | Options as `A) text` — all on one line (two or more spaces between them) or one per line; a line that isn't a new option continues the one above it. `**Answer: X**` with the option letter; trailing explanation after the letter is allowed and ignored. |
| Hands-on SQL | `(Hands-On SQL)` | `**Answer:**` on its own line, then a ```` ```sql ```` fence with the reference query. |
| Scenario | `(Scenario)` | Multiple choice with a longer setup: the prompt may span paragraphs (blank lines) and include markdown tables (data, a visual's output) and ```` ``` ```` blocks (a query, a measure, an error message). Options and `**Answer: X**` exactly as MC. Draw key `scenario`. |

A scenario question — lines inside the ```` ``` ```` block are shown verbatim and never read as options:

````markdown
**1.8 (Scenario)** A teammate wants customers who have never ordered and writes:

```sql
SELECT c.customer_id
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL;
```

It returns zero rows. What's the fix?
A) Change `JOIN` to `LEFT JOIN`
B) Change `IS NULL` to `= NULL`
C) Add `DISTINCT`
**Answer: A**
````

**Starter query (optional)** — a `**Starter:**` line followed by a ```` ```sql ```` fence, placed before `**Answer:**`. The student's editor opens pre-filled with it (they're told it's an example to edit or replace). Useful for scaffolding a `SELECT … FROM …` skeleton or a partial query with a `-- finish this` comment:

````markdown
**2.3 (Hands-On SQL)** Count customers per state, most first.
**Starter:**
```sql
SELECT state, COUNT(*) AS customers
FROM customers
-- group and order the result
```
**Answer:**
```sql
SELECT state, COUNT(*) AS customers FROM customers GROUP BY state ORDER BY customers DESC;
```
````

**SQL flags** — `>` lines between the prompt and `**Starter:**` / `**Answer:**`:

- `> ordered` — the student's row order must match the reference query's.
- `> strictColumns` — the student's column names must match (case-insensitive).

Without flags, grading ignores row order and column names but still requires the same column count.

## Grading

- **MC / Scenario** — exact option letter.
- **SQL** — the student's query and the reference query both run on a fresh copy of the dataset on the server; result sets must match (numbers compare to 6 decimal places, so `5985.00` = `5985`). A query that errors scores zero and the error is recorded for the admin view.
- Students see per-section totals only. The per-question breakdown is in **Admin → Assessments → delivery → Results** (and the CSV export).

Import runs every reference query first and refuses the file if any fail, so a typo in an answer key never reaches students.

## Deliveries

A delivery schedules the bank to one cohort with a label (`pre`, `post`, …), an optional open/close window, and an optional time limit. Each student gets one attempt per delivery; the questions are drawn at random when they start, so pre and post papers differ while keeping the same per-section counts. Answers save as the student works; submission is graded server-side.
