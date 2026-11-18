import { z } from 'zod';
import { queueIngestion } from '../services/ingestionService.js';
import { BadRequestError } from '../utils/errors.js';

const ingestSchema = z.object({
  source_type: z.enum(['note', 'url']).optional(),
  sourceType: z.enum(['note', 'url']).optional(),
  content: z.string().optional(),
  url: z.string().url().optional(),
  title: z.string().max(200).optional(),
}).refine(
  (data) => data.source_type || data.sourceType,
  { message: 'source_type must be either "note" or "url"' }
).refine(
  (data) => {
    const type = data.source_type || data.sourceType;
    if (type === 'note') return typeof data.content === 'string' && data.content.trim().length > 0;
    if (type === 'url') return typeof data.url === 'string' && data.url.trim().length > 0;
    return false;
  },
  { message: 'Note requires non-empty "content"; URL requires valid "url"' }
);

export async function handleIngest(req, res, next) {
  try {
    const validated = ingestSchema.parse(req.body);
    const sourceType = validated.source_type || validated.sourceType;

    const item = await queueIngestion({
      sourceType,
      content: validated.content,
      url: validated.url,
      title: validated.title,
    });

    return res.status(202).json({
      success: true,
      data: item,
    });
  } catch (err) {
    next(err);
  }
}
