# Suggested Windows PowerShell commands
- Install: `npm install`
- Run dev server: `npm run dev`
- Compile TypeScript: `npm run build`
- Run compiled server: `npm start`
- Run configured Node tests: `npm test`
- Git status: `git status --short --branch`
- List files: `Get-ChildItem -Force`
- Search text: `rg '<pattern>' src tests`
- Read bounded file content: `& "$HOME\.codex\scripts\ai-read.ps1" -Path '<path>' -MaxReadBytes 12000`
Notes:
- No lint or format script was declared in `package.json` during onboarding.
- Default port in `src/app.ts` is `5001` unless `PORT` is set.