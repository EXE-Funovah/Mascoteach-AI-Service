# Style and conventions
- TypeScript CommonJS project.
- Use layer separation: route declarations call controllers; controllers orchestrate services; service modules own external integration/business logic.
- Use camelCase for variables/functions, PascalCase for classes/interfaces, and kebab/dot-style file names such as `mascot-live.routes.ts`, `mcq.route.ts`.
- Keep request/response handling in controllers and return JSON envelopes with `success`, `data`, and/or `message` where applicable.
- Preserve backward compatibility for legacy MCQ upload route when extending backend-oriented AI APIs.
- Existing comments are a VN/EN mix; technical identifiers remain English.
- Validate environment readiness through config helpers rather than assuming credentials exist.