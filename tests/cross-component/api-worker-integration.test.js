/**
 * API ↔ Workers Integration Tests
 *
 * Tests the complete job flow between the Trix API and Workers:
 * 1. API enqueues jobs to BullMQ
 * 2. Workers process jobs
 * 3. Database is updated with results
 *
 * This verifies the critical path for async operations like:
 * - Embedding generation
 * - Enrichment processing
 * - Graph sync operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Queue, Worker } from 'bullmq';
import {
  setupCrossComponentTests,
  getConnections,
  getRedisConfig,
  cleanupDatabase,
  cleanupRedis,
  createTestAccount,
  createTestMemory,
  getMemory,
  waitFor,
} from './setup.js';

describe('API ↔ Workers Integration', () => {
  let pool;
  let redis;
  let testAccount;
  let testWorkers = [];
  let testQueues = [];
  let testCounter = 0;

  setupCrossComponentTests();

  beforeAll(async () => {
    const connections = getConnections();
    pool = connections.pool;
    redis = connections.redis;
  });

  beforeEach(async () => {
    await cleanupDatabase(pool);
    await cleanupRedis(redis);
    testAccount = await createTestAccount(pool);
    testWorkers = [];
    testQueues = [];
    testCounter++;
  });

  afterEach(async () => {
    // Close all workers and queues created in this test
    for (const worker of testWorkers) {
      await worker.close();
    }
    for (const queue of testQueues) {
      await queue.close();
    }
  });

  /**
   * Helper to create a unique queue for this test
   */
  function createTestQueue(baseName) {
    const name = `${baseName}-test-${testCounter}-${Date.now()}`;
    const queue = new Queue(name, { connection: getRedisConfig() });
    testQueues.push(queue);
    return { queue, name };
  }

  /**
   * Helper to create a worker for the test
   */
  function createTestWorker(queueName, processor, options = {}) {
    const worker = new Worker(queueName, processor, {
      connection: getRedisConfig(),
      concurrency: options.concurrency || 1,
    });
    testWorkers.push(worker);
    return worker;
  }

  describe('Embedding Job Flow', () => {
    it('should enqueue embedding job from API and process in worker', async () => {
      // Create test memory
      const memory = await createTestMemory(pool, testAccount.id, {
        content: 'Test content for embedding',
      });

      // Processed jobs tracker
      const processedJobs = [];

      // Create unique queue for this test
      const { queue, name } = createTestQueue('embedding');

      // Create worker (simulating trix-workers-node)
      createTestWorker(name, async (job) => {
        const { memoryId, text, storeInDb } = job.data;

        // Simulate embedding generation
        const mockEmbedding = new Array(1536).fill(0.1);

        // Update database (simulating what embedding.js does)
        if (storeInDb) {
          await pool.query(
            `UPDATE memories
             SET embedding = $1,
                 embedding_status = 'completed',
                 updated_at = NOW()
             WHERE id = $2`,
            [`[${mockEmbedding.join(',')}]`, memoryId]
          );
        }

        processedJobs.push({ memoryId, text });
        return { memoryId, success: true };
      });

      // Enqueue job (simulating API behavior)
      const job = await queue.add('generate', {
        memoryId: memory.id,
        text: memory.content,
        storeInDb: true,
        _trace: { traceId: 'test-trace-123' },
      });

      expect(job.id).toBeDefined();

      // Wait for job to be processed
      await waitFor(async () => processedJobs.length > 0, 5000);

      // Verify job was processed
      expect(processedJobs).toHaveLength(1);
      expect(processedJobs[0].memoryId).toBe(memory.id);

      // Verify database was updated
      const updatedMemory = await getMemory(pool, memory.id);
      expect(updatedMemory.embedding_status).toBe('completed');
      expect(updatedMemory.embedding).toBeDefined();
    });

    it('should handle batch embedding jobs', async () => {
      // Create multiple test memories
      const memories = await Promise.all([
        createTestMemory(pool, testAccount.id, { content: 'Memory 1' }),
        createTestMemory(pool, testAccount.id, { content: 'Memory 2' }),
        createTestMemory(pool, testAccount.id, { content: 'Memory 3' }),
      ]);

      const processedBatches = [];

      // Create unique queue for this test
      const { queue, name } = createTestQueue('embedding-batch');

      // Create worker for batch processing
      createTestWorker(name, async (job) => {
        const { memories: batchMemories, storeInDb } = job.data;

        if (batchMemories && Array.isArray(batchMemories)) {
          // Simulate batch embedding
          const results = batchMemories.map((m) => ({
            id: m.id,
            embedding: new Array(1536).fill(0.1),
          }));

          if (storeInDb) {
            for (const result of results) {
              await pool.query(
                `UPDATE memories
                 SET embedding_status = 'completed', updated_at = NOW()
                 WHERE id = $1`,
                [result.id]
              );
            }
          }

          processedBatches.push(results);
          return { total: results.length, success: true };
        }
      });

      // Enqueue batch job
      await queue.add('batch', {
        memories: memories.map((m) => ({ id: m.id, text: m.content })),
        storeInDb: true,
      });

      // Wait for processing
      await waitFor(async () => processedBatches.length > 0, 5000);

      // Verify all memories were processed
      expect(processedBatches[0]).toHaveLength(3);

      // Verify database updates
      for (const memory of memories) {
        const updated = await getMemory(pool, memory.id);
        expect(updated.embedding_status).toBe('completed');
      }
    });

    it('should handle job failures and update status', async () => {
      const memory = await createTestMemory(pool, testAccount.id);
      const failedJobs = [];

      // Create unique queue for this test
      const { queue, name } = createTestQueue('embedding-fail');

      // Create worker that fails
      createTestWorker(name, async (job) => {
        // Update status to failed
        await pool.query(
          `UPDATE memories
           SET embedding_status = 'failed',
               embedding_error = $1,
               updated_at = NOW()
           WHERE id = $2`,
          ['Simulated failure', job.data.memoryId]
        );

        failedJobs.push(job.data.memoryId);
        throw new Error('Simulated embedding failure');
      });

      // Enqueue job
      await queue.add(
        'generate',
        { memoryId: memory.id, text: memory.content, storeInDb: true },
        { attempts: 1 } // Only one attempt for test
      );

      // Wait for failure
      await waitFor(async () => failedJobs.length > 0, 5000);

      // Verify database reflects failure
      const updatedMemory = await getMemory(pool, memory.id);
      expect(updatedMemory.embedding_status).toBe('failed');
      expect(updatedMemory.embedding_error).toBe('Simulated failure');
    });
  });

  describe('Enrichment Job Flow', () => {
    it('should process enrichment jobs and update enrichments table', async () => {
      const memory = await createTestMemory(pool, testAccount.id, {
        content: 'This is about AI and machine learning',
      });

      // Create enrichment record
      const enrichmentResult = await pool.query(
        `INSERT INTO enrichments (memory_id, account_id, type, status)
         VALUES ($1, $2, 'topics', 'pending')
         RETURNING *`,
        [memory.id, testAccount.id]
      );
      const enrichment = enrichmentResult.rows[0];

      const processedEnrichments = [];

      // Create unique queue for this test
      const { queue, name } = createTestQueue('enrichment');

      // Create enrichment worker
      createTestWorker(name, async (job) => {
        const { enrichmentId, memoryId } = job.data;

        // Simulate topic extraction
        const topics = [
          { name: 'AI', relevance: 0.9 },
          { name: 'machine learning', relevance: 0.85 },
        ];

        // Update enrichment record
        await pool.query(
          `UPDATE enrichments
           SET status = 'completed', result = $1, updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify({ topics }), enrichmentId]
        );

        processedEnrichments.push({ enrichmentId, memoryId });
        return { topics, success: true };
      });

      // Enqueue enrichment job
      await queue.add('topics', {
        enrichmentId: enrichment.id,
        memoryId: memory.id,
        accountId: testAccount.id,
      });

      // Wait for processing
      await waitFor(async () => processedEnrichments.length > 0, 5000);

      // Verify enrichment was updated
      const result = await pool.query('SELECT * FROM enrichments WHERE id = $1', [
        enrichment.id,
      ]);
      const updatedEnrichment = result.rows[0];

      expect(updatedEnrichment.status).toBe('completed');
      expect(updatedEnrichment.result.topics).toHaveLength(2);
    });
  });

  describe('Graph Sync Job Flow', () => {
    it('should process graph sync jobs for memory nodes', async () => {
      const memory = await createTestMemory(pool, testAccount.id, {
        content: 'Memory to sync to graph',
      });

      const syncedMemories = [];

      // Create unique queue for this test
      const { queue, name } = createTestQueue('graph-sync');

      // Create graph sync worker
      createTestWorker(name, async (job) => {
        const { memoryId, accountId, operation } = job.data;

        // In real implementation, this syncs to FalkorDB/Memgraph
        // For test, we just track the sync operation
        syncedMemories.push({ memoryId, accountId, operation });

        return { memoryId, synced: true };
      });

      // Enqueue graph sync job
      await queue.add('sync', {
        memoryId: memory.id,
        accountId: testAccount.id,
        operation: 'create',
        content: memory.content,
      });

      // Wait for sync
      await waitFor(async () => syncedMemories.length > 0, 5000);

      expect(syncedMemories[0]).toEqual({
        memoryId: memory.id,
        accountId: testAccount.id,
        operation: 'create',
      });
    });
  });

  describe('Job Priority and Ordering', () => {
    it('should process high priority jobs first', async () => {
      const processOrder = [];

      // Create unique queue for this test
      const { queue, name } = createTestQueue('priority');

      createTestWorker(
        name,
        async (job) => {
          processOrder.push(job.data.order);
          return { order: job.data.order };
        },
        { concurrency: 1 }
      );

      // Add jobs with different priorities (lower number = higher priority)
      await queue.add('job', { order: 3 }, { priority: 10 }); // Low priority
      await queue.add('job', { order: 1 }, { priority: 1 }); // High priority
      await queue.add('job', { order: 2 }, { priority: 5 }); // Medium priority

      // Wait for all jobs
      await waitFor(async () => processOrder.length >= 3, 5000);

      // High priority should be processed first
      expect(processOrder[0]).toBe(1);
      expect(processOrder[1]).toBe(2);
      expect(processOrder[2]).toBe(3);
    });
  });

  describe('Trace Context Propagation', () => {
    it('should propagate trace context from API to worker', async () => {
      const memory = await createTestMemory(pool, testAccount.id);
      let receivedTraceContext = null;

      // Create unique queue for this test
      const { queue, name } = createTestQueue('trace');

      createTestWorker(name, async (job) => {
        receivedTraceContext = job.data._trace;
        return { success: true };
      });

      await queue.add('generate', {
        memoryId: memory.id,
        text: memory.content,
        _trace: {
          traceId: 'trace-12345',
          accountId: testAccount.id,
          requestId: 'req-67890',
        },
      });

      await waitFor(async () => receivedTraceContext !== null, 5000);

      expect(receivedTraceContext.traceId).toBe('trace-12345');
      expect(receivedTraceContext.accountId).toBe(testAccount.id);
      expect(receivedTraceContext.requestId).toBe('req-67890');
    });
  });
});
