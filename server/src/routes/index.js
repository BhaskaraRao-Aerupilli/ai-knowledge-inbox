import { Router } from 'express';
import { handleIngest } from '../controllers/ingestController.js';
import { handleListItems, handleGetItem, handleDeleteItem } from '../controllers/itemController.js';
import { handleQuery } from '../controllers/queryController.js';
import { ingestLimiter, queryLimiter } from '../middleware/rateLimiter.js';
import { config } from '../config/index.js';
import { EMBEDDING_MODEL_NAME } from '../services/embeddingService.js';

const router = Router();

// Ingestion endpoint (202 Accepted)
router.post('/ingest', ingestLimiter, handleIngest);

// Items management endpoints
router.get('/items', handleListItems);
router.get('/items/:id', handleGetItem);
router.delete('/items/:id', handleDeleteItem);

// RAG query endpoint
router.post('/query', queryLimiter, handleQuery);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      models: {
        llm: config.GROQ_MODEL,
        embeddings: EMBEDDING_MODEL_NAME,
      },
    },
  });
});

export default router;
