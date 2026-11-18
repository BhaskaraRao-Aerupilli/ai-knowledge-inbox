# Architecture & Technical Design Decisions

This document outlines the core architectural tradeoffs and engineering decisions made in **AI Knowledge Inbox**, explaining why specific technologies were chosen, what operational bottlenecks emerge at scale, and how the system would evolve into a high-scale production deployment.

---

## 1. Chunking Strategy & Token Estimation
- **Parameters**: Target chunk size of ~200 tokens with an overlap of ~40 tokens (configurable via `CHUNK_SIZE` and `CHUNK_OVERLAP`).
- **Rationale**: The embedding model (`all-MiniLM-L6-v2`) has a hard context window of 256 tokens. Any input tokens beyond 256 are silently truncated by BERT/MiniLM tokenizers, resulting in unindexed and inaccessible context. Sizing chunks to ~200 tokens provides a safe margin for subword expansion while preserving cohesive topical context.
- **Token Estimation Heuristic**: Uses `words * 1.3`. Subword tokenizers (WordPiece / BPE) split English text into approximately 1.3 tokens per whitespace-delimited word. This avoids running expensive native tokenizers synchronously in Node during text slicing while maintaining deterministic bounds.
- **Sentence-Aware Splitting**: Rather than cutting text blindly at character boundaries, chunks break at sentence delimiters (`.`, `!`, `?`, `\n`). When a single sentence exceeds the token budget, it is safely split into word-level subchunks so no chunk violates the model's limit. Overlap between adjacent chunks guarantees that assertions spanning sentence boundaries remain intact.

---

## 2. Storage: SQLite with JSON Vectors & Brute-Force Cosine
- **Why SQLite**:
  - Embedded zero-configuration storage: requires no external daemon, container, or cloud dependency.
  - ACID durability: SQLite ensures single-user transactional safety with foreign key constraints (`PRAGMA foreign_keys = ON`) and cascading chunk cleanup.
  - Write-Ahead Logging (`PRAGMA journal_mode = WAL`): readers read concurrently from the main database file without blocking or waiting on the background ingestion writer.
- **Why JSON Float Arrays**:
  - Vectors are stored as serialized JSON arrays of 384 IEEE 754 floats.
  - Because `all-MiniLM-L6-v2` produces L2-normalized embeddings, cosine similarity mathematically reduces to the dot product ($A \cdot B$).
  - A robust `cosineSimilarity` function validates vector dimensions, guards against non-finite values (NaN/Infinity), handles zero magnitudes, and skips malformed records with warning logs instead of crashing the query process.

---

## 3. Embeddings: Local Inference via Transformers.js
- **Model**: `all-MiniLM-L6-v2` via `@huggingface/transformers` (384 dimensions, mean pooling, L2 normalized).
- **Why Local Inference**:
  - **Zero External API Cost & Latency**: Generates embeddings locally on the CPU using the ONNX runtime without external network hops, billable token fees, or rate limits.
  - **Data Privacy**: Raw document content and personal notes never leave the host server during embedding generation.
  - **Singleton Lifecycle**: The model is instantiated once as a singleton promise and kept warm in memory, preventing repeated disk and initialization overhead on subsequent queries.

---

## 4. LLM Generation: Groq Official SDK
- **Model**: Groq `llama-3.3-70b-versatile` (or configured via `GROQ_MODEL`).
- **Why Groq**:
  - Ultra-fast token generation latency (LPU architecture) reduces time-to-first-token (TTFT) for user-facing synthesis.
  - Strict JSON mode (`response_format: { type: 'json_object' }`) enforces reliable structured responses: `{"answer": string, "sources": ["S1", ...]}`.
- **Prompt Injection Defense & Citation Grounding**:
  - Retrieved text passages are tagged with source labels (`[S1]`, `[S2]`) and wrapped in distinct delimiters (`<<<CONTEXT_SOURCE>>>...<<<END_SOURCE>>>`).
  - The system prompt explicitly instructs the LLM that retrieved context is untrusted reference data and to ignore instructions embedded within.
  - The server defends against hallucinations by validating returned citation labels against actually retrieved chunks, dropping unknown or fabricated references.

---

## 5. What Breaks at Scale? (Bottleneck Analysis)

| Component | Limit / Bottleneck | Why It Breaks |
| :--- | :--- | :--- |
| **Vector Search** | ~50,000 to 100,000 chunks | Brute-force scanning requires loading every vector into memory and computing $O(N)$ dot products sequentially in the Node event loop. |
| **Write Concurrency** | >1 concurrent write stream | SQLite allows only one writer process at a time. High write volume leads to database lock contention (`SQLITE_BUSY`). |
| **Job Durability** | Server restart / crash | The current in-process job queue (`setImmediate`) lives in Node memory. If the server crashes or restarts mid-ingest, in-flight jobs are dropped (though stuck items are safely flagged on startup). |
| **Memory Footprint** | Large document collections | Deserializing tens of thousands of JSON arrays on every query introduces heavy V8 garbage collection pressure. |
| **External Rate Limits** | Upstream LLM quota | External LLM APIs impose strict requests-per-minute (RPM) and tokens-per-minute (TPM) limits that fail under burst traffic without queuing. |

---

## 6. Production Architecture Evolution

To scale this system to hundreds of thousands of users and millions of documents, the following production upgrades would be implemented:

1. **Dedicated Vector Indexing**:
   - Replace SQLite JSON vectors with **PostgreSQL + pgvector** (using HNSW or IVFFlat indexes) or a dedicated vector database (e.g., Qdrant, Pinecone, Milvus) to achieve sub-millisecond approximate nearest neighbor (ANN) retrieval with $O(\log N)$ search complexity.
2. **Distributed Job Queue**:
   - Decouple background ingestion from the HTTP server using **Redis + BullMQ** or **Temporal**.
   - Enables retry backoff, exponential jitter, job progress tracking, and horizontal worker scaling across separate worker nodes.
3. **Multi-Tier Semantic & Exact Caching**:
   - Place a **Redis cache** in front of query execution:
     - Hash question text for exact-match 0ms responses.
     - Cache query vector embeddings to prevent re-embedding identical search phrases.
4. **Multi-Tenancy & Access Control**:
   - Implement JWT-based authentication (OAuth2 / OIDC).
   - Enforce database row-level security (RLS) or tenant-keyed schemas so users cannot search or access another user's documents.
5. **Observability & Guardrails**:
   - Integrate OpenTelemetry tracing to track RAG latency breakdowns (time in embedding vs retrieval vs LLM completion).
   - Monitor retrieval quality using continuous RAG triad evaluation (faithfulness, answer relevance, context recall).
