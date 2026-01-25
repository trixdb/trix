/**
 * Cross-Component Integration Test Setup
 *
 * Shared setup for tests that verify communication between
 * API, Workers, MCP, and Database components.
 */

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';
import { beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

let postgresContainer;
let redisContainer;
let pool;
let redis;

/**
 * Start test containers (PostgreSQL and Redis)
 */
export async function startContainers() {
  // Start PostgreSQL with pgvector extension
  postgresContainer = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('trix_test')
    .withUsername('test')
    .withPassword('test')
    .withStartupTimeout(120000)
    .start();

  // Start Redis
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .withStartupTimeout(30000)
    .start();

  // Set environment variables from container
  process.env.POSTGRES_HOST = postgresContainer.getHost();
  process.env.POSTGRES_PORT = postgresContainer.getPort().toString();
  process.env.POSTGRES_USER = postgresContainer.getUsername();
  process.env.POSTGRES_PASSWORD = postgresContainer.getPassword();
  process.env.POSTGRES_DB = postgresContainer.getDatabase();
  process.env.REDIS_HOST = redisContainer.getHost();
  process.env.REDIS_PORT = redisContainer.getMappedPort(6379).toString();

  // Reset pool and redis so they use new env vars
  pool = null;
  redis = null;

  return getConnections();
}

/**
 * Stop test containers
 */
export async function stopContainers() {
  if (pool) {
    await pool.end();
  }
  if (redis) {
    redis.disconnect();
  }
  if (postgresContainer) {
    await postgresContainer.stop();
  }
  if (redisContainer) {
    await redisContainer.stop();
  }
}

/**
 * Get database and Redis connections
 */
export function getConnections() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'test',
      password: process.env.POSTGRES_PASSWORD || 'test',
      database: process.env.POSTGRES_DB || 'trix_test',
      max: 10,
    });
  }

  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });
  }

  return { pool, redis };
}

/**
 * Get Redis connection config for BullMQ
 */
export function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
  };
}

/**
 * Initialize test database schema
 */
export async function initializeDatabase(pool) {
  const client = await pool.connect();
  try {
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create minimal schema for testing
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(1536),
        embedding_status VARCHAR(50) DEFAULT 'pending',
        embedding_error TEXT,
        has_chunks BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS memory_chunks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        token_count INTEGER,
        char_count INTEGER,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS enrichments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        result JSONB,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS memory_relationships (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        source_id UUID REFERENCES memories(id) ON DELETE CASCADE,
        target_id UUID REFERENCES memories(id) ON DELETE CASCADE,
        relationship_type VARCHAR(50) NOT NULL,
        weight DECIMAL(3,2) DEFAULT 1.0,
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}

/**
 * Clean up test data
 */
export async function cleanupDatabase(pool) {
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE memory_chunks CASCADE');
    await client.query('TRUNCATE memory_relationships CASCADE');
    await client.query('TRUNCATE enrichments CASCADE');
    await client.query('TRUNCATE memories CASCADE');
    await client.query('TRUNCATE accounts CASCADE');
  } finally {
    client.release();
  }
}

/**
 * Clean up Redis queues
 */
export async function cleanupRedis(redis) {
  const keys = await redis.keys('bull:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Create a test account
 */
export async function createTestAccount(pool, overrides = {}) {
  const id = overrides.id || 'a0000000-0000-0000-0000-000000000001';
  const email = overrides.email || 'test@example.com';
  const name = overrides.name || 'Test Account';

  const result = await pool.query(
    `INSERT INTO accounts (id, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [id, email, name]
  );
  return result.rows[0];
}

/**
 * Create a test memory
 */
export async function createTestMemory(pool, accountId, overrides = {}) {
  const content = overrides.content || 'Test memory content';
  const metadata = overrides.metadata || {};

  const result = await pool.query(
    `INSERT INTO memories (account_id, content, metadata)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [accountId, content, JSON.stringify(metadata)]
  );
  return result.rows[0];
}

/**
 * Get memory by ID
 */
export async function getMemory(pool, memoryId) {
  const result = await pool.query('SELECT * FROM memories WHERE id = $1', [memoryId]);
  return result.rows[0] || null;
}

/**
 * Setup hook for integration tests
 */
export function setupCrossComponentTests() {
  beforeAll(async () => {
    await startContainers();
    const { pool } = getConnections();
    await initializeDatabase(pool);
  }, 120000); // 2 minute timeout for container startup

  afterAll(async () => {
    await stopContainers();
  });
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(condition, timeout = 10000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}
