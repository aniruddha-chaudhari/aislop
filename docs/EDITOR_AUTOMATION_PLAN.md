# Editor automation: Subtitles, images, characters

## How it works now

### Automated (Generate AI Draft)

When you click **Generate AI Draft** in the timeline:

1. **Subtitles** – Backend uses WhisperX on each dialogue’s audio → sentence-level timestamps. Builds **subtitle clips** (speaker, text, start, duration). Export burns them into the video via ASS.
2. **Image overlays** – Backend runs the **image embedder** (clean timestamps + topic) → **image plan** with requirements (title, timestamp, duration, etc.). Plan is turned into **overlay clips** (assetId, start, duration, position). Export overlays images from `storage/images/{sessionId}/` by `assetId`.  
   - **Gap**: Plan images can live elsewhere (`imagePath`). We now support an optional **path** on overlay clips so the compiler uses the actual file when set.
3. **Character clips** – Backend infers **character clips** from dialogues (speaker, timing, position). Same WhisperX timing as subtitles.  
   - **Gap**: Export **did not** overlay character images. We now add **character image overlays** in the timeline compiler using `character_images/` (Stewie, Peter, etc.), same as the old video generator.

### Manual (your workflow)

- **Timeline**: Move/trim clips, adjust order.
- **Overlay images**: Upload per clip (project upload-image) or pick from plan. “Images” sidebar tab: manage assets, assign to overlay clips.
- **Characters**: “Chars” sidebar tab: choose character → image, adjust position/scale. Character clips already have x, y, scale.
- **Subtitles**: Edit text or timing in timeline; optionally style per speaker (e.g. Stewie / Peter colors) in ASS.

### Old vs new

| Feature | Old (video generator) | New (editor + export) |
|--------|------------------------|------------------------|
| Subtitles | One-shot ASS from WhisperX | AI Draft → subtitle clips → ASS on export |
| Images | Image plan → upload → one-shot video | AI Draft → overlay clips → optional upload per clip → export |
| Characters | Stewie/Peter from `character_images/` overlaid by speaking windows | AI Draft → character clips → **export now overlays** char images from `character_images/` |

## What we implemented

1. **Character overlays in export** – Timeline compiler resolves character name → image path (`character_images/`), adds FFmpeg inputs, and overlays each character clip with correct timing and position (x, y, scale).
2. **Overlay image paths** – OverlayClip supports optional `path`. AI Draft sets it from the image plan when available. Compiler uses `path` if present, otherwise `storage/images/{sessionId}/{assetId}.png`.

## What you need

- **Character images** – Same as before: `Stewie_Griffin.png` and `peter.png` in a `character_images` folder. The compiler looks in:
  - `{cwd}/src/character_images`
  - `{cwd}/character_images`
  - `backend/character_images` (relative to compiled code)
  Export uses these for character overlays when you have character clips (Stewie / Peter).
- **Overlay images** – Either:
  - **AI Draft**: Plan stores `imagePath`; we pass it through to overlay clips so export uses those files.
  - **Manual**: Upload via project “upload image” for a clip; stored under `storage/images/{sessionId}/` and referenced by `assetId`.

## Next steps (optional)

- **Speaker-based subtitle styles** – Use different ASS styles (e.g. Stewie yellow, Peter blue) when generating ASS from subtitle clips.
- **“Images” / “Chars” sidebar** – Implement full UI: list assets, assign to overlay clips, pick character image per character clip, adjust position/scale in properties panel.
