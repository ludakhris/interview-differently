# Adaptive checkpoints: how the pieces fit (GitHub issue #90)

The adaptive course runs on three products with no code crossing between them. The LMS places items, keeps progress and
changes the plan. The Simulator (Interview Differently) runs the SQL work. Spark plays the short lessons. Each learner
screen comes from the product that owns it, embedded in the LMS course page.

## The learner's path through one checkpoint

1. The LMS item page shows the checkpoint. A diagnostic first asks the intake question (LMS data).
2. The LMS launches the Simulator by LTI 1.3 into an iframe on the page (`document_target: iframe`). Custom params carry
   the placement: question refs, the scenario line, and for a practice slot the skill and its evidence refs.
3. The frame cannot rely on a cross-site cookie, so the launch uses LTI platform storage (1EdTech "Client Side
   postMessages"): the tool keeps its login state in the parent page (`lti.put_data` / `lti.get_data`) instead of the
   `lti_state` cookie. Outside a frame the cookie path is unchanged.
4. The Simulator page is a chat: colleagues send requests one at a time, the learner answers in a SQL editor, runs it,
   submits or passes, and can ask the coach for a hint. Every answer is graded on the server and stored as a Simulator
   `PracticeEvent`. When every request has an answer, the Simulator posts the score by LTI AGS (as for any ID
   assessment).
5. After each answer the frame tells its parent (`postMessage {subject: 'id.checkpoint.answered'}`). The message only
   nudges: the LMS calls its own `sync` endpoint, which reads the evidence through the simulator feed (`core/`),
   updates the plan, and returns what was proven or added, which the course page shows.

## Spark lessons

The LMS item `spark_lesson` asks Spark (through `core/spark-port.ts`) for the learner's lesson. Spark reuses an approved
lesson from its library when one fits, or writes one, and returns a signed link to `apps/spark`, which plays it in a
frame. The player has no site of its own: it is published inside the Learn Differently site at `/spark/`
(`SPARK_WEB_URL`; see `docs/dev-api.md`). Spark records views and completion (`LessonEvent`); the LMS reads them
through the port and completes the item by its own rule.

## AI content is ours

Generated practice (Simulator `PracticeSet`) and lessons (Spark `Lesson`) are library rows: no foreign key to a learner,
course or provider, so they outlive all three. Each row keeps the model, prompt version, source bank and dataset, skill,
and the token counts the Claude API returns. A learner's use of a row is a separate tenant row (`PracticeSetUse`,
`LessonUse`). Approved content that a person reviewed is reused before anything new is written.

## Where the code lives

| Piece                                     | API                                                              | Screens                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Plan, intake, sync, board, demo           | `api/src/learn/adaptive`                                         | `apps/learn`                                                                      |
| Chat simulation, grading, coach, practice | `api/src/simulator/checkpoints`                                  | `apps/web` (`/lti/checkpoint/:deliveryId`; standalone `/simulations/:deliveryId`) |
| Lessons, narration, lesson events         | `api/src/spark`                                                  | `apps/spark`                                                                      |
| Ports between them                        | `api/src/core` (`practice-port`, `spark-port`, `simulator-feed`) | `postMessage` subjects above                                                      |
