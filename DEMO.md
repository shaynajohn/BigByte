# BigByte — Demo Video

## Automated recording (Playwright)

Records a full happy-path demo to `demo/bigbyte-demo.webm` (1280×720).

**Terminal 1 — backend:**
```bash
python3 -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — frontend:**
```bash
npm --prefix frontend run dev
```

**Terminal 3 — record:**
```bash
cd e2e
npm install
npm run install-browser
npm run record-demo
```

Output:
- `demo/bigbyte-demo.webm` — 1080×1920 vertical mobile recording
- `demo/bigbyte-demo.mp4` — YouTube-friendly copy (when ffmpeg is installed)

Uses **iPhone 14 Pro Max** viewport with full 9:16 video (Playwright’s default scales down to ~800px and looks blurry).

---

## Manual recording script (~60 seconds)

Use this when recording yourself for LinkedIn, your resume site, or a portfolio embed.

## Setup (before you hit record)

1. Deploy is live on Render **or** run locally with backend + frontend.
2. Open two browser windows (or laptop + phone):
   - **Host:** your main screen
   - **Guest:** second window / phone in incognito
3. Have `OPENROUTESERVICE_API_KEY` set so commute times look real (optional but nicer).

## Shot list (~60 seconds)

| Time | Screen | Action | Say (optional voiceover) |
|------|--------|--------|--------------------------|
| 0–8s | Landing | Show BigByte landing | "BigByte helps groups pick where to eat in San Francisco — no accounts, no saved data." |
| 8–15s | Landing | Tap **Create group** | "Create a group in one tap." |
| 15–22s | Landing | Show join code, tell guest the code | "Share the code — friends type it in to join." |
| 22–30s | Guest device | Enter code on landing → **Join group** | "Everyone answers a short questionnaire — under two minutes." |
| 30–40s | Host | Quick-cut through commute → cuisine → budget → plan → vibe | "Commute, cravings, budget, and vibe." |
| 40–48s | Both on results | Show waiting screen updating live, then 3 picks appear | "Recommendations sync live. Three picks, not thirty." |
| 48–55s | Both | Vote Yes / Maybe / Pass — counts update on both screens | "Vote together in real time." |
| 55–60s | Host | Tap **Pick** → winner card with Maps | "Lock the winner and go." |

## Tips for a clean recording

- **Use real SF location** on commute step so results feel accurate.
- **Keep the group to 2 people** in the demo — waiting screen + live votes read clearly.
- **Hide the browser URL bar** on mobile (Add to Home Screen / full-screen).
- **No narration required** — on-screen flow alone works if you add 3–4 text captions in iMovie/CapCut.

## Export settings

- 1080×1920 (vertical) if posting to TikTok/Reels/LinkedIn mobile
- 1920×1080 (horizontal) if embedding on a portfolio site
- Keep it under 75 seconds — recruiters watch the first 15 seconds

## Where to host the video

- Upload to YouTube (unlisted) or Loom
- Link from README: `## Demo` → your URL
- Pin the link on your resume next to the BigByte project bullet
