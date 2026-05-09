import { promises as fs } from 'fs';
import path from 'path';
import { getCharacterEmotionImagePath } from '../utils/characterImages';
import { fileResponse, jsonResponse } from '../utils/http';

export async function getCharacterImage(ctx: any): Promise<Response> {
  const character = ctx.params.character as string;
  const emotion = (ctx.params.emotion as string | undefined) ?? 'neutral';

  try {
    const imagePath = getCharacterEmotionImagePath(character, emotion);

    if (!imagePath) {
      return jsonResponse(404, {
        error: 'Character image not found',
        character,
        emotion
      });
    }

    // Check if file exists
    try {
      await fs.access(imagePath);
    } catch {
      return jsonResponse(404, {
        error: 'Character image file not found',
        character,
        emotion,
        path: imagePath
      });
    }

    // Read and serve the image
    const imageBuffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const contentType =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

    return fileResponse(200, imageBuffer, contentType);

  } catch (error) {
    console.error('Error serving character image:', error);
    return jsonResponse(500, {
      error: 'Internal server error',
      character,
      emotion
    });
  }
}

export async function listCharacterImages(): Promise<Response> {
  try {
    const imagePath = getCharacterEmotionImagePath('Peter'); // Just to get the directory
    if (!imagePath) {
      return jsonResponse(200, { characters: [] });
    }

    const dir = path.dirname(imagePath);

    try {
      const files = await fs.readdir(dir);
      const imageFiles = files.filter(file =>
        file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
      );

      return jsonResponse(200, {
        directory: dir,
        images: imageFiles
      });
    } catch {
      return jsonResponse(200, { characters: [] });
    }

  } catch (error) {
    console.error('Error listing character images:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
}