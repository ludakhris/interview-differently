import type { CheckpointHelpKind } from '../../core/checkpoint-types'
import type { IntakeLevel } from '../learn-types'

/**
 * The adaptive checkpoints demo: one SQL course and two scripted learners, Maya (has seen SQL
 * before, shaky on joins) and Theo (never written SQL). The seed (scripts/seed-adaptive-demo.ts) builds the
 * course from this; the board plays a persona's next step through the same service a real learner uses, so
 * grading, coaching, plan changes and generated practice are all real. Fictional people and data.
 */

export const DEMO_BANK = 'sql-adaptive-checkpoints'
export const DEMO_COURSE_SLUG = 'sql-fundamentals-adaptive'

export const DEMO_SKILLS = [
  // Worded as the job asks for them; the SQL behind each is in the lessons.
  { id: 'filter', label: 'Pull the right customers and orders', targetPct: 80, minEvidence: 2 },
  { id: 'sort', label: 'Rank and prioritize results', targetPct: 80, minEvidence: 2 },
  { id: 'aggregate', label: 'Report totals and averages', targetPct: 80, minEvidence: 2 },
  { id: 'join', label: 'Connect customers, orders and products', targetPct: 80, minEvidence: 2 },
]

export const T = {
  diagnostic: 'Diagnostic: your first week as a data analyst',
  lesson: {
    filter: 'Lesson: finding the right rows with WHERE',
    sort: 'Lesson: putting results in order',
    aggregate: 'Lesson: counting and averaging with GROUP BY',
    join: 'Lesson: connecting tables with JOIN',
  },
  check: {
    filter: 'Checkpoint: filtering requests',
    sort: 'Checkpoint: ranking requests',
    aggregate: 'Checkpoint: summary requests',
    join: 'Checkpoint: requests across tables',
  },
  another: {
    filter: 'Another way to see it: filters as questions',
    sort: 'Another way to see it: sorting like a spreadsheet',
    aggregate: 'Another way to see it: piles and totals',
    join: 'Another way to see it: matching two lists',
  },
  video: {
    filter: 'Video made for you: filters',
    sort: 'Video made for you: sorting',
    aggregate: 'Video made for you: grouping',
    join: 'Video made for you: joins',
  },
  practice: {
    filter: 'Targeted practice: filtering',
    sort: 'Targeted practice: sorting',
    aggregate: 'Targeted practice: grouping',
    join: 'Targeted practice: joins',
  },
  capstone: 'Capstone: the quarterly business review',
} as const

export type DemoSkill = keyof typeof T.lesson

export type DemoStep =
  | { do: 'intake'; level: IntakeLevel; fresh: boolean; say: string }
  | { do: 'submit'; item: string; ref: string; sql: string; say: string }
  | { do: 'help'; item: string; ref: string; sql: string; kind: CheckpointHelpKind; say: string }
  | { do: 'lesson'; item: string; say: string }
  | { do: 'practice'; item: string; say: string }
  | { do: 'video'; item: string; say: string }
  | { do: 'watch'; item: string; say: string }

/** Demo learners: fixed ids so the seed and the board agree. */
export const PERSONAS: {
  id: string
  userId: string
  name: string
  email: string
  steps: DemoStep[]
}[] = [
  {
    id: 'maya',
    userId: 'demo_adaptive_maya',
    name: 'Maya Okafor',
    email: 'maya.okafor@example.org',
    steps: [
      {
        do: 'intake',
        level: 'some',
        fresh: false,
        say: 'Maya says she has used SQL a little before and takes the diagnostic',
      },
      {
        do: 'submit',
        item: T.diagnostic,
        ref: '1.1',
        sql: "SELECT first_name, last_name, email FROM customers WHERE state = 'IL';",
        say: 'Maya answers the Illinois support request',
      },
      {
        do: 'submit',
        item: T.diagnostic,
        ref: '1.2',
        sql: 'SELECT product_name, category FROM products WHERE NOT is_active;',
        say: 'Maya lists the inactive products',
      },
      {
        do: 'submit',
        item: T.diagnostic,
        ref: '2.1',
        sql: 'SELECT product_name, unit_cost FROM products ORDER BY unit_cost DESC LIMIT 5;',
        say: 'Maya ranks the five most expensive products',
      },
      {
        do: 'submit',
        item: T.diagnostic,
        ref: '2.2',
        sql: 'SELECT first_name, last_name, signup_date FROM customers ORDER BY signup_date LIMIT 3;',
        say: 'Maya finds the three earliest customers',
      },
      {
        do: 'submit',
        item: T.diagnostic,
        ref: '3.1',
        sql: 'SELECT state, COUNT(*) FROM customers GROUP BY state;',
        say: 'Maya counts customers per state',
      },
      {
        do: 'submit',
        item: T.diagnostic,
        ref: '3.2',
        sql: 'SELECT status, COUNT(order_id) FROM orders GROUP BY status;',
        say: 'Maya counts orders per status',
      },
      {
        do: 'submit',
        item: T.diagnostic,
        ref: '4.1',
        sql: "SELECT order_id, order_date, first_name, last_name FROM orders WHERE city = 'Chicago';",
        say: 'Maya tries the Chicago orders without a join and misses: the diagnostic stops probing joins, ends, and her plan changes',
      },
      { do: 'lesson', item: T.lesson.join, say: 'Maya reads the JOIN lesson' },
      {
        do: 'practice',
        item: T.practice.join,
        say: 'Claude writes JOIN practice aimed at Maya’s mistake',
      },
      {
        do: 'submit',
        item: T.check.join,
        ref: '4.3',
        sql: 'SELECT c.customer_id, c.first_name, c.last_name FROM customers c JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;',
        say: 'Maya uses an inner join for customers with no orders: zero rows',
      },
      {
        do: 'help',
        item: T.check.join,
        ref: '4.3',
        sql: 'SELECT c.customer_id, c.first_name, c.last_name FROM customers c JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;',
        kind: 'hint',
        say: 'Maya asks for a hint',
      },
      {
        do: 'submit',
        item: T.check.join,
        ref: '4.3',
        sql: 'SELECT c.customer_id, c.first_name, c.last_name FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;',
        say: 'Maya switches to LEFT JOIN and gets it',
      },
      {
        do: 'submit',
        item: T.check.join,
        ref: '4.4',
        sql: 'SELECT c.state, COUNT(*) FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY c.state;',
        say: 'Maya counts orders per state: JOIN is now shown',
      },
      {
        do: 'submit',
        item: T.capstone,
        ref: '5.1',
        sql: "SELECT p.category, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN products p ON p.product_id = oi.product_id JOIN orders o ON o.order_id = oi.order_id WHERE o.status = 'completed' GROUP BY p.category ORDER BY revenue DESC;",
        say: 'Maya builds revenue by category for the CEO',
      },
      {
        do: 'submit',
        item: T.capstone,
        ref: '5.2',
        sql: 'SELECT c.state, COUNT(*) AS orders FROM orders o JOIN customers c USING (customer_id) GROUP BY c.state ORDER BY orders DESC LIMIT 3;',
        say: 'Maya ranks the top three states',
      },
      {
        do: 'submit',
        item: T.capstone,
        ref: '5.3',
        sql: "SELECT COUNT(*) FROM orders WHERE status = 'cancelled';",
        say: 'Maya counts cancelled orders and finishes the capstone',
      },
    ],
  },
  {
    id: 'theo',
    userId: 'demo_adaptive_theo',
    name: 'Theo Brandt',
    email: 'theo.brandt@example.org',
    steps: [
      {
        do: 'intake',
        level: 'never',
        fresh: true,
        say: 'Theo says he has never written SQL and starts from the beginning',
      },
      { do: 'lesson', item: T.lesson.filter, say: 'Theo reads the WHERE lesson' },
      {
        do: 'submit',
        item: T.check.filter,
        ref: '1.3',
        sql: "SELECT first_name, last_name, signup_date FROM customers WHERE state = 'TX' OR signup_date >= '2024-01-01';",
        say: 'Theo uses OR where the request means AND',
      },
      {
        do: 'help',
        item: T.check.filter,
        ref: '1.3',
        sql: "SELECT first_name, last_name, signup_date FROM customers WHERE state = 'TX' OR signup_date >= '2024-01-01';",
        kind: 'explain',
        say: 'Theo asks for another explanation',
      },
      {
        do: 'submit',
        item: T.check.filter,
        ref: '1.3',
        sql: "SELECT first_name, last_name, signup_date FROM customers WHERE state = 'TX' AND signup_date >= '2024-01-01';",
        say: 'Theo fixes it with AND',
      },
      {
        do: 'submit',
        item: T.check.filter,
        ref: '1.4',
        sql: 'SELECT customer_id, first_name, last_name FROM customers WHERE email = NULL;',
        say: 'Theo writes = NULL and gets no rows: the checkpoint ends below the pass mark',
      },
      {
        do: 'practice',
        item: T.practice.filter,
        say: 'Claude writes filtering practice aimed at Theo’s OR and NULL mistakes',
      },
      {
        do: 'video',
        item: T.video.filter,
        say: 'New to SQL, Theo gets a video instead of reading: Claude writes one on AND vs OR and NULL',
      },
      {
        do: 'watch',
        item: T.video.filter,
        say: 'Theo watches the 90-second video made for him',
      },
      {
        do: 'help',
        item: T.check.filter,
        ref: '1.4',
        sql: 'SELECT customer_id, first_name, last_name FROM customers WHERE email = NULL;',
        kind: 'example',
        say: 'Theo asks for a worked example',
      },
      {
        do: 'submit',
        item: T.check.filter,
        ref: '1.4',
        sql: 'SELECT customer_id, first_name, last_name FROM customers WHERE email IS NULL;',
        say: 'Theo uses IS NULL: filtering is now shown',
      },
      { do: 'lesson', item: T.lesson.sort, say: 'Theo reads the sorting lesson' },
      {
        do: 'submit',
        item: T.check.sort,
        ref: '2.4',
        sql: 'SELECT order_id, order_date FROM orders ORDER BY order_date DESC LIMIT 10;',
        say: 'Theo forgets the tie-break on recent orders',
      },
      {
        do: 'submit',
        item: T.check.sort,
        ref: '2.4',
        sql: 'SELECT order_id, order_date FROM orders ORDER BY order_date DESC, order_id DESC LIMIT 10;',
        say: 'Theo adds the tie-break before finishing, so the slip costs nothing',
      },
      {
        do: 'submit',
        item: T.check.sort,
        ref: '2.3',
        sql: 'SELECT product_name, unit_cost FROM products WHERE is_active ORDER BY unit_cost, product_name;',
        say: 'Theo sorts active products by price: sorting is shown',
      },
      { do: 'lesson', item: T.lesson.aggregate, say: 'Theo reads the GROUP BY lesson' },
      {
        do: 'submit',
        item: T.check.aggregate,
        ref: '3.3',
        sql: 'SELECT category, ROUND(AVG(unit_cost), 2) FROM products GROUP BY category;',
        say: 'Theo averages cost per category',
      },
      {
        do: 'submit',
        item: T.check.aggregate,
        ref: '3.4',
        sql: 'SELECT state, COUNT(*) FROM customers WHERE COUNT(*) >= 6 GROUP BY state;',
        say: 'Theo filters a count with WHERE and gets an error: another gap',
      },
      {
        do: 'help',
        item: T.check.aggregate,
        ref: '3.4',
        sql: 'SELECT state, COUNT(*) FROM customers WHERE COUNT(*) >= 6 GROUP BY state;',
        kind: 'hint',
        say: 'Theo asks the coach for a hint',
      },
      {
        do: 'submit',
        item: T.check.aggregate,
        ref: '3.4',
        sql: 'SELECT state, COUNT(*) FROM customers GROUP BY state HAVING COUNT(*) >= 6;',
        say: 'Theo moves the count into HAVING: summarizing is proven, the extra help is no longer needed',
      },
      { do: 'lesson', item: T.lesson.join, say: 'Theo reads the JOIN lesson' },
      {
        do: 'submit',
        item: T.check.join,
        ref: '4.3',
        sql: 'SELECT c.customer_id, c.first_name, c.last_name FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;',
        say: 'Theo finds the customers who never ordered with a LEFT JOIN',
      },
      {
        do: 'submit',
        item: T.check.join,
        ref: '4.4',
        sql: 'SELECT c.state, COUNT(*) FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY c.state;',
        say: 'Theo counts orders per state: joins are proven',
      },
      {
        do: 'submit',
        item: T.capstone,
        ref: '5.1',
        sql: "SELECT p.category, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN products p ON p.product_id = oi.product_id JOIN orders o ON o.order_id = oi.order_id WHERE o.status = 'completed' GROUP BY p.category ORDER BY revenue DESC;",
        say: 'Theo builds revenue by category for the CEO',
      },
      {
        do: 'submit',
        item: T.capstone,
        ref: '5.2',
        sql: 'SELECT c.state, COUNT(*) AS orders FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY c.state ORDER BY orders DESC LIMIT 3;',
        say: 'Theo ranks the top three states',
      },
      {
        do: 'submit',
        item: T.capstone,
        ref: '5.3',
        sql: "SELECT COUNT(*) FROM orders WHERE status = 'cancelled';",
        say: 'Theo finishes the capstone: job ready, later than Maya, same outcome',
      },
    ],
  },
]
