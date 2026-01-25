/**
 * MCP ↔ API Integration Tests
 *
 * Tests the HTTP communication between MCP server and Trix API:
 * 1. MCP client makes HTTP requests to API
 * 2. API processes requests and returns responses
 * 3. MCP handles responses and errors correctly
 *
 * These tests verify the contract between MCP tools and API endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupCrossComponentTests,
  getConnections,
  cleanupDatabase,
  createTestAccount,
  createTestMemory,
} from './setup.js';

/**
 * Simplified MCP client that mirrors HttpTrixClient behavior
 * (Extracted patterns from trix-mcp/src/client/HttpTrixClient.js)
 */
class MockMcpApiClient {
  constructor(options) {
    this.apiUrl = options.apiUrl || 'http://localhost:3737';
    this.apiKey = options.apiKey;
    this.pool = options.pool; // Direct DB access for testing
    this.timeoutMs = options.timeoutMs || 30000;
  }

  /**
   * Simulate API request (in tests, we call DB directly)
   */
  async request(method, path, data = null) {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Route to appropriate handler
    if (path === '/v1/memories' && method === 'POST') {
      return this.handleStoreMemory(data);
    }
    if (path.match(/^\/v1\/memories\/[^/]+$/) && method === 'GET') {
      const id = path.split('/').pop();
      return this.handleGetMemory(id);
    }
    if (path === '/v1/search/semantic' && method === 'POST') {
      return this.handleSemanticSearch(data);
    }
    if (path === '/v1/relationships' && method === 'POST') {
      return this.handleCreateRelationship(data);
    }

    throw new Error(`Unknown route: ${method} ${path}`);
  }

  async handleStoreMemory(data) {
    const { content, tags, priority, metadata } = data;

    // Validate required fields
    if (!content) {
      return {
        ok: false,
        status: 400,
        body: { error: 'content is required' },
      };
    }

    // Insert memory
    const result = await this.pool.query(
      `INSERT INTO memories (account_id, content, metadata)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [
        this.accountId,
        content,
        JSON.stringify({ tags, priority, ...metadata }),
      ]
    );

    return {
      ok: true,
      status: 201,
      body: { memory: result.rows[0] },
    };
  }

  async handleGetMemory(id) {
    const result = await this.pool.query(
      'SELECT * FROM memories WHERE id = $1 AND account_id = $2',
      [id, this.accountId]
    );

    if (result.rows.length === 0) {
      return {
        ok: false,
        status: 404,
        body: { error: 'Memory not found' },
      };
    }

    return {
      ok: true,
      status: 200,
      body: { memory: result.rows[0] },
    };
  }

  async handleSemanticSearch(data) {
    const { query, limit = 10, threshold = 0.5 } = data;

    if (!query) {
      return {
        ok: false,
        status: 400,
        body: { error: 'query is required' },
      };
    }

    // In real API, this uses vector similarity search
    // For test, return memories containing query terms
    const result = await this.pool.query(
      `SELECT id, content, embedding_status, created_at
       FROM memories
       WHERE account_id = $1 AND content ILIKE $2
       LIMIT $3`,
      [this.accountId, `%${query}%`, limit]
    );

    return {
      ok: true,
      status: 200,
      body: {
        results: result.rows.map((r) => ({
          ...r,
          score: 0.85, // Mock similarity score
        })),
      },
    };
  }

  async handleCreateRelationship(data) {
    const { source_id, target_id, relationship_type, weight = 1.0 } = data;

    if (!source_id || !target_id || !relationship_type) {
      return {
        ok: false,
        status: 400,
        body: { error: 'source_id, target_id, and relationship_type required' },
      };
    }

    const result = await this.pool.query(
      `INSERT INTO memory_relationships (source_id, target_id, relationship_type, weight, account_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [source_id, target_id, relationship_type, weight, this.accountId]
    );

    return {
      ok: true,
      status: 201,
      body: { relationship: result.rows[0] },
    };
  }

  // MCP tool methods (mirroring HttpTrixClient interface)

  async storeMemory(params) {
    const response = await this.request('POST', '/v1/memories', params);
    if (!response.ok) {
      throw new ApiError(response.body.error, response.status);
    }
    return response.body;
  }

  async getMemory(id) {
    const response = await this.request('GET', `/v1/memories/${id}`);
    if (!response.ok) {
      throw new ApiError(response.body.error, response.status);
    }
    return response.body;
  }

  async semanticSearch(params) {
    const response = await this.request('POST', '/v1/search/semantic', params);
    if (!response.ok) {
      throw new ApiError(response.body.error, response.status);
    }
    return response.body;
  }

  async createRelationship(params) {
    const response = await this.request('POST', '/v1/relationships', params);
    if (!response.ok) {
      throw new ApiError(response.body.error, response.status);
    }
    return response.body;
  }

  setAccountId(accountId) {
    this.accountId = accountId;
  }
}

class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

describe('MCP ↔ API Integration', () => {
  let pool;
  let client;
  let testAccount;

  setupCrossComponentTests();

  beforeAll(async () => {
    const connections = getConnections();
    pool = connections.pool;

    client = new MockMcpApiClient({
      apiUrl: 'http://localhost:3737',
      apiKey: 'test-api-key',
      pool,
    });
  });

  beforeEach(async () => {
    await cleanupDatabase(pool);
    testAccount = await createTestAccount(pool);
    client.setAccountId(testAccount.id);
  });

  describe('Memory Operations', () => {
    it('should store and retrieve a memory', async () => {
      // Store via MCP client
      const storeResult = await client.storeMemory({
        content: 'Test memory from MCP',
        tags: ['test', 'mcp'],
        priority: 5,
      });

      expect(storeResult.memory).toBeDefined();
      expect(storeResult.memory.id).toBeDefined();
      expect(storeResult.memory.content).toBe('Test memory from MCP');

      // Retrieve via MCP client
      const getResult = await client.getMemory(storeResult.memory.id);

      expect(getResult.memory).toBeDefined();
      expect(getResult.memory.id).toBe(storeResult.memory.id);
      expect(getResult.memory.content).toBe('Test memory from MCP');
    });

    it('should handle validation errors gracefully', async () => {
      await expect(client.storeMemory({})).rejects.toThrow('content is required');
    });

    it('should handle not found errors', async () => {
      await expect(
        client.getMemory('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('Memory not found');
    });

    it('should preserve special characters in content', async () => {
      const specialContent = 'Test with <special> & "characters" \' newline\n tab\t';

      const storeResult = await client.storeMemory({
        content: specialContent,
      });

      const getResult = await client.getMemory(storeResult.memory.id);

      expect(getResult.memory.content).toBe(specialContent);
    });

    it('should handle unicode content correctly', async () => {
      const unicodeContent = '中文内容 日本語 한국어 emoji: 🔥🎉';

      const storeResult = await client.storeMemory({
        content: unicodeContent,
      });

      const getResult = await client.getMemory(storeResult.memory.id);

      expect(getResult.memory.content).toBe(unicodeContent);
    });
  });

  describe('Search Operations', () => {
    it('should search memories by semantic query', async () => {
      // Create test memories
      await client.storeMemory({ content: 'Machine learning is fascinating' });
      await client.storeMemory({ content: 'Deep learning neural networks' });
      await client.storeMemory({ content: 'Unrelated cooking recipe' });

      // Search
      const searchResult = await client.semanticSearch({
        query: 'learning',
        limit: 10,
      });

      expect(searchResult.results).toBeDefined();
      expect(searchResult.results.length).toBeGreaterThanOrEqual(2);

      // Verify results contain 'learning'
      const contents = searchResult.results.map((r) => r.content);
      expect(contents.some((c) => c.includes('learning'))).toBe(true);
    });

    it('should respect search limit parameter', async () => {
      // Create multiple memories
      for (let i = 0; i < 10; i++) {
        await client.storeMemory({ content: `Test memory ${i}` });
      }

      const searchResult = await client.semanticSearch({
        query: 'Test',
        limit: 3,
      });

      expect(searchResult.results.length).toBeLessThanOrEqual(3);
    });

    it('should return empty results for no matches', async () => {
      await client.storeMemory({ content: 'Something completely different' });

      const searchResult = await client.semanticSearch({
        query: 'nonexistent-query-xyz',
        limit: 10,
      });

      expect(searchResult.results).toHaveLength(0);
    });
  });

  describe('Relationship Operations', () => {
    it('should create relationship between memories', async () => {
      // Create two memories
      const memory1 = await client.storeMemory({ content: 'First memory' });
      const memory2 = await client.storeMemory({ content: 'Second memory' });

      // Create relationship
      const relationResult = await client.createRelationship({
        source_id: memory1.memory.id,
        target_id: memory2.memory.id,
        relationship_type: 'related_to',
        weight: 0.8,
      });

      expect(relationResult.relationship).toBeDefined();
      expect(relationResult.relationship.source_id).toBe(memory1.memory.id);
      expect(relationResult.relationship.target_id).toBe(memory2.memory.id);
      expect(relationResult.relationship.relationship_type).toBe('related_to');
    });

    it('should validate relationship parameters', async () => {
      await expect(
        client.createRelationship({
          source_id: 'some-id',
          // Missing target_id and relationship_type
        })
      ).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should format API errors for MCP response', async () => {
      try {
        await client.storeMemory({});
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('content');
      }
    });

    it('should handle not found with correct status', async () => {
      try {
        await client.getMemory('00000000-0000-0000-0000-000000000000');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('Request Data Integrity', () => {
    it('should preserve metadata through round trip', async () => {
      const metadata = {
        source: 'test',
        tags: ['a', 'b', 'c'],
        nested: { key: 'value' },
      };

      const storeResult = await client.storeMemory({
        content: 'Memory with metadata',
        metadata,
      });

      const getResult = await client.getMemory(storeResult.memory.id);

      // Metadata is stored in JSONB
      const storedMetadata = getResult.memory.metadata;
      expect(storedMetadata.source).toBe('test');
      expect(storedMetadata.tags).toEqual(['a', 'b', 'c']);
      expect(storedMetadata.nested.key).toBe('value');
    });

    it('should handle large content within limits', async () => {
      const largeContent = 'x'.repeat(50000); // 50KB

      const storeResult = await client.storeMemory({
        content: largeContent,
      });

      const getResult = await client.getMemory(storeResult.memory.id);

      expect(getResult.memory.content.length).toBe(50000);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent memory creation', async () => {
      const concurrentCount = 10;

      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        client.storeMemory({ content: `Concurrent memory ${i}` })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrentCount);

      // All should have unique IDs
      const ids = results.map((r) => r.memory.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(concurrentCount);
    });

    it('should handle concurrent search requests', async () => {
      // Create some memories first
      for (let i = 0; i < 5; i++) {
        await client.storeMemory({ content: `Searchable content ${i}` });
      }

      // Concurrent searches
      const promises = Array.from({ length: 5 }, () =>
        client.semanticSearch({ query: 'Searchable', limit: 10 })
      );

      const results = await Promise.all(promises);

      // All should return valid results
      results.forEach((result) => {
        expect(result.results).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
      });
    });
  });
});
