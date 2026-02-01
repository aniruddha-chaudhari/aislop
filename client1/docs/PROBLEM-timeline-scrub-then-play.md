# Problem: Scrubbing Timeline Then Clicking Play Starts Video at 0 Instead of Scrubbed Position

**Status: Fixed (working)**

---

## Observed behavior (before fix)

1. User scrubs the timeline (clicks ruler, drags playhead, or clicks lane) to a non-zero time (e.g. 30s).
2. User clicks Play.
3. **Expected:** Preview video starts playing from the scrubbed position (e.g. 30s).
4. **Actual:** Preview video started at 0 (or jumped to 0 and played from there).

So "play from current timeline position" did not work after scrubbing.

---

## Root causes (summary)

1. **Frontend:** Two writers to `playheadTime` — timeline (scrub) and video (`onTimeUpdate`). When paused, `onTimeUpdate` could overwrite the scrubbed position with the video’s current time (e.g. 0). Also, `play()` was called immediately after setting `video.currentTime`; seeking is async, so playback could start from 0 before the seek completed.
2. **Backend:** The preview video endpoint (`GET /api/project/:id/preview`) did not support **Range** requests. It always returned 200 with the full file. Browsers need 206 Partial Content for seeking; without it, the video element could not seek correctly and would reset to 0.

---

## Fixes applied

### Frontend (CanvasPreview.tsx, EditorLayout.tsx)

- **Single source of truth when paused:** `onTimeUpdate` only calls `onPlayheadChange(video.currentTime)` when **playing**. When paused, the timeline is the source of truth; the sync effect sets `video.currentTime = playheadTime`.
- **`lastIntendedPlayheadRef`:** Tracks the intended position (from scrubbing or `requestPlay`) so `applyPlay` and sync use it instead of stale `playheadTime`.
- **Wait for `seeked` before `play()`:** In `requestPlay` and `applyPlay`, we set `video.currentTime` then wait for the `seeked` event (with a 2s timeout) before calling `play()`. That prevents playback from starting at 0 before the seek completes.
- **EditorLayout:** Only treat as “at end” when `draftProject.duration > 0` and `playheadTime >= duration`, so we don’t reset to 0 when duration is 0 or unset. Only block play when there’s no template (allow template-only play from timeline).

### Backend (projectController.ts)

- **Range support for preview:** `serveProjectPreview` now:
  - Reads the `Range` header from `ctx.headers`.
  - If no range: returns 200 with full file and `Accept-Ranges: bytes`.
  - If range: parses it, validates (returns 416 if not satisfiable), reads only that byte range, and returns **206 Partial Content** with `Content-Range` and `Accept-Ranges: bytes`.

So the browser can request byte ranges for the preview video and the backend responds with 206, enabling seeking.

---

## Result

Scrub-then-play works: user scrubs to a position, clicks Play, and the preview (template or generated) starts playing from that position.

---

## Debug logs (optional)

If you need to verify or debug again:

- **`[EditorLayout] handlePlayToggle (play)`** – `playheadTime`, `duration`, `atEnd`, `seekTo`.
- **`[CanvasPreview] requestPlay`** – `seekToSeconds`, `playheadTime`, `used`, `videoCurrentTimeBefore`, `readyState`, `seekable`.
- **`[CanvasPreview] timeline→video sync`** – when the sync effect applies timeline position to video (paused).
- **`[CanvasPreview] onSeeked`** – `videoCurrentTime`, `intended`, `diffFromIntended`, `wasSyncingFromTimeline`.
