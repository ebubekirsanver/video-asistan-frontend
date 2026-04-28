# video-asistan

Single-folder project with frontend HTML pages and a Node backend.

## Structure
- Frontend: `*.html` in the root folder
- Backend: `backend/`

## Backend (Node)
1) `cd backend`
2) `npm install`
3) Set env var `FAL_KEY`
4) Optional: set `OPENROUTER_MODEL` (default: `google/gemini-2.5-flash`)
5) Optional: set `LOG_PAYLOAD=true` and `LOG_PAYLOAD_TRUNCATE=0` to log full prompts
6) `npm start`

The API listens on http://127.0.0.1:8010 by default.

## Frontend
Open `islem.html` in a browser.
- `islem.html` calls `/api/analyze` on port 8010.
- `code.html` calls `/api/history` on port 8010.

## Notes
- `yt-dlp` must be available (PATH or Python module) for transcript fetch.
- Optional cookies file: `backend/cookies.txt`.
