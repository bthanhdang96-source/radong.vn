# nongsanvn

## GitHub sync

This repository is configured to publish committed changes to `https://github.com/bthanhdang96-source/radong.vn`.

- The git hook at `.beads/hooks/post-commit` pushes automatically after every successful commit.
- Run `npm run sync:github -- \"feat: your message\"` to stage all changes, create a commit, and push manually.
- Set `AUTO_PUSH_ON_COMMIT=0` if you need to skip the auto-push hook for a specific shell session.
- Make sure `git config user.name` and `git config user.email` are set before the first commit.

## Supabase

This repo now uses Supabase CLI migrations under [supabase](./supabase).

- `npm run supabase:start` starts the local Supabase stack.
- `npm run supabase:reset` reapplies migrations and seed locally.
- `npm run supabase:push` pushes committed migrations to the linked project.

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL` for the queue/worker path
- `INGESTION_INLINE_PROCESSING=true|false` to choose inline queue draining vs external worker
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for ingestion alerts

Runtime behavior:

- If `SUPABASE_SERVICE_ROLE_KEY` is present, the server ingests VN/world data into Supabase and reads curated views.
- If only public keys are present, the app falls back to legacy file-cache services until the remote schema is applied and the service role key is added.
- If `REDIS_URL` is present, VN crawler refreshes enqueue raw price messages to `price:raw`; run `npm --prefix server run worker` for a dedicated worker, or keep `INGESTION_INLINE_PROCESSING=true` to drain the queue inside the API process.
- Run `npm --prefix server run monitor` to execute the ingestion health check and optional Telegram alerting.

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
