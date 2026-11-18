/**
 * scripts/seed-demo.js
 * Ingests real, high-quality technical notes through the real pipeline.
 * Can be run standalone (direct database pipeline) or against a live running server.
 */

process.env.SKIP_GROQ_CHECK = 'true';

const DEMO_ITEMS = [
  {
    title: 'RAG Architecture and 384-dim Embeddings',
    sourceType: 'note',
    content: `Retrieval-Augmented Generation (RAG) enhances LLM responses by fetching relevant context from an external knowledge base before prompt assembly. 
Sentence-transformers like all-MiniLM-L6-v2 map textual chunks into a 384-dimensional dense vector space. 
Because vectors are normalized during feature extraction, cosine similarity simplifies directly to dot products, enabling fast semantic similarity calculation. 
MiniLM models truncate text beyond 256 tokens, making chunk sizes of approximately 200 tokens optimal for preserving full semantic meaning.`,
  },
  {
    title: 'SQLite WAL Mode and Concurrency',
    sourceType: 'note',
    content: `SQLite supports Write-Ahead Logging (WAL) to enable concurrent reads and writes. 
Under traditional rollback journal mode, writing locks the entire database file against concurrent readers. 
With WAL mode enabled via PRAGMA journal_mode = WAL, readers read from the main database file while writers append changes to a separate -wal file without blocking readers. 
Foreign keys must be explicitly turned on in SQLite per connection using PRAGMA foreign_keys = ON to ensure cascading deletions work reliably.`,
  },
  {
    title: 'Defensive Prompt Injection and Source Grounding',
    sourceType: 'note',
    content: `Prompt injection occurs when untrusted reference context attempts to override system instructions. 
Robust RAG systems treat retrieved text as untrusted data by wrapping it in clear custom delimiters and explicitly instructing the model to disregard instructions embedded within context. 
Furthermore, requesting structured JSON with source citations ([S1], [S2]) allows the server to defensively cross-check claimed sources against actual retrieved chunks, discarding any fabricated citations.`,
  },
];

async function seed() {
  console.log('🌱 Starting demo seed ingestion...');
  const serverUrl = process.env.API_URL || 'http://localhost:3001';

  let liveServer = false;
  try {
    const res = await fetch(`${serverUrl}/health`);
    if (res.ok) {
      liveServer = true;
      console.log(`Connected to live server at ${serverUrl}`);
    }
  } catch {
    console.log('No live HTTP server detected; running direct pipeline execution against SQLite database.');
  }

  const { getDatabase, closeDatabase } = await import('../server/src/db/connection.js');
  const { processItem } = await import('../server/src/services/ingestionService.js');
  const { itemRepository } = await import('../server/src/db/repositories/itemRepository.js');
  const crypto = (await import('crypto')).default;

  getDatabase();

  for (const item of DEMO_ITEMS) {
    console.log(`\n⏳ Ingesting: "${item.title}"...`);
    if (liveServer) {
      const res = await fetch(`${serverUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: item.sourceType,
          title: item.title,
          content: item.content,
        }),
      });
      const data = await res.json();
      console.log(`   Submitted to live server (ID: ${data.data?.id}).`);
    } else {
      const id = crypto.randomUUID();
      itemRepository.create({
        id,
        title: item.title,
        content: item.content,
        sourceType: item.sourceType,
        processingStatus: 'pending',
      });
      await processItem(id);
      const updated = itemRepository.findById(id);
      console.log(`   Ingested successfully! Status: ${updated.processing_status}, Content Hash: ${updated.content_hash?.slice(0, 16)}...`);
    }
  }

  if (!liveServer) {
    closeDatabase();
  }

  console.log('\n✅ Demo seed completed successfully!');
}

seed().catch((err) => {
  console.error('❌ Demo seeding failed:', err);
  process.exit(1);
});
