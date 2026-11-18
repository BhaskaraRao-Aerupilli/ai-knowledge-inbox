import { itemRepository } from '../db/repositories/itemRepository.js';
import { chunkRepository } from '../db/repositories/chunkRepository.js';
import { NotFoundError } from '../utils/errors.js';

export async function handleListItems(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const items = itemRepository.list({ limit, offset });
    const hasMore = items.length === limit;

    return res.status(200).json({
      success: true,
      data: items,
      meta: {
        limit,
        offset,
        count: items.length,
        hasMore,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetItem(req, res, next) {
  try {
    const { id } = req.params;
    const item = itemRepository.findById(id);
    if (!item) {
      throw new NotFoundError(`Item with ID "${id}" was not found.`);
    }

    const chunks = chunkRepository.findByItemId(id).map((c) => ({
      id: c.id,
      chunkIndex: c.chunk_index,
      chunkText: c.chunk_text,
      createdAt: c.created_at,
    }));

    return res.status(200).json({
      success: true,
      data: {
        ...item,
        chunks,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteItem(req, res, next) {
  try {
    const { id } = req.params;
    const item = itemRepository.findById(id);
    if (!item) {
      throw new NotFoundError(`Item with ID "${id}" was not found.`);
    }

    itemRepository.delete(id);

    return res.status(200).json({
      success: true,
      data: {
        id,
        deleted: true,
      },
    });
  } catch (err) {
    next(err);
  }
}
