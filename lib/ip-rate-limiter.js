/**
 * IP-Based Rate Limiter
 */

class IpRateLimiter {
    constructor(maxAttempts, windowMs) {
        this.maxAttempts = maxAttempts;
        this.windowMs = windowMs;
        this.attempts = new Map();
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    getClientIp(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               'unknown';
    }

    check(req) {
        const ip = this.getClientIp(req);
        const now = Date.now();
        const record = this.attempts.get(ip);

        if (!record || now > record.resetTime) {
            this.attempts.set(ip, { count: 1, resetTime: now + this.windowMs });
            return { allowed: true, remaining: this.maxAttempts - 1, resetTime: now + this.windowMs, ip };
        }

        if (record.count >= this.maxAttempts) {
            return { allowed: false, remaining: 0, resetTime: record.resetTime, ip };
        }

        record.count++;
        return { allowed: true, remaining: this.maxAttempts - record.count, resetTime: record.resetTime, ip };
    }

    cleanup() {
        const now = Date.now();
        for (const [ip, record] of this.attempts.entries()) {
            if (now > record.resetTime) this.attempts.delete(ip);
        }
    }
}

const loginRateLimiter = new IpRateLimiter(10, 15 * 60 * 1000);
const apiRateLimiter = new IpRateLimiter(100, 60 * 1000);

module.exports = { IpRateLimiter, loginRateLimiter, apiRateLimiter };
