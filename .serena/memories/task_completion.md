# Task completion checklist
1. Inspect relevant route/controller/service contracts before edits.
2. Make the smallest complete runnable diff.
3. Run `npm run build` for TypeScript validation.
4. Run `npm test` for configured Node tests.
5. If live mascot behavior changed, manually verify `/api/v1/mascot-live/health`, session lifecycle endpoints, and `/ws/mascot-live` message protocol as relevant.
6. If quiz generation changed, verify both legacy multipart `/api/v1/mcq/generate` and backend URL-based `/api/v1/ai/generate-for-backend` paths as relevant.
7. Check `git status --short --branch` and summarize touched files and validation evidence.
No configured lint/format scripts were present during onboarding.