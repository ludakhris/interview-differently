---
slug: sql-adaptive-checkpoints
title: First Week on the Data Team
dataset: sql-fundamentals
---

A work simulation (GitHub issue #90): colleagues at Brightline Goods, an online store, send data requests in a chat and
the learner answers each one with a SQL query. Fictional store and people. Standalone Interview Differently offers it
in the Data Analytics track; the adaptive demo course (scripts/seed-adaptive-demo.ts) uses the same requests for its
diagnostic and checkpoints. Each section is one skill: .1 and .2 are the diagnostic, .3 and .4 the module checkpoint.
The answers are public, as this repository is.

## Section 1: Select and filter rows

> competency: Finding the right records

**1.1 (Hands-On SQL)** Hi! I'm calling everyone in Illinois about a delayed shipment. Can you get me the first name, last name and email of every customer whose state is IL?

> from: Dana · Customer support

**Answer:**

```sql
SELECT first_name, last_name, email FROM customers WHERE state = 'IL';
```

**1.2 (Hands-On SQL)** We need shelf space in the warehouse. Could you list the product name and category of every product that is no longer active?

> from: Luis · Warehouse

**Answer:**

```sql
SELECT product_name, category FROM products WHERE is_active = FALSE;
```

**1.3 (Hands-On SQL)** Marketing is planning a Texas promotion for newer customers. Return the first name, last name and signup date of customers in TX who signed up on or after 2024-01-01.

**Answer:**

```sql
SELECT first_name, last_name, signup_date FROM customers WHERE state = 'TX' AND signup_date >= '2024-01-01';
```

**1.4 (Hands-On SQL)** Before the next newsletter, the data team wants to fix missing contact details. List the customer id, first name and last name of every customer with no email address.

**Answer:**

```sql
SELECT customer_id, first_name, last_name FROM customers WHERE email IS NULL;
```

## Section 2: Sort and limit results

> competency: Ranking and top results

**2.1 (Hands-On SQL)** I'm reviewing what costs us most to stock. Can you send the product name and unit cost of the 5 products with the highest unit cost, most expensive first?

> from: Priya · Finance

> ordered

**Answer:**

```sql
SELECT product_name, unit_cost FROM products ORDER BY unit_cost DESC LIMIT 5;
```

**2.2 (Hands-On SQL)** I want to send a thank-you note to our very first customers. Who are the 3 earliest to sign up? First name, last name and signup date, earliest first please.

> from: Sam · Founder

> ordered

**Answer:**

```sql
SELECT first_name, last_name, signup_date FROM customers ORDER BY signup_date ASC LIMIT 3;
```

**2.3 (Hands-On SQL)** Purchasing wants to see the cheapest active products first. List the product name and unit cost of every active product, cheapest first, and break ties by product name A to Z.

> ordered

**Answer:**

```sql
SELECT product_name, unit_cost FROM products WHERE is_active = TRUE ORDER BY unit_cost ASC, product_name ASC;
```

**2.4 (Hands-On SQL)** Show the order id and order date of the 10 most recent orders, newest first, breaking ties by order id from highest to lowest.

> ordered

**Answer:**

```sql
SELECT order_id, order_date FROM orders ORDER BY order_date DESC, order_id DESC LIMIT 10;
```

## Section 3: Summarize with GROUP BY

> competency: Summarizing data

**3.1 (Hands-On SQL)** Quick one for my territory planning: how many customers do we have in each state? Each state and its number of customers.

> from: Grace · Sales

**Answer:**

```sql
SELECT state, COUNT(*) AS customers FROM customers GROUP BY state;
```

**3.2 (Hands-On SQL)** I'm checking order health this morning. For each order status, how many orders have it?

> from: Omar · Operations

**Answer:**

```sql
SELECT status, COUNT(*) AS orders FROM orders GROUP BY status;
```

**3.3 (Hands-On SQL)** For pricing, return each product category and its average unit cost, rounded to 2 decimal places.

**Answer:**

```sql
SELECT category, ROUND(AVG(unit_cost), 2) AS avg_cost FROM products GROUP BY category;
```

**3.4 (Hands-On SQL)** The regional managers only care about bigger markets. Return each state that has at least 6 customers, with its number of customers.

**Answer:**

```sql
SELECT state, COUNT(*) AS customers FROM customers GROUP BY state HAVING COUNT(*) >= 6;
```

## Section 4: Combine tables with JOIN

> competency: Connecting data across tables

**4.1 (Hands-On SQL)** I run the Chicago store and want to see our local orders. Can you pull the order id, order date and the customer's first and last name for every order placed by a customer whose city is Chicago?

> from: Mei · Chicago store

**Answer:**

```sql
SELECT o.order_id, o.order_date, c.first_name, c.last_name FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE c.city = 'Chicago';
```

**4.2 (Hands-On SQL)** Which products actually sell? I need each product name with the total quantity sold across all order items.

> from: Ana · Merchandising

**Answer:**

```sql
SELECT p.product_name, SUM(oi.quantity) AS units FROM order_items oi JOIN products p ON p.product_id = oi.product_id GROUP BY p.product_name;
```

**4.3 (Hands-On SQL)** The retention team wants to reach people who signed up but never bought. Return the customer id, first name and last name of every customer who has never placed an order.

**Answer:**

```sql
SELECT c.customer_id, c.first_name, c.last_name FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;
```

**4.4 (Hands-On SQL)** Return each customer state and the number of orders placed by customers in that state.

**Answer:**

```sql
SELECT c.state, COUNT(*) AS orders FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY c.state;
```

## Section 5: Capstone: the quarterly business review

> competency: Answering business questions with data

**5.1 (Hands-On SQL)** The CEO asks which categories bring in the most money. For completed orders only, return each category and its revenue (quantity times unit price from order items), highest revenue first.

> ordered

**Answer:**

```sql
SELECT p.category, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN products p ON p.product_id = oi.product_id JOIN orders o ON o.order_id = oi.order_id WHERE o.status = 'completed' GROUP BY p.category ORDER BY revenue DESC;
```

**5.2 (Hands-On SQL)** Return the 3 states with the most orders, with their order counts, most orders first.

> ordered

**Answer:**

```sql
SELECT c.state, COUNT(*) AS orders FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY c.state ORDER BY orders DESC LIMIT 3;
```

**5.3 (Hands-On SQL)** How many cancelled orders are there? Return a single number.

**Answer:**

```sql
SELECT COUNT(*) FROM orders WHERE status = 'cancelled';
```
