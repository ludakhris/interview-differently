# Authoring an assessment bank with an AI

Paste this whole file into the model's context, then describe the assessment you want (audience, topics, how many sections, pre/post). The model should return **one markdown file** that imports cleanly under **Admin → Tools ▾ → Assessments → + Import**.

The format is defined in [assessment-format.md](./assessment-format.md); this document is the *how to write good ones* companion, written for a model. Everything below is verified against the parser (`apps/api/src/assessments/parse-markdown.ts`) and the grader (`apps/api/src/assessments/grade.ts`).

> The finished bank contains answers. **Never commit it** — the repo is public. Keep it in `docs/private/` (gitignored) or outside the repo.

---

## 1. What you are producing

One markdown file:

- YAML frontmatter: `slug`, `title`, `dataset`, optional `draw`.
- One or more `## Section N: Title` headings. Optional `> draw: …` right under the heading.
- Questions numbered `**N.M (Type)**` where Type is `MC` or `Hands-On SQL`. (`Scenario` is parsed and skipped — don't emit it.)
- Every question ends with its answer. Nothing else is required.

The platform draws questions per section at random for each student, separately for the pre and the post delivery. `draw` is either:

- a plain total — `draw: 4` — four questions of any type, or
- per-type counts — `draw: { mc: 3, sql: 1 }` (frontmatter) / `> draw: mc 3, sql 1` (section) — exactly three MC and one Hands-On SQL, shuffled together. A type you don't list draws zero.

**Use per-type counts.** A plain total can hand one student three SQL questions in a section and another none, which wrecks pre/post comparability. So a section with 6 MC + 4 SQL and `draw: { mc: 3, sql: 1 }` gives every student a different 3 + 1 with the same shape. **Write more questions of each type than you draw** — that's the whole point.

## 2. Exact grammar

````markdown
---
slug: sql-fundamentals-v1
title: SQL Fundamentals Pre/Post
dataset: sql-fundamentals
draw: { mc: 3, sql: 1 }
---

## Section 1: Querying Basics
> draw: mc 2, sql 0

**1.1 (MC)** One-line question text.
A) option  B) option  C) option  D) option
**Answer: B**

**1.2 (MC)** Options may also be one per line.
A) option one
B) option two
**Answer: A. Optional explanation after the letter is ignored by the grader.**

**1.3 (Hands-On SQL)** The business ask, in plain English.
> ordered
> strictColumns
**Starter:**
```sql
SELECT …
FROM …
-- finish the query
```
**Answer:**
```sql
SELECT … ;
```
````

Rules the parser enforces (import fails otherwise):

- Frontmatter must have `slug`, `title`, `dataset`. `dataset` must be an existing Dataset slug. `draw` is a positive integer or a map of type → non-negative integer (`mc`, `sql`).
- Question ids must be unique across the whole file. Use `section.number`.
- MC: at least two options `A)`…; `**Answer: X**` must be one of them.
- SQL: `**Answer:**` on its own line followed by a ```` ```sql ```` fence containing the reference query. Every reference query is **executed on import** — one error and the import is rejected with the question id.
- `**Starter:**` + fence is optional and must come **before** `**Answer:**`. Flags (`> ordered`, `> strictColumns`) go between the prompt and the first `**Starter:**`/`**Answer:**`.
- Prompt text is everything between the question header and the first option / flag / Starter / Answer. Keep it to a few lines.

## 3. How SQL is graded — write the reference query with this in mind

The student's query and your reference query both run against a fresh copy of the dataset; the **result sets** are compared. Column names are irrelevant unless `strictColumns`; row order is irrelevant unless `ordered`. Specifically:

| Check | Default | With flag |
|---|---|---|
| Column **count** must match | always | always |
| Column **names** must match (case-insensitive) | no | `> strictColumns` |
| Row **order** must match | no (rows are sorted before comparing) | `> ordered` |
| Row count must match | always | always |
| Numbers compare to 6 decimals (`5985.00` = `5985`) | always | always |
| NULLs must be NULL in both | always | always |
| A query that errors | scores 0 (error shown to the admin) | |

Consequences for authoring:

- **Ask for exactly the columns you compare.** If the prompt says "return the state and the count", the reference must return exactly two columns. A student who adds a third column fails on column count — say so in the prompt if you want to be strict ("return only …").
- **Prefer no flags.** Most questions should be gradable regardless of column aliases and row order. Add `> ordered` only when ordering *is* the skill being tested ("most recent first", "top 5 by revenue"), and `> strictColumns` only when the prompt names the columns and naming is the point (`AS total_revenue`).
- **`ordered` + ties = flaky grading.** If you ask for "top 5 by revenue" and two rows tie at position 5, students with a different tie-break get marked wrong. Either make the reference deterministic with a secondary sort key **and say so in the prompt** ("ties broken by customer_id ascending"), or pick a cut-off that doesn't land on a tie. Check the data before you rely on a cut-off.
- **`LIMIT` without `ORDER BY`** is nondeterministic in Postgres — never write that in a reference query.
- **Avoid `SELECT *`** in references: column count then depends on the schema, and students naming columns differently is fine anyway.
- **Numeric formatting is normalised**, so `ROUND(x, 2)` vs raw `NUMERIC` only matters if the rounding changes the value at 6 decimals. Say "rounded to 2 decimals" in the prompt if you round in the reference.
- Dates come back as text (`2024-03-09`); comparisons are exact strings, so a `DATE` vs `TIMESTAMP` mismatch fails. Keep references on `DATE`.
- **Test for the mistake you're teaching**, not for trivia. If the lesson is "don't multiply rows with a join", the reference should be the correct aggregation and the prompt should make the join necessary.

MC grading is the letter only. Distractors should be the *plausible* wrong beliefs (e.g. `WHERE` vs `HAVING`, `INNER` vs `LEFT`), not nonsense.

## 4. Starter queries — when to use them

`**Starter:**` pre-fills the student's editor and runs it automatically when the page loads, so they see output immediately. The student is told it's an example to edit or replace; an untouched starter is graded as their answer. Use one when:

- the skill is *modifying* a query (add a `HAVING`, fix a join, change the aggregation) — give the base query;
- the schema is unfamiliar and you want to lower the blank-page cost — give `SELECT … FROM … ` with a `-- finish the query` comment;
- the question is late in a section and builds on an earlier one.

Don't use one when the skill is *composing* from scratch, and never make the starter already correct.

## 5. The `sql-fundamentals` dataset (the one the CD cohort uses)

Deterministic, ~80 customers / ~190 orders / ~420 line items / 24 products. Order dates are relative to `CURRENT_DATE`, so "last 30 days" questions keep working.

```
customers        customer_id INT PK, first_name TEXT, last_name TEXT, email TEXT (nullable),
                 city TEXT, state TEXT, country TEXT, signup_date DATE
products         product_id INT PK, product_name TEXT, category TEXT, unit_cost NUMERIC(10,2),
                 stock_qty INT, is_active BOOLEAN
orders           order_id INT PK, customer_id INT → customers, order_date DATE,
                 status TEXT ('completed' | 'pending' | 'cancelled'), shipped_date DATE (nullable)
order_items      order_item_id INT PK, order_id INT → orders, product_id INT → products,
                 quantity INT, unit_price NUMERIC(10,2)      -- line revenue = quantity * unit_price
customers_messy  same columns as customers but deliberately dirty: mixed-case / padded state,
                 NULL emails, signup_date stored as TEXT. Use it for data-cleaning questions only.
```

Facts you can build questions on (verified 2026-09-13):

- Statuses: 123 `completed`, 37 `pending`, 27 `cancelled`. Revenue questions should say "completed orders only".
- Product categories: Electronics (6), Office (5), Home (4), Outdoors (4), Apparel (3), Garden (2). Three products are `is_active = FALSE`, one with `stock_qty = 0`.
- Some customers have `NULL` email — good for `IS NULL` / `COALESCE` / `CASE` questions.
- Some customers have no orders — good for `LEFT JOIN … WHERE o.order_id IS NULL`.
- Two products tie on top revenue — don't ask "the single top product by revenue" with `> ordered` and `LIMIT 1`.
- `orders.shipped_date` is NULL for unshipped orders.

If you're authoring for a different dataset, ask for its schema summary first (Admin → Datasets shows tables, columns, row counts) and load it in the sandbox to check every reference query and cut-off.

## 6. Question design for pre/post

The same bank serves both deliveries with a different random draw, so:

- Every section needs, **per type**, at least the drawn count + 2 questions of comparable difficulty (e.g. `mc 3, sql 1` → ≥ 5 MC and ≥ 3 SQL), or the pre and post papers won't be comparable. A section short on a type gives students fewer questions, not a substitute.
- Order sections easy → hard; the platform reports per-section scores, and cohort admins read "% improvement" per section.
- Mix: roughly 60% MC (fast, broad coverage) / 40% Hands-On SQL (the skill). A 45-minute paper is ~24 drawn questions with ~8 SQL — express that in the per-type `draw` counts rather than hoping the random draw lands there. Concept-only sections can be `> draw: mc 4, sql 0`.
- Each SQL question should be answerable in ≤ 5 minutes by someone who has the skill. If the reference needs a CTE plus two joins plus a window function, split it.
- Prompts must be unambiguous about the output: which columns, which filter, which order, rounding. Anything you'd have to explain to a human grader must be in the prompt, because there is no human grader.

## 7. Checklist before handing the file over

- [ ] Frontmatter has `slug`, `title`, `dataset`; `dataset` slug exists.
- [ ] `draw` uses per-type counts, and every section has ≥ drawn + 2 questions **of each type it draws**.
- [ ] Every MC has 2–4 options and an `**Answer: X**` that's one of them.
- [ ] Every SQL question has a ```` ```sql ```` reference under `**Answer:**` that runs without error.
- [ ] No reference uses `SELECT *`, `LIMIT` without `ORDER BY`, `RANDOM()`, or `NOW()`.
- [ ] `> ordered` only where order is the skill; tie-breaks stated in the prompt.
- [ ] `> strictColumns` only where the prompt names the columns.
- [ ] Prompts state the exact columns expected and "completed orders only" where revenue is involved.
- [ ] Starters (if any) are not already correct.
- [ ] Question ids unique; sections numbered from 1.

## 8. Worked example (a complete, importable bank)

````markdown
---
slug: sql-fundamentals-mini
title: SQL Fundamentals — mini bank
dataset: sql-fundamentals
draw: { mc: 1, sql: 1 }
---

## Section 1: Filtering & sorting

**1.1 (MC)** Which clause removes rows *before* any grouping happens?
A) HAVING  B) WHERE  C) GROUP BY  D) ORDER BY
**Answer: B**

**1.2 (MC)** `ORDER BY signup_date` with no direction sorts…
A) newest first  B) oldest first  C) in insertion order  D) randomly
**Answer: B**

**1.3 (Hands-On SQL)** Return the first_name, last_name and signup_date of the 5 most recently signed-up customers from Texas (state 'TX'), newest first. Return only those three columns.
> ordered
**Answer:**
```sql
SELECT first_name, last_name, signup_date
FROM customers
WHERE state = 'TX'
ORDER BY signup_date DESC, customer_id ASC
LIMIT 5;
```

**1.4 (Hands-On SQL)** Return every customer (customer_id, first_name, last_name) whose email is missing.
**Answer:**
```sql
SELECT customer_id, first_name, last_name
FROM customers
WHERE email IS NULL;
```

**1.5 (Hands-On SQL)** Return the customer_id and email of customers whose email is a gmail.com address. Return only those two columns.
**Answer:**
```sql
SELECT customer_id, email
FROM customers
WHERE email LIKE '%@gmail.com';
```

## Section 2: Aggregation

**2.1 (MC)** To keep only groups with more than 10 rows you use…
A) WHERE COUNT(*) > 10  B) HAVING COUNT(*) > 10  C) LIMIT 10  D) GROUP BY COUNT(*) > 10
**Answer: B**

**2.2 (Hands-On SQL)** Count customers per state. Return two columns named state and customers, states with the most customers first; break ties by state ascending.
> ordered
> strictColumns
**Starter:**
```sql
SELECT state, COUNT(*) AS customers
FROM customers
-- group and order the result
```
**Answer:**
```sql
SELECT state, COUNT(*) AS customers
FROM customers
GROUP BY state
ORDER BY customers DESC, state ASC;
```

**2.3 (Hands-On SQL)** How many orders have each status? Return the status and the count.
**Answer:**
```sql
SELECT status, COUNT(*)
FROM orders
GROUP BY status;
```

**2.4 (Hands-On SQL)** Total revenue (quantity × unit_price) from completed orders only, as a single number.
**Answer:**
```sql
SELECT SUM(oi.quantity * oi.unit_price)
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.status = 'completed';
```

**2.5 (Hands-On SQL)** Return the customer_id of every customer who has never placed an order.
**Answer:**
```sql
SELECT c.customer_id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL;
```
````

Import it with **Preview** first: the preview runs every reference query and lists any that fail before anything is saved.
