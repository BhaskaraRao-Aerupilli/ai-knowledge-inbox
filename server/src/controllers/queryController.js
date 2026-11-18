import { z } from 'zod';
import { executeQuery } from '../services/queryService.js';

const querySchema = z.object({
  question: z.string({
    required_error: 'Question is required',
    invalid_type_error: 'Question must be a string',
  }).min(1, 'Question must not be empty').max(1000, 'Question exceeds maximum length'),
});

export async function handleQuery(req, res, next) {
  try {
    const validated = querySchema.parse(req.body);
    const result = await executeQuery(validated.question);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
