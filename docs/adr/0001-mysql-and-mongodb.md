# ADR 0001: MySQL for core data, MongoDB for flexible data

**Status:** Accepted

## Context
TalentEd stores two different kinds of data:
- Users, courses, enrollments, orders and payments, which reference each other and involve money.
- Quizzes (a variable-length array of questions, each with an array of options), AI chat history and lesson chunks with 384-number embedding vectors.

## Decision
- **MySQL (via Prisma)** for users, sessions, courses, lessons, enrollments, orders, payments, uploads and share links. Foreign keys keep data consistent, unique indexes enforce rules ("one enrollment per student per course", "one ledger row per Razorpay payment"), and transactions make enrollment + payment atomic.
- **MongoDB** for quizzes, quiz attempts, AI chat sessions and lesson chunks. These are naturally nested documents, are read whole, and their shape may change (new question types) without migrations.

## Consequences
- Two databases to run and back up. Docker Compose hides this locally.
- No cross-database joins: Mongo documents store MySQL ids as plain strings, and the API checks access in MySQL before reading Mongo.
- Alternative considered: MySQL only, with quizzes as JSON columns. Simpler operationally, but the AI service (Python) would also need MySQL access, and vector storage fits poorly.
