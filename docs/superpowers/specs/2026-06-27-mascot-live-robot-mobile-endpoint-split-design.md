# Mascot live robot/mobile endpoint split

- Date: 2026-06-27
- Repo: `D:\Study\SP26\EXE101\MVP\Mascoteach-AI-Service`
- Status: Draft approved in chat, pending file review

## Context

The current mascot live session flow uses one shared runtime config for all clients:

- Config source: `D:\Study\SP26\EXE101\MVP\Mascoteach-AI-Service\src\config\mascot-live.config.ts`
- Default live routes: `D:\Study\SP26\EXE101\MVP\Mascoteach-AI-Service\src\routes\mascot-live.routes.ts`
- Live controller: `D:\Study\SP26\EXE101\MVP\Mascoteach-AI-Service\src\controllers\mascot-live.controller.ts`
- Route mounting: `D:\Study\SP26\EXE101\MVP\Mascoteach-AI-Service\src\app.ts`
- Mobile caller: `D:\Study\SP26\EXE101\MVP\Mobile\lib\data\api\mascot_live_api.dart`

The current live profile has been tuned for the robot/ESP speaker path and works well there, but the same profile sounds choppy on normal mobile use.

## Problem statement

One live endpoint currently serves both:

1. normal mobile realtime voice sessions
2. robot-oriented realtime voice sessions

This couples two clients with different audio constraints to one shared audio tuning profile.

## Goals

1. Keep the existing mobile/default endpoint stable for app clients.
2. Add a dedicated robot endpoint.
3. Preserve the current robot-tuned audio settings for the new robot endpoint.
4. Keep mobile AI-side behavior unchanged.
5. Split only audio-facing config between mobile and robot.
6. Fix mobile voice quality through backend changes only, without requiring a mobile app rebuild or Google Play redeploy.

## Non-goals

1. No change to chat/text endpoints.
2. No change to quota, auth, TTL, prompt, or subscription logic unless required by routing.
3. No change to the mobile app endpoint path in this task.
4. No move to a separate service or deployment.
5. No mobile client code change that would require shipping a new app build for this fix.

## Approved decisions

### API boundary

Keep the existing mobile/default API unchanged:

- `POST /api/v1/mascot-live/session`
- `GET /api/v1/mascot-live/session/:sessionId`
- `POST /api/v1/mascot-live/session/:sessionId/end`

Add a dedicated robot API:

- `POST /api/v1/mascobot/live/session`
- `GET /api/v1/mascobot/live/session/:sessionId`
- `POST /api/v1/mascobot/live/session/:sessionId/end`
- optional but recommended: `GET /api/v1/mascobot/live/health`

### Config split

The current config should become the initial **robot audio profile**.

The existing mobile/default endpoint should switch to a **normal/mobile audio profile**.

The split is intentionally limited to audio-facing settings:

- `botAudioSampleRateHz`
- `vadPrefixPaddingMs`
- `vadSilenceDurationMs`
- `vadThreshold`

The following AI-side settings must remain the same for mobile and robot unless explicitly changed later:

- `realtimeModel`
- `reasoningEffort`
- `maxOutputTokens`
- `systemPrompt`
- `defaultLanguage`
- `inputTranscriptionModel`
- `sessionTtlSeconds`
- `freemiumDailyLimitSeconds`
- `quotaTimeZone`
- auth and readiness wiring

### Service shape

Use one shared live service implementation with profile-specific runtime config injection.

Do not fork the entire service unless a later constraint proves that necessary.

## Proposed implementation

### 1. Config model

Refactor the live config module so it can resolve:

- shared/base realtime config
- mobile/default audio overrides
- robot audio overrides

Recommended shape:

- one helper for shared/base config
- one helper for `default/mobile` runtime config
- one helper for `robot` runtime config

The robot runtime config should preserve the current audio values exactly as they exist today.

The mobile/default runtime config should keep the same non-audio values while using new normal/mobile audio values.

### 2. Controller and route wiring

Keep the existing mascot live controller behavior for mobile/default clients.

Add robot-specific route/controller wiring under the mascobot namespace. This can be done either by:

- creating a dedicated robot live controller that instantiates the shared service with the robot config, or
- creating a small controller factory that receives a runtime config and returns the route handlers

Preferred implementation: small controller factory or helper to avoid copy-paste between mobile and robot handlers.

### 3. Route mounting

In `src\app.ts`:

- keep `app.use('/api/v1/mascot-live', mascotLiveRoutes);`
- add `app.use('/api/v1/mascobot/live', mascobotLiveRoutes);`

This keeps the mobile contract unchanged and makes robot usage explicit.

### 4. Mobile behavior

No mobile API path change is required in this task.

`D:\Study\SP26\EXE101\MVP\Mobile\lib\core\constants\api_constants.dart` should continue using:

- `/api/v1/mascot-live/health`
- `/api/v1/mascot-live/session`

The mobile app benefits automatically once the backend default/mobile profile stops inheriting robot audio tuning.

This fix must remain backend-only for mobile consumers so the improvement can be deployed without rebuilding or re-uploading the mobile app.

## Data and contract impact

The response contract for session creation, session fetch, and session end should remain unchanged for both clients.

The only intended runtime difference is the resolved audio config inside the created session and the upstream OpenAI realtime session configuration.

If readiness endpoints are split, both should return the same contract shape as current readiness responses.

## Testing strategy

### Config tests

Add tests that prove:

1. default/mobile and robot configs share the same AI-side settings
2. robot config preserves the current audio values
3. mobile/default config uses different audio values

### Route/controller tests

Add or extend tests that prove:

1. `POST /api/v1/mascot-live/session` resolves the mobile/default profile
2. `POST /api/v1/mascobot/live/session` resolves the robot profile
3. both endpoints return the same response shape

### Regression focus

Verify that:

1. existing mobile consumers require no code change
2. existing robot flow can switch to the new endpoint without losing current tuning
3. auth, quota, and session ownership behavior remain unchanged

## Rollout plan

1. Introduce backend profile split and robot endpoint.
2. Keep mobile app on the existing endpoint.
3. Update robot caller(s) to use `/api/v1/mascobot/live/*`.
4. Validate robot behavior remains unchanged.
5. Validate mobile voice quality against the new default/mobile audio profile.
6. Deploy backend changes only for the mobile fix path; no mobile app release should be required for this change to take effect.

## Risks

1. Accidentally changing non-audio settings while refactoring config.
2. Duplicating controller logic and creating drift between mobile and robot behavior.
3. Adding the new route but forgetting to repoint the robot caller.

## Mitigations

1. Separate tests for shared AI config vs audio-only differences.
2. Prefer controller/service reuse over full copy.
3. Verify route mount and robot caller path in the same implementation pass.

## Success criteria

1. Mobile keeps using `/api/v1/mascot-live/*`.
2. Robot uses `/api/v1/mascobot/live/*`.
3. Robot preserves current live audio behavior.
4. Mobile no longer inherits robot-specific audio tuning.
5. AI-side config remains aligned across both profiles.
6. Mobile users receive the fix after backend deployment, without a new app build or Google Play update.
