/**
 * Demo data so the app is usable on first run. Safe to run many times (idempotent).
 *   educator@talented.dev / Password123
 *   student@talented.dev  / Password123
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { aiClient } from '../lib/aiClient';
import { logger } from '../lib/logger';

const PASSWORD = 'Password123';

const courses = [
  {
    title: 'JavaScript Fundamentals',
    description:
      'Variables, functions, arrays and asynchronous JavaScript explained from first principles, with small examples you can run in the browser console.',
    category: 'Programming',
    pricePaise: 0,
    lessons: [
      {
        title: 'Variables: let, const and var',
        content: `# Variables

Use **const** by default: the binding cannot be reassigned, which makes code easier to reason about.
Use **let** when a value must change, such as a loop counter.
Avoid **var**: it is function-scoped instead of block-scoped and is hoisted, which causes surprising bugs.

\`\`\`js
const name = 'Asha';   // cannot be reassigned
let count = 0;         // can change
count = count + 1;
\`\`\`

Note that const does not make objects immutable. \`const user = {}\` still lets you set \`user.age = 21\`; it only stops you from pointing \`user\` at a different object.`,
      },
      {
        title: 'Functions and arrow functions',
        content: `# Functions

A function declaration is hoisted, so it can be called before the line where it is written.
An arrow function is shorter and does not have its own \`this\`; it uses the \`this\` of the surrounding code.

\`\`\`js
function add(a, b) { return a + b; }
const square = (n) => n * n;
\`\`\`

Arrow functions are a good fit for callbacks such as \`array.map(x => x * 2)\`.
Use a regular function for object methods that need their own \`this\`.`,
      },
      {
        title: 'Promises and async/await',
        content: `# Asynchronous JavaScript

JavaScript runs on a single thread. Slow work such as network requests is handed to the runtime, and a **Promise** represents the value that will arrive later.
A promise is pending, then either fulfilled with a value or rejected with an error.

\`async\` functions always return a promise. Inside them, \`await\` pauses that function until the promise settles, without blocking the rest of the program.

\`\`\`js
async function loadUser(id) {
  try {
    const res = await fetch('/api/users/' + id);
    if (!res.ok) throw new Error('Request failed');
    return await res.json();
  } catch (err) {
    console.error(err);
  }
}
\`\`\`

To run independent requests at the same time, use \`Promise.all([a(), b()])\` instead of awaiting them one after another.`,
      },
    ],
  },
  {
    title: 'Building REST APIs with Node.js',
    description:
      'Design and build a production-style REST API with Express: routing, validation, authentication with JWT, error handling and testing.',
    category: 'Backend',
    pricePaise: 49900,
    lessons: [
      {
        title: 'HTTP methods and status codes',
        content: `# REST basics

Resources are nouns in the URL (\`/courses/42\`); the HTTP method is the verb.
GET reads, POST creates, PATCH updates part of a resource, PUT replaces it, DELETE removes it.

Status codes tell the client what happened: 200 OK, 201 Created, 204 No Content, 400 Bad Request for invalid input, 401 Unauthorized when not logged in, 403 Forbidden when logged in but not allowed, 404 Not Found, 409 Conflict for duplicates, and 500 for server bugs.`,
      },
      {
        title: 'Authentication with JWT',
        content: `# JWT authentication

A JSON Web Token is a signed string holding claims such as the user id and role. The server verifies the signature with its secret, so it does not need a database lookup on every request.

Keep access tokens short-lived, for example 15 minutes, and pair them with a refresh token stored in an HttpOnly cookie. Rotating the refresh token on every use lets the server detect a stolen token: if an already-used token comes back, revoke the whole session.`,
      },
    ],
  },
];

async function waitForAi(timeoutMs = 300_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${env.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const educator = await prisma.user.upsert({
    where: { email: 'educator@talented.dev' },
    create: { email: 'educator@talented.dev', name: 'Priya Educator', role: 'EDUCATOR', passwordHash },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: 'student@talented.dev' },
    create: { email: 'student@talented.dev', name: 'Arun Student', role: 'STUDENT', passwordHash },
    update: {},
  });

  const existing = await prisma.course.count({ where: { educatorId: educator.id } });
  if (existing > 0) {
    logger.info('Seed: demo data already present');
    return;
  }

  const created = [];
  for (const c of courses) {
    const course = await prisma.course.create({
      data: {
        educatorId: educator.id,
        title: c.title,
        description: c.description,
        category: c.category,
        pricePaise: c.pricePaise,
        published: true,
        lessons: { create: c.lessons.map((l, i) => ({ ...l, position: i })) },
      },
      include: { lessons: true },
    });
    created.push(course);
  }
  logger.info('Seed: users and courses created');

  if (!(await waitForAi())) {
    logger.warn('Seed: AI service not reachable, lessons not indexed (re-save a lesson to index it)');
    return;
  }
  for (const course of created) {
    for (const l of course.lessons) {
      await aiClient.indexLesson({ courseId: course.id, lessonId: l.id, title: l.title, content: l.content });
    }
  }
  logger.info('Seed: lessons indexed for the AI tutor');
}

main()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
