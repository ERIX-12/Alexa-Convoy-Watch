/**
 * Security and Authentication Middleware
 * API key verification, security headers, rate limiting, and boot-time secret audits.
 */

import type { Request, Response, NextFunction } from 'express';

export interface SecurityConfig {
  apiSecretKey: string;
  judgeApiKey: string;
  auditHmacSecret: string;
  isProduction: boolean;
}

export function loadSecurityConfig(): SecurityConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const apiSecretKey = process.env.API_SECRET_KEY || '';
  const judgeApiKey = process.env.JUDGE_API_KEY || 'judge-alexa-plus-demo-key-2026-v1';

  if (isProduction) {
    [
        { key: apiSecretKey, name: 'API_SECRET_KEY' },
        { key: judgeApiKey, name: 'JUDGE_API_KEY' },
        { key: process.env.AUDIT_HMAC_SECRET, name: 'AUDIT_HMAC_SECRET' }
    ].forEach(({ key, name }) => {
        if (!key || key.trim().length < 32) {
            throw new Error(`SECURITY FATAL: In production mode, ${name} must be configured and at least 32 characters in length. Refusing to boot.`);
        }
        if (key.includes('default') || key === 'MY_API_SECRET_KEY') {
             throw new Error(`SECURITY FATAL: In production mode, ${name} cannot be a placeholder or default value.`);
        }
    });
  }

  return {
    apiSecretKey: apiSecretKey || 'dev-supervisor-master-key-convoy-watch-2026',
    judgeApiKey: judgeApiKey || 'dev-judge-key-convoy-watch-2026',
    auditHmacSecret: process.env.AUDIT_HMAC_SECRET || 'dev-audit-secret-convoy-watch-2026',
    isProduction,
  };
}

/**
 * In-memory IP rate limiter (120 requests / minute)
 */
export class RateLimiter {
  private requests: Map<string, { count: number; windowStart: number }> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 120, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isRateLimited(ip: string): boolean {
    const now = Date.now();
    const client = this.requests.get(ip);

    if (!client || now - client.windowStart > this.windowMs) {
      this.requests.set(ip, { count: 1, windowStart: now });
      return false;
    }

    client.count += 1;
    if (client.count > this.maxRequests) {
      return true;
    }
    return false;
  }
}

/**
 * Creates authentication and security middleware.
 */
export function createSecurityMiddleware(config: SecurityConfig) {
  const rateLimiter = new RateLimiter(180, 60000);

  // Security Headers Middleware
  const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  };

  // Auth Guard Middleware for /mcp and /api/* (except /health)
  const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
    // Programmatic IP Rate limiting
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown-ip';
    if (rateLimiter.isRateLimited(clientIp)) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded (180 requests/min). Please back off.',
      });
      return;
    }

    // Always allow unauthenticated health check
    if (req.path === '/health' || req.path === '/api/health') {
      next();
      return;
    }

    // Extract API key from Authorization header or X-API-Key header or query parameter
    const authHeader = Array.isArray(req.headers['authorization']) 
        ? req.headers['authorization'][0] 
        : req.headers['authorization'];
    let providedKey = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.slice(7).trim();
    } else if (req.headers['x-api-key']) {
      providedKey = String(req.headers['x-api-key']).trim();
    } else if (req.query.apiKey) {
      providedKey = String(req.query.apiKey).trim();
    }

    if (!providedKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing required API key. Provide via Authorization: Bearer <key> or X-API-Key header.',
      });
      return;
    }

    const isValid =
      providedKey === config.apiSecretKey ||
      providedKey === config.judgeApiKey;

    if (!isValid) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid API key provided.',
      });
      return;
    }

    // Attach verified actor info to request
    (req as any).auth = {
      isJudge: providedKey === config.judgeApiKey,
      actor: providedKey === config.judgeApiKey ? 'JUDGE_EVALUATOR' : 'SUPERVISOR_KEY',
    };

    next();
  };

  // Authorization Guard Middleware for write endpoints
  const requireSuperuserKey = (req: Request, res: Response, next: NextFunction) => {
    const actor = (req as any).auth?.actor;
    if (actor === 'JUDGE_EVALUATOR') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'This endpoint is restricted to superuser keys (JUDGE_API_KEY is read-only).',
      });
      return;
    }
    next();
  };

  return {
    securityHeaders,
    requireApiKey,
    requireSuperuserKey,
  };
}
