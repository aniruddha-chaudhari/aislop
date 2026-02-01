import { z } from 'zod';

/**
 * Clip schemas - discriminated by kind/type
 */
export const AudioClipSchema = z.object({
  id: z.string(),
  kind: z.literal('audio'),
  start: z.number(),
  duration: z.number(),
  label: z.string(),
});

export const WordTimestampSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export const SubtitleClipSchema = z.object({
  id: z.string(),
  kind: z.literal('subtitle'),
  start: z.number(),
  duration: z.number(),
  speaker: z.string(),
  text: z.string(),
  words: z.array(WordTimestampSchema).optional(), // Word-level for karaoke
});

export const OverlayClipSchema = z.object({
  id: z.string(),
  kind: z.literal('overlay'),
  start: z.number(),
  duration: z.number(),
  assetId: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  scale: z.number(),
  path: z.string().optional(),
});

export const CharacterClipSchema = z.object({
  id: z.string(),
  kind: z.literal('character'),
  start: z.number(),
  duration: z.number(),
  character: z.string(),
  x: z.number(),
  y: z.number(),
  scale: z.number(),
});

export const ClipSchema = z.discriminatedUnion('kind', [
  AudioClipSchema,
  SubtitleClipSchema,
  OverlayClipSchema,
  CharacterClipSchema,
]);

/**
 * Track schema
 */
export const TrackSchema = z.object({
  id: z.string(),
  type: z.enum(['audio', 'subtitle', 'overlay', 'character']),
  name: z.string(),
  clips: z.array(ClipSchema),
  locked: z.boolean().optional(),
  muted: z.boolean().optional(),
  /** When true, track was auto-created (e.g. drag clip over another); empty ones can be auto-removed. User-added tracks omit this. */
  isAutoCreated: z.boolean().optional(),
});

/**
 * Timeline schema
 */
export const TimelineSchema = z.object({
  duration: z.number(),
  tracks: z.array(TrackSchema),
});

/**
 * Project schema
 */
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  format: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  template: z.object({
    type: z.enum(['video', 'image']),
    label: z.string(),
    path: z.string(),
    posterSrc: z.string().optional(),
  }),
  audioSessionId: z.string(),
  timeline: TimelineSchema,
  status: z.enum(['draft', 'ready', 'exporting', 'exported']).default('draft'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Type exports
 */
export type WordTimestamp = z.infer<typeof WordTimestampSchema>;
export type AudioClip = z.infer<typeof AudioClipSchema>;
export type SubtitleClip = z.infer<typeof SubtitleClipSchema>;
export type OverlayClip = z.infer<typeof OverlayClipSchema>;
export type CharacterClip = z.infer<typeof CharacterClipSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
export type Project = z.infer<typeof ProjectSchema>;

/**
 * Partial schemas for updates
 */
export const UpdateTimelineSchema = TimelineSchema.partial();
export const UpdateProjectSchema = ProjectSchema.partial().omit({ id: true });
