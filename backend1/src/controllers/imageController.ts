import type { HttpContext } from '../utils/http';
import { jsonResponse } from '../utils/http';
import type { HandlerResult } from '../utils/http';
import { imagegeneration } from '../service/assistants';
import fs from 'fs';
import path from 'path';

export async function generateImage(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const body = ctx.body as Record<string, unknown>;
    const prompt = body?.prompt;

    if (!prompt) {
      return jsonResponse(400, { error: 'Prompt is required' });
    }

    const result = await imagegeneration(String(prompt));

    const outputDir = path.join(process.cwd(), 'generated_images');
    fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = Date.now();
    const savedImages: string[] = [];
    const imageFiles = result.files?.filter((f) => f.mediaType?.startsWith('image/')) || [];

    for (const [index, file] of imageFiles.entries()) {
      const extension = file.mediaType?.split('/')[1] || 'png';
      const filename = `image-${timestamp}-${index}.${extension}`;
      const filepath = path.join(outputDir, filename);
      await fs.promises.writeFile(filepath, file.uint8Array);
      savedImages.push(`/generated_images/${filename}`);
      console.log(`Saved image to ${filepath}`);
    }

    return jsonResponse(200, {
      success: true,
      data: {
        text: result.text,
        images: savedImages,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      },
    });
  } catch (error) {
    console.error('Error generating image:', error);
    return jsonResponse(500, {
      error: 'Failed to generate image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
