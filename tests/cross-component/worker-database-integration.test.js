/**
 * Workers ↔ Database Integration Tests
 *
 * Tests the database operations performed by Workers:
 * 1. Embedding storage with vector type
 * 2. Memory chunk management
 * 3. Enrichment result persistence
 * 4. Status tracking and error handling
 *
 * These tests verify Workers can correctly interact with PostgreSQL.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupCrossComponentTests,
  getConnections,
  cleanupDatabase,
  createTestAccount,
  createTestMemory,
  getMemory,
  waitFor,
} from './setup.js';

describe('Workers ↔ Database Integration', () => {
  let pool;
  let testAccount;

  setupCrossComponentTests();

  beforeAll(async () => {
    const connections = getConnections();
    pool = connections.pool;
  });

  beforeEach(async () => {
    await cleanupDatabase(pool);
    testAccount = await createTestAccount(pool);
  });

  describe('Embedding Storage Operations', () => {
    it('should store embedding vector in correct format', async () => {
      const memory = await createTestMemory(pool, testAccount.id, {
        content: 'Test content for embedding',
      });

      // Generate mock embedding (1536 dimensions for text-embedding-3-small)
      const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);

      // Store embedding (simulating embedding.js processor)
      await pool.query(
        `UPDATE memories
         SET embedding = $1,
             embedding_status = 'completed',
             updated_at = NOW()
         WHERE id = $2`,
        [`[${embedding.join(',')}]`, memory.id]
      );

      // Verify storage
      const result = await pool.query(
        `SELECT id, embedding_status, embedding::text as embedding_text
         FROM memories WHERE id = $1`,
        [memory.id]
      );

      expect(result.rows[0].embedding_status).toBe('completed');
      expect(result.rows[0].embedding_text).toBeDefined();

      // Parse and verify embedding dimensions
      const storedEmbedding = result.rows[0].embedding_text
        .replace('[', '')
        .replace(']', '')
        .split(',')
        .map(Number);

      expect(storedEmbedding.length).toBe(1536);
    });

    it('should update embedding status through lifecycle', async () => {
      const memory = await createTestMemory(pool, testAccount.id);

      // Initial status should be pending
      let memoryState = await getMemory(pool, memory.id);
      expect(memoryState.embedding_status).toBe('pending');

      // Set to processing
      await pool.query(
        `UPDATE memories SET embedding_status = 'processing' WHERE id = $1`,
        [memory.id]
      );

      memoryState = await getMemory(pool, memory.id);
      expect(memoryState.embedding_status).toBe('processing');

      // Set to completed
      await pool.query(
        `UPDATE memories SET embedding_status = 'completed' WHERE id = $1`,
        [memory.id]
      );

      memoryState = await getMemory(pool, memory.id);
      expect(memoryState.embedding_status).toBe('completed');
    });

    it('should handle embedding failure with error message', async () => {
      const memory = await createTestMemory(pool, testAccount.id);

      // Simulate failure
      const errorMessage = 'OpenAI API rate limit exceeded';
      await pool.query(
        `UPDATE memories
         SET embedding_status = 'failed',
             embedding_error = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [errorMessage, memory.id]
      );

      const memoryState = await getMemory(pool, memory.id);
      expect(memoryState.embedding_status).toBe('failed');
      expect(memoryState.embedding_error).toBe(errorMessage);
    });

    it('should batch update embeddings efficiently', async () => {
      // Create multiple memories
      const memories = await Promise.all([
        createTestMemory(pool, testAccount.id, { content: 'Memory 1' }),
        createTestMemory(pool, testAccount.id, { content: 'Memory 2' }),
        createTestMemory(pool, testAccount.id, { content: 'Memory 3' }),
      ]);

      const memoryIds = memories.map((m) => m.id);
      const embeddings = memories.map(() =>
        new Array(1536).fill(0).map(() => Math.random())
      );

      // Batch update (simulating batch embedding processor)
      const ids = memoryIds;
      const embeddingStrings = embeddings.map((e) => `[${e.join(',')}]`);

      await pool.query(
        `UPDATE memories m
         SET embedding = data.embedding::vector,
             embedding_status = 'completed',
             updated_at = NOW()
         FROM (SELECT unnest($1::uuid[]) as id, unnest($2::text[]) as embedding) data
         WHERE m.id = data.id`,
        [ids, embeddingStrings]
      );

      // Verify all updated
      for (const memoryId of memoryIds) {
        const memory = await getMemory(pool, memoryId);
        expect(memory.embedding_status).toBe('completed');
        expect(memory.embedding).toBeDefined();
      }
    });
  });

  describe('Memory Chunk Operations', () => {
    it('should store chunks for long content', async () => {
      const memory = await createTestMemory(pool, testAccount.id, {
        content: 'Very long content '.repeat(500), // ~9KB
      });

      // Simulate chunking (from embedding.js)
      const chunks = [
        { index: 0, content: 'Chunk 0 content', tokenCount: 100, charCount: 500 },
        { index: 1, content: 'Chunk 1 content', tokenCount: 100, charCount: 500 },
        { index: 2, content: 'Chunk 2 content', tokenCount: 100, charCount: 500 },
      ];

      // Store chunks
      for (const chunk of chunks) {
        const embedding = new Array(1536).fill(0.1);

        await pool.query(
          `INSERT INTO memory_chunks
           (memory_id, account_id, chunk_index, content, embedding, token_count, char_count, metadata)
           VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)`,
          [
            memory.id,
            testAccount.id,
            chunk.index,
            chunk.content,
            `[${embedding.join(',')}]`,
            chunk.tokenCount,
            chunk.charCount,
            JSON.stringify({ strategy: 'semantic' }),
          ]
        );
      }

      // Update parent memory
      await pool.query(
        `UPDATE memories SET has_chunks = true WHERE id = $1`,
        [memory.id]
      );

      // Verify chunks stored
      const chunkResult = await pool.query(
        `SELECT * FROM memory_chunks WHERE memory_id = $1 ORDER BY chunk_index`,
        [memory.id]
      );

      expect(chunkResult.rows.length).toBe(3);
      expect(chunkResult.rows[0].chunk_index).toBe(0);
      expect(chunkResult.rows[2].chunk_index).toBe(2);

      // Verify parent memory flag
      const parentMemory = await getMemory(pool, memory.id);
      expect(parentMemory.has_chunks).toBe(true);
    });

    it('should delete chunks when parent memory deleted', async () => {
      const memory = await createTestMemory(pool, testAccount.id);

      // Create a chunk
      await pool.query(
        `INSERT INTO memory_chunks (memory_id, account_id, chunk_index, content)
         VALUES ($1, $2, 0, 'Chunk content')`,
        [memory.id, testAccount.id]
      );

      // Verify chunk exists
      const beforeDelete = await pool.query(
        `SELECT COUNT(*) FROM memory_chunks WHERE memory_id = $1`,
        [memory.id]
      );
      expect(parseInt(beforeDelete.rows[0].count)).toBe(1);

      // Delete parent memory
      await pool.query(`DELETE FROM memories WHERE id = $1`, [memory.id]);

      // Verify chunk was cascade deleted
      const afterDelete = await pool.query(
        `SELECT COUNT(*) FROM memory_chunks WHERE memory_id = $1`,
        [memory.id]
      );
      expect(parseInt(afterDelete.rows[0].count)).toBe(0);
    });
  });

  describe('Enrichment Operations', () => {
    it('should store topic extraction results', async () => {
      const memory = await createTestMemory(pool, testAccount.id, {
        content: 'Artificial intelligence and machine learning',
      });

      // Create enrichment record
      const enrichmentResult = await pool.query(
        `INSERT INTO enrichments (memory_id, account_id, type, status)
         VALUES ($1, $2, 'topics', 'pending')
         RETURNING id`,
        [memory.id, testAccount.id]
      );
      const enrichmentId = enrichmentResult.rows[0].id;

      // Simulate topic extraction
      const topics = [
        { name: 'artificial intelligence', relevance: 0.95 },
        { name: 'machine learning', relevance: 0.90 },
      ];

      // Store result (simulating topic-extraction.js)
      await pool.query(
        `UPDATE enrichments
         SET status = 'completed',
             result = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({ topics }), enrichmentId]
      );

      // Verify
      const result = await pool.query(
        `SELECT * FROM enrichments WHERE id = $1`,
        [enrichmentId]
      );

      expect(result.rows[0].status).toBe('completed');
      expect(result.rows[0].result.topics).toHaveLength(2);
      expect(result.rows[0].result.topics[0].name).toBe('artificial intelligence');
    });

    it('should store entity extraction results', async () => {
      const memory = await createTestMemory(pool, testAccount.id, {
        content: 'John Smith works at Anthropic in San Francisco',
      });

      const enrichmentResult = await pool.query(
        `INSERT INTO enrichments (memory_id, account_id, type, status)
         VALUES ($1, $2, 'entities', 'pending')
         RETURNING id`,
        [memory.id, testAccount.id]
      );

      // Simulate entity extraction
      const entities = [
        { name: 'John Smith', type: 'person', mentions: 1 },
        { name: 'Anthropic', type: 'organization', mentions: 1 },
        { name: 'San Francisco', type: 'location', mentions: 1 },
      ];

      await pool.query(
        `UPDATE enrichments
         SET status = 'completed', result = $1
         WHERE id = $2`,
        [JSON.stringify({ entities }), enrichmentResult.rows[0].id]
      );

      const result = await pool.query(
        `SELECT result FROM enrichments WHERE id = $1`,
        [enrichmentResult.rows[0].id]
      );

      expect(result.rows[0].result.entities).toHaveLength(3);
    });

    it('should handle enrichment failures', async () => {
      const memory = await createTestMemory(pool, testAccount.id);

      const enrichmentResult = await pool.query(
        `INSERT INTO enrichments (memory_id, account_id, type, status)
         VALUES ($1, $2, 'summary', 'pending')
         RETURNING id`,
        [memory.id, testAccount.id]
      );

      // Simulate failure
      await pool.query(
        `UPDATE enrichments
         SET status = 'failed', error = $1
         WHERE id = $2`,
        ['LLM API timeout', enrichmentResult.rows[0].id]
      );

      const result = await pool.query(
        `SELECT status, error FROM enrichments WHERE id = $1`,
        [enrichmentResult.rows[0].id]
      );

      expect(result.rows[0].status).toBe('failed');
      expect(result.rows[0].error).toBe('LLM API timeout');
    });
  });

  describe('Relationship Operations', () => {
    it('should create memory relationships', async () => {
      const memory1 = await createTestMemory(pool, testAccount.id, {
        content: 'First memory about AI',
      });
      const memory2 = await createTestMemory(pool, testAccount.id, {
        content: 'Second memory about AI',
      });

      // Create relationship (simulating auto-relations.js)
      await pool.query(
        `INSERT INTO memory_relationships
         (source_id, target_id, relationship_type, weight, account_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [memory1.id, memory2.id, 'related_to', 0.85, testAccount.id]
      );

      // Verify
      const result = await pool.query(
        `SELECT * FROM memory_relationships
         WHERE source_id = $1 AND target_id = $2`,
        [memory1.id, memory2.id]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].relationship_type).toBe('related_to');
      expect(parseFloat(result.rows[0].weight)).toBeCloseTo(0.85, 2);
    });

    it('should cascade delete relationships with memory', async () => {
      const memory1 = await createTestMemory(pool, testAccount.id);
      const memory2 = await createTestMemory(pool, testAccount.id);

      await pool.query(
        `INSERT INTO memory_relationships
         (source_id, target_id, relationship_type, account_id)
         VALUES ($1, $2, 'references', $3)`,
        [memory1.id, memory2.id, testAccount.id]
      );

      // Delete source memory
      await pool.query(`DELETE FROM memories WHERE id = $1`, [memory1.id]);

      // Verify relationship deleted
      const result = await pool.query(
        `SELECT COUNT(*) FROM memory_relationships WHERE source_id = $1`,
        [memory1.id]
      );

      expect(parseInt(result.rows[0].count)).toBe(0);
    });
  });

  describe('Transaction Handling', () => {
    it('should rollback on error during embedding storage', async () => {
      const memory = await createTestMemory(pool, testAccount.id);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update status
        await client.query(
          `UPDATE memories SET embedding_status = 'processing' WHERE id = $1`,
          [memory.id]
        );

        // Simulate error during embedding storage
        throw new Error('Simulated embedding generation failure');
      } catch (error) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      // Status should still be pending (rolled back)
      const memoryState = await getMemory(pool, memory.id);
      expect(memoryState.embedding_status).toBe('pending');
    });

    it('should commit successful multi-step operations', async () => {
      const memory = await createTestMemory(pool, testAccount.id);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Step 1: Update embedding
        const embedding = new Array(1536).fill(0.1);
        await client.query(
          `UPDATE memories SET embedding = $1, embedding_status = 'completed' WHERE id = $2`,
          [`[${embedding.join(',')}]`, memory.id]
        );

        // Step 2: Create enrichment
        await client.query(
          `INSERT INTO enrichments (memory_id, account_id, type, status, result)
           VALUES ($1, $2, 'topics', 'completed', $3)`,
          [memory.id, testAccount.id, JSON.stringify({ topics: [] })]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      // Verify both operations committed
      const memoryState = await getMemory(pool, memory.id);
      expect(memoryState.embedding_status).toBe('completed');

      const enrichmentResult = await pool.query(
        `SELECT * FROM enrichments WHERE memory_id = $1`,
        [memory.id]
      );
      expect(enrichmentResult.rows.length).toBe(1);
    });
  });

  describe('Vector Search Operations', () => {
    it('should perform vector similarity search', async () => {
      // Create memories with embeddings
      const memories = await Promise.all([
        createTestMemory(pool, testAccount.id, { content: 'AI and ML' }),
        createTestMemory(pool, testAccount.id, { content: 'Cooking recipes' }),
        createTestMemory(pool, testAccount.id, { content: 'Deep learning' }),
      ]);

      // Store embeddings (similar vectors for related content)
      const aiEmbedding = new Array(1536).fill(0.5);
      const cookingEmbedding = new Array(1536).fill(-0.3);
      const dlEmbedding = new Array(1536).fill(0.48); // Similar to AI

      await pool.query(
        `UPDATE memories SET embedding = $1 WHERE id = $2`,
        [`[${aiEmbedding.join(',')}]`, memories[0].id]
      );
      await pool.query(
        `UPDATE memories SET embedding = $1 WHERE id = $2`,
        [`[${cookingEmbedding.join(',')}]`, memories[1].id]
      );
      await pool.query(
        `UPDATE memories SET embedding = $1 WHERE id = $2`,
        [`[${dlEmbedding.join(',')}]`, memories[2].id]
      );

      // Search for similar to AI (using cosine distance)
      const searchVector = `[${aiEmbedding.join(',')}]`;
      const result = await pool.query(
        `SELECT id, content, 1 - (embedding <=> $1::vector) as similarity
         FROM memories
         WHERE account_id = $2 AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 3`,
        [searchVector, testAccount.id]
      );

      expect(result.rows.length).toBe(3);

      // Most similar should be AI or Deep learning (highest similarity)
      const topResult = result.rows[0];
      expect(['AI and ML', 'Deep learning']).toContain(topResult.content);
      expect(parseFloat(topResult.similarity)).toBeGreaterThan(0.9);
    });
  });
});
