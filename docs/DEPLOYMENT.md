# Deploying TalentEd for free

Every piece below has a free tier that needs no credit card.

| Part | Host | Free tier |
|---|---|---|
| Web (React) | Vercel | Hobby plan |
| API (Node) | Render | Free web service (sleeps after 15 min idle) |
| AI (FastAPI) | Render | Free web service |
| MySQL | TiDB Cloud Serverless | 5 GB |
| MongoDB | MongoDB Atlas M0 | 512 MB |
| Video storage | Supabase Storage (S3 API) | 1 GB |
| LLM | Groq | Free API key |

```
Browser ──> Vercel (talented.vercel.app)
              ├── static React app
              └── /api/*, /graphql ──rewrite──> Render: talented-api ──> TiDB, Atlas, Supabase
                                                        └──> Render: talented-ai ──> Atlas, Groq
```

The web app calls the API **through Vercel rewrites** (see `apps/web/vercel.json`), so the browser
only ever talks to one origin. That keeps the `SameSite=Lax` refresh cookie first-party; calling
`onrender.com` directly from `vercel.app` would log users out on every page reload.

## 1. Databases and storage

1. **TiDB Cloud** (tidbcloud.com) → create a Serverless cluster (region: Singapore/Mumbai) → Connect → Prisma.
   Copy the URL and add `?sslaccept=strict` if it isn't there:
   `mysql://<user>.root:<pass>@gateway01.<region>.prod.aws.tidbcloud.com:4000/talented?sslaccept=strict`
   Create the database first: `CREATE DATABASE talented;` in the SQL editor.
2. **MongoDB Atlas** (mongodb.com/atlas) → create a free M0 cluster → Database Access: add a user →
   Network Access: allow `0.0.0.0/0` (Render free has no fixed IP) → Connect → Drivers. Put
   `/talented` before the `?`: `mongodb+srv://<user>:<pass>@cluster0.xxxx.mongodb.net/talented?retryWrites=true&w=majority`
3. **Supabase** (supabase.com) → new project → Storage → create bucket `talented-videos` →
   Project Settings → Storage → S3 Connection: copy endpoint, region and create an access key pair.
4. **Groq** (console.groq.com) → API Keys → create a key. (Optional: without it the tutor gives extractive answers.)

## 2. API and AI on Render

1. render.com → New → **Blueprint** → pick this repo. Render reads `render.yaml` and creates
   `talented-api` and `talented-ai`.
2. Fill in the variables it asks for:

| Variable | Value |
|---|---|
| `INTERNAL_API_KEY` (both services) | same random string, e.g. `openssl rand -hex 24` |
| `MONGO_URL` (both) | Atlas URL |
| `DATABASE_URL` | TiDB URL |
| `PUBLIC_URL` | your Vercel URL, e.g. `https://talented.vercel.app` (set after step 3, then redeploy) |
| `AI_SERVICE_URL` | `https://talented-ai.onrender.com` |
| `S3_ENDPOINT` / `S3_PUBLIC_ENDPOINT` | Supabase S3 endpoint (`https://<ref>.supabase.co/storage/v1/s3`) |
| `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | from Supabase |
| `LLM_API_KEY` | Groq key |
| `RAZORPAY_*` | test-mode keys, or leave empty |

The API container runs `prisma migrate deploy` and seeds demo data on start.
If your service names differ from `talented-api` / `talented-ai`, update the URLs in
`apps/web/vercel.json` and `AI_SERVICE_URL`.

## 3. Web on Vercel

1. vercel.com → Add New → Project → import this repo.
2. **Root Directory:** `apps/web` (Vercel picks up `vercel.json` and installs the npm workspace).
3. Environment variables:
   - `VITE_API_URL` = the Vercel URL itself, e.g. `https://talented.vercel.app` (same origin, goes through the rewrites)
   - `VITE_RAZORPAY_KEY_ID` = Razorpay test key id (optional)
4. Deploy, then put the final URL into `PUBLIC_URL` on Render and redeploy the API.

## Known free-tier limits

- **Cold starts:** Render free services sleep after 15 minutes. The first request takes ~30-60 s
  (the AI service is slower because it loads the embedding model). Open the site a minute before a demo.
- **Memory:** both Render services get 512 MB. The AI service uses the small `bge-small` ONNX model to fit.
- **Storage:** Supabase free is 1 GB, so keep demo videos short.
