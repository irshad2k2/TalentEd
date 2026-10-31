# ADR 0002: GraphQL for reads, REST for writes

**Status:** Accepted

## Context
Catalog, course and "my learning" pages each need a different slice of course data (card fields, lesson list, progress). Writes include file uploads, payment webhooks and actions with clear HTTP semantics.

## Decision
- **GraphQL** (`/graphql`, Apollo Server) for read-only queries: `courses` (cursor-paginated), `course`, `categories`, `myEnrollments`, `myCourses`. Each page requests exactly the fields it renders, in one round trip. DataLoader batches per-course lookups to avoid N+1 queries.
- **REST** (`/api/...`) for every command: signup/login, create/update/delete, enroll, checkout, upload presign/complete, quiz submit, AI ask. Status codes (201, 402, 404, 409) carry meaning, webhooks are plain HTTP, and rate limits are per route.

## Consequences
- Two API styles to learn, but each is used where it is strongest.
- Both share the same auth (Bearer access token) and the same Prisma data layer.
