# AI Object Rotator

Generate multi-view perspectives of objects using Google Gemini models.

## Local Development Setup

To run this app locally, you need to configure your API key so it is accessible to the browser as `process.env.API_KEY`.

### 1. Get an API Key
Obtain a Gemini API key from [Google AI Studio](https://aistudio.google.com/).

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
API_KEY=your_actual_api_key_here
```

### 3. Bundler Configuration (Critical Step)

By default, bundlers do not expose arbitrary `.env` variables to the client. You must configure this based on your tool:

#### If using Vite (Recommended)
You need to explicitly define the global variable in `vite.config.ts` (or `.js`):

```javascript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})
```

#### If using Create React App (CRA) / Webpack
CRA only exposes variables starting with `REACT_APP_`. Since this app requires `process.env.API_KEY` (per Google SDK guidelines), you might need to use a library like `react-app-rewired` or simply hardcode it temporarily for testing (not recommended for production).

Alternatively, if you can change the build setup, use `dotenv-webpack` to expose `API_KEY`.

### 4. Run the App
Restart your development server after changing configuration files:
```bash
npm run dev
# or
npm start
```

## Troubleshooting

- **Error: "API_KEY environment variable is not set"**
  - Ensure `.env` exists in the project root.
  - Ensure you restarted the dev server.
  - Check your bundler config (step 3 above) to ensure `process.env.API_KEY` is being replaced with the actual string value during build.
