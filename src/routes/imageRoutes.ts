import { Router, type IRouter } from 'express';
import { imagegeneration } from '../service/assistants';
import fs from 'node:fs';
import path from 'node:path';

const router: IRouter = Router();

// POST /api/image/generate
router.post('/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await imagegeneration(prompt);

    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'generated_images');
    fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = Date.now();
    const savedImages: string[] = [];

    // Save generated images to local filesystem
    const imageFiles = result.files?.filter((f) => f.mediaType?.startsWith('image/')) || [];

    for (const [index, file] of imageFiles.entries()) {
      const extension = file.mediaType?.split('/')[1] || 'png';
      const filename = `image-${timestamp}-${index}.${extension}`;
      const filepath = path.join(outputDir, filename);

      await fs.promises.writeFile(filepath, file.uint8Array);
      savedImages.push(`/generated_images/${filename}`);
      console.log(`Saved image to ${filepath}`);
    }

    res.json({
      success: true,
      data: {
        text: result.text,
        images: savedImages,
        usage: result.usage,
        providerMetadata: result.providerMetadata
      }
    });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({
      error: 'Failed to generate image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
