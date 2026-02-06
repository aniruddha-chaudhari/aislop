# Audio: Background Music + SFX (Timeline-Based Plan)

This doc captures two “timeline-first” options for adding **background music** and **audio FX** to the editor, plus the recommended starting points.

---

## Option B — Dedicated **Music** timeline track

### What it is
Add a new track type, for example:

- `type: 'music'`

and a new clip kind:

- `kind: 'music'`

Each music clip represents a segment of background music placed on the timeline.

### Suggested clip shape

- `id`: string
- `kind`: `'music'`
- `path`: string (local path / stored asset path)
- `start`: number (seconds on the timeline)
- `duration`: number (seconds)
- `volume`: number (e.g. 0.0–1.0, or dB if you prefer)

### Why it’s good

- **More flexible**: multiple segments, different songs, fades/ramps later, easy to layer.
- **Editor-friendly**: users can trim/move music like any other clip.

### Trade-offs

- **More work**: requires editor UI support (track lane, clip rendering/drag/trim), persistence, validation, and export/preview mixing logic.

### Recommendation
This is a great long-term model, but the **suggested starting point is still project-level background music (Option A)** because it’s faster to ship. You can migrate to a `music` track later without changing the mixing fundamentals.

---

## Option B — Dedicated **SFX** timeline track

### What it is
Add a new track type, for example:

- `type: 'sfx'`

and a new clip kind:

- `kind: 'sfx'`

Each SFX clip is a sound placed at a specific time (whoosh, click, pop, riser, etc.).

### Suggested clip shape

- `id`: string
- `kind`: `'sfx'`
- `path`: string (local path / stored asset path)
- `start`: number (seconds on the timeline)
- `duration?`: number (optional; can be derived from file length)
- `volume?`: number (optional)

### Why it’s good

- **Arbitrary SFX anywhere**: not tied to overlays/transitions; users can place sounds wherever needed.
- **Editor-native workflow**: drag/drop and align with visuals and subtitles.

### Trade-offs

- Requires timeline UI + data model support.
- Requires export/preview audio graph to handle multiple short inputs at different timestamps.

### Recommendation
If your main use case is “play a sound when this image/video appears,” the **suggested starting point is per-clip FX (Option A)** (e.g. an overlay clip has `audioFxId` / `audioFxPath` and it triggers at `clip.start`).

Add a dedicated `sfx` track later for:

- one-off sounds not tied to a single visual clip
- layered SFX design
- more advanced control (volume automation, fades, etc.)

---

## Quick summary (what to start with vs what to add later)

- **Start with**
  - **Project-level background music (Option A)** for fastest shipping.
  - **Per-clip FX (Option A)** if SFX are mostly tied to a visual clip appearing / transitioning.

- **Add later (timeline-first)**
  - `music` track (`type: 'music'`, `kind: 'music'`) for multiple songs/segments.
  - `sfx` track (`type: 'sfx'`, `kind: 'sfx'`) for arbitrary/independent sound placement.

