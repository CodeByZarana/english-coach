# Speakwell — English Confidence Coach

Fix small, high-impact English mistakes instantly. Built for non-native speakers who already know English but want to sound more confident.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key
cp .env.example .env.local
# Edit .env.local and add your key from console.anthropic.com

# 3. Run the dev server
npm run dev
```

Open http://localhost:3000

## Features

- **Text correction** — paste or type any sentence, get a single focused correction
- **Speech input** — click "Speak" to dictate (uses browser Web Speech API, no extra service needed)
- **Category tagging** — grammar / phrasing / word choice / filler words
- **History** — last 10 corrections, click to revisit
- **Copy button** — one click to copy the corrected sentence

## Project structure

```
src/
  app/
    api/correct/route.ts   ← Anthropic API call + prompt
    page.tsx               ← Entry point
    layout.tsx             ← Fonts, metadata
    globals.css            ← Design tokens
  components/
    Coach.tsx              ← Main UI component
    Coach.module.css       ← Styles
```

## Extending to a browser extension (Stage 3)

The API route at `/api/correct` is already the core service. To build the extension:

1. Create a `extension/` folder with `manifest.json`, `content.js`, `popup.html`
2. In `content.js`, detect focus on `<textarea>` or `[contenteditable]` elements
3. Inject a small floating button next to the focused field
4. On click: grab the field value, POST to your deployed Next.js app's `/api/correct`, show the result in a small popover
5. Deploy the Next.js app to Vercel (free tier works) so the extension has a live endpoint

## Tweaking the prompt

The system prompt lives in `src/app/api/correct/route.ts`. This is where the product quality lives — experiment with it. Key things to try:

- Adjusting what counts as "one most important" correction
- Adding domain-specific rules (e.g. tech communication patterns)
- Changing the explanation tone
- Adding a confidence score

## Deployment

```bash
# Deploy to Vercel (recommended)
npx vercel

# Or build for self-hosting
npm run build
npm start
```

Add `ANTHROPIC_API_KEY` as an environment variable in your hosting platform.
