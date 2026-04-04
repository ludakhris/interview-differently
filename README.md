# Interview Differently

An AI-powered career simulation platform built for universities, workforce nonprofits, and career changers. Students move through realistic branching workplace scenarios and make real decisions. The AI evaluates how they think, not just what they answer.

## The problem

Career coaching capacity at most institutions is structurally broken. A typical university career center serves 3,000 to 5,000 students with two or three coaches. Students graduate having read about professional environments but never having practiced inside one. Interview Differently closes that gap with scalable, AI-evaluated simulation that no human coach can deliver at volume.

## What it does

Students select a simulation track, read into a realistic workplace scenario, and make sequential decisions at each step. Each decision branches the scenario — different choices reveal different consequences. At the end, the AI scores performance across four competency dimensions and delivers written feedback tailored to how the student actually responded.

Institutions get a separate analytics dashboard showing aggregate competency data across their student population, filterable by cohort.

## Simulation tracks

| Track | Scenario type |
|---|---|
| Incident Response | Triage live system failures, prioritize under time pressure, communicate with stakeholders |
| Business Case | Structure ambiguous problems, build analytical frameworks, present recommendations |
| Risk and Compliance | Identify control failures, calibrate severity, escalate through correct channels |

## Architecture

```
Frontend (React + TypeScript)     →   Vercel
Backend API (NestJS + TypeScript) →   Railway
PostgreSQL                        →   Railway
Redis (session state)             →   Railway
AI evaluation                     →   Anthropic Claude API
Auth                              →   Clerk (SSO + institutional email)
```

## Repo structure

```
/apps
  /web      React frontend — simulation experience, dashboard, feedback
  /api      NestJS backend — scenario engine, session manager, AI service
/packages
  /types    Shared TypeScript interfaces (scenario, user, score, session)
```

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Student simulation — 3 tracks, branching engine, scored feedback | In progress |
| 2 | No-code scenario builder — React Flow canvas for institutions | Planned |
| 3 | Institution analytics dashboard — competency heatmap, cohort views | Planned |

## Setup and deployment

See [INSTALL.md](./INSTALL.md) for local development setup, environment variables, and deployment instructions.
