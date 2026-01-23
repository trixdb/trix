# Production Readiness Checklist

> A comprehensive checklist for operators before deploying Trix to production.

## How to Use This Checklist

1. Work through each section systematically before production deployment
2. Mark items complete with `[x]` as you verify them
3. Keep a copy of this checklist with your deployment documentation
4. Re-run this checklist after major configuration changes

---

## 1. Environment Variables

### 1.1 Required Variables Are Set (Not Placeholders)

- [ ] `DATABASE_URL` - Valid PostgreSQL connection string (not localhost in production)
- [ ] `REDIS_URL` - Valid Redis/Valkey connection string
- [ ] `JWT_SECRET` - Cryptographically random, at least 32 characters
- [ ] `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` - Valid API key for your LLM provider
- [ ] `EMBEDDING_PROVIDER` - Set to production provider (not `mock`)
- [ ] `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` - Valid S3/R2 credentials

### 1.2 Optional But Recommended

- [ ] `ASSEMBLYAI_API_KEY` - If using transcription features
- [ ] `ASSEMBLYAI_WEBHOOK_SECRET` - Unique secret, not the example value
- [ ] `COHERE_API_KEY` - If using search reranking
- [ ] `LOOPS_API_KEY` - If using email notifications
- [ ] `PADDLE_API_KEY` - If using billing features
- [ ] `INTEGRATION_ENCRYPTION_KEY` - If using third-party integrations

### 1.3 Environment Mode

- [ ] `NODE_ENV=production` - Set on all services
- [ ] `LOG_LEVEL=info` or `warn` - Not `debug` in production
- [ ] `AUTO_MIGRATE=true` or migrations run separately - Database migrations applied
- [ ] `RESET_DATABASE=false` - NEVER true in production

---

## 2. Database Security

### 2.1 Credentials

- [ ] PostgreSQL password is at least 16 characters
- [ ] Password contains mixed case, numbers, and symbols
- [ ] Password is NOT a dictionary word or common pattern
- [ ] Password is NOT `trix`, `admin`, `password`, `postgres`, or any default
- [ ] Database user has minimal required privileges (not superuser if possible)

### 2.2 Connection Security

- [ ] Database is NOT exposed to public internet (use private networking)
- [ ] SSL/TLS enabled for database connections (`?sslmode=require` in URL)
- [ ] Connection pooling configured appropriately for expected load
- [ ] `DB_POOL_MAX` set based on database max_connections

### 2.3 Backups

- [ ] Automated database backups configured (daily minimum)
- [ ] Backup retention policy defined (recommend 30+ days)
- [ ] Backup restoration tested and documented
- [ ] Point-in-time recovery enabled if available

---

## 3. Redis/Valkey Security

### 3.1 Credentials

- [ ] Redis password set (not empty) if Redis is network-accessible
- [ ] Password is cryptographically random, at least 32 characters
- [ ] `REDIS_PASSWORD` environment variable matches server configuration

### 3.2 Connection Security

- [ ] Redis is NOT exposed to public internet
- [ ] `REDIS_TLS=true` if connecting over network
- [ ] `REDIS_TLS_REJECT_UNAUTHORIZED=true` in production
- [ ] maxmemory-policy configured (recommend `allkeys-lru`)

---

## 4. API Keys and Secrets

### 4.1 Generation Standards

- [ ] All secrets generated with: `openssl rand -hex 32` or equivalent
- [ ] No secrets copied from documentation examples
- [ ] No secrets shared between environments (dev/staging/prod)

### 4.2 Secret Management

- [ ] Secrets stored in secrets manager (AWS Secrets Manager, Vault, etc.)
- [ ] Secrets NOT committed to version control
- [ ] `.env` files added to `.gitignore`
- [ ] Secrets rotated on suspected compromise
- [ ] Access to secrets audited and logged

### 4.3 API Key Security

- [ ] Third-party API keys (OpenAI, Anthropic, etc.) have spending limits
- [ ] API keys scoped to minimum required permissions
- [ ] Separate API keys for production vs development

---

## 5. Rate Limiting

### 5.1 Configuration

- [ ] `RATE_LIMIT_ACCOUNT_MAX_REQUESTS` set appropriately (default: 1000/min)
- [ ] `TRANSCRIPTION_RATE_LIMIT_UPLOADS_PER_HOUR` set (default: 10)
- [ ] `TRANSCRIPTION_RATE_LIMIT_REQUESTS_PER_HOUR` set (default: 20)
- [ ] Rate limits tested under expected peak load

### 5.2 DDoS Protection

- [ ] Upstream rate limiting (Cloudflare, AWS WAF, etc.) configured
- [ ] IP-based rate limiting at edge/load balancer
- [ ] Bot detection/CAPTCHA for registration endpoints

---

## 6. SSL/TLS Configuration

### 6.1 HTTPS Enforcement

- [ ] All production endpoints served over HTTPS only
- [ ] HTTP redirects to HTTPS (301 permanent)
- [ ] HSTS header enabled with appropriate max-age
- [ ] TLS 1.2+ only (TLS 1.0/1.1 disabled)

### 6.2 Certificate Management

- [ ] Valid SSL certificate from trusted CA (not self-signed)
- [ ] Certificate covers all production domains
- [ ] Auto-renewal configured (Let's Encrypt, managed certs, etc.)
- [ ] Certificate expiry monitoring in place

---

## 7. Logging Configuration

### 7.1 Log Levels

- [ ] `LOG_LEVEL` is `info` or `warn` (not `debug` or `trace`)
- [ ] Sensitive data NOT logged (passwords, tokens, PII)
- [ ] API keys masked in logs (showing only last 4 characters)

### 7.2 Log Management

- [ ] Logs shipped to aggregation service (Datadog, CloudWatch, etc.)
- [ ] Log retention policy defined (recommend 90+ days for security)
- [ ] Log rotation configured to prevent disk exhaustion
- [ ] Structured logging enabled (JSON format)

### 7.3 Audit Logging

- [ ] Authentication events logged (login, logout, failures)
- [ ] Admin actions logged with user context
- [ ] Data access patterns logged for sensitive operations

---

## 8. Health Check Endpoints

### 8.1 Endpoint Availability

- [ ] `/health` endpoint returns 200 OK when healthy
- [ ] Health check includes database connectivity test
- [ ] Health check includes Redis connectivity test
- [ ] Response time under 1 second

### 8.2 Load Balancer Integration

- [ ] Health check URL configured in load balancer
- [ ] Appropriate health check interval (recommend 30s)
- [ ] Unhealthy threshold configured (recommend 2-3 failures)
- [ ] Healthy threshold configured (recommend 2 successes)

### 8.3 Kubernetes/Container Probes (if applicable)

- [ ] Liveness probe configured (`/health`)
- [ ] Readiness probe configured (`/health/ready` or `/health`)
- [ ] Startup probe configured for slow-starting containers
- [ ] Probe timeouts appropriate for your infrastructure

---

## 9. Backup Strategy

### 9.1 Data Backups

- [ ] PostgreSQL: Automated daily backups
- [ ] Redis: RDB snapshots or AOF persistence configured
- [ ] S3/Object Storage: Versioning enabled on buckets
- [ ] Encryption at rest enabled for all backup storage

### 9.2 Disaster Recovery

- [ ] Recovery Time Objective (RTO) defined and tested
- [ ] Recovery Point Objective (RPO) defined and achievable
- [ ] Backup restoration documented and tested quarterly
- [ ] Cross-region backup replication (if required)

### 9.3 Configuration Backups

- [ ] Infrastructure-as-code stored in version control
- [ ] Environment configurations documented
- [ ] Secrets backup procedure documented (encrypted)

---

## 10. Monitoring and Alerting

### 10.1 Infrastructure Monitoring

- [ ] CPU, memory, disk usage monitored
- [ ] Network throughput and latency monitored
- [ ] Database connection pool utilization monitored
- [ ] Container/pod health monitored

### 10.2 Application Monitoring

- [ ] Request rate and latency (p50, p95, p99) tracked
- [ ] Error rate tracked (target: <1%)
- [ ] Slow query logging enabled
- [ ] Memory leak detection (heap size over time)

### 10.3 Alerting Rules

- [ ] Error rate > 5% triggers alert
- [ ] P99 latency > 5s triggers alert
- [ ] Database connection pool > 80% triggers alert
- [ ] Disk usage > 80% triggers alert
- [ ] Certificate expiry < 14 days triggers alert

### 10.4 On-Call and Escalation

- [ ] On-call rotation defined
- [ ] Escalation policy documented
- [ ] Runbooks created for common incidents
- [ ] Contact information current

---

## 11. Security Hardening

### 11.1 Network Security

- [ ] Services in private network/VPC
- [ ] Only necessary ports exposed
- [ ] Firewall rules configured (allow-list approach)
- [ ] No SSH keys or credentials in containers

### 11.2 Container Security

- [ ] Containers run as non-root user
- [ ] Base images from trusted sources
- [ ] No unnecessary packages installed
- [ ] Read-only root filesystem where possible

### 11.3 Dependency Security

- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] Automated dependency scanning (Snyk, Dependabot)
- [ ] Security patches applied within defined SLA

### 11.4 Access Control

- [ ] Production access restricted to essential personnel
- [ ] MFA required for all production access
- [ ] Access logs retained and reviewed
- [ ] Service accounts use least-privilege principle

---

## 12. Performance Validation

### 12.1 Load Testing

- [ ] Load tested at 2x expected peak traffic
- [ ] Sustained load test (10+ minutes) completed
- [ ] No memory leaks observed under load
- [ ] Response times acceptable under load

### 12.2 Resource Sizing

- [ ] Database pool size appropriate for load
- [ ] Worker concurrency tuned for CPU/memory
- [ ] Timeouts set appropriately (not too short, not too long)
- [ ] Auto-scaling configured (if applicable)

---

## 13. CORS and Security Headers

### 13.1 CORS Configuration

- [ ] `CORS_ORIGINS` set to specific allowed domains
- [ ] NO wildcard (`*`) in production CORS
- [ ] Only trusted domains listed

### 13.2 Security Headers

- [ ] Content-Security-Policy configured
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] Referrer-Policy configured

---

## 14. Email Configuration (if applicable)

### 14.1 Transactional Email

- [ ] Email provider configured (Loops, Mailgun, etc.)
- [ ] SPF, DKIM, DMARC records configured for sending domain
- [ ] From address uses your domain (not provider default)
- [ ] Unsubscribe links included where required

### 14.2 Email Security

- [ ] Webhook secrets set for email provider callbacks
- [ ] `INBOUND_EMAIL_SKIP_SENDER_VERIFICATION=false` in production

---

## 15. Billing Configuration (if applicable)

### 15.1 Payment Provider

- [ ] `PADDLE_ENVIRONMENT=production` (not sandbox)
- [ ] Production API keys configured
- [ ] Webhook secret set and tested
- [ ] Product IDs match production catalog

### 15.2 Billing Security

- [ ] Webhook signature verification enabled
- [ ] Test transactions completed successfully
- [ ] Refund process documented and tested

---

## Pre-Deployment Final Checks

- [ ] All checklist items above completed
- [ ] Configuration validated: `node scripts/validate-config.js --service=api`
- [ ] Migrations tested on staging first
- [ ] Rollback plan documented and tested
- [ ] Team notified of deployment window
- [ ] Monitoring dashboards ready

---

## Post-Deployment Verification

- [ ] Health check endpoint returning 200
- [ ] Can authenticate and create/retrieve memories
- [ ] Logs appearing in aggregation service
- [ ] Metrics appearing in monitoring dashboards
- [ ] No unexpected errors in first 30 minutes
- [ ] Performance within expected parameters

---

## Quick Reference: Secret Generation Commands

```bash
# Generate JWT secret (64 bytes)
openssl rand -base64 64

# Generate hex secret (32 bytes)
openssl rand -hex 32

# Generate URL-safe secret
openssl rand -base64 32 | tr '+/' '-_'

# Generate strong password
openssl rand -base64 24
```

---

## Related Documentation

- `trix-api/.env.example` - API configuration reference
- `trix-workers-node/.env.docker.example` - Worker configuration reference
- `trix-mcp/` - MCP server configuration
- `CONFIGURATION.md` - Unified configuration guide
- `SECURITY.md` - Security policies and procedures

---

*Last updated: 2026-01-23*
