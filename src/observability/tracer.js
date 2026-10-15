const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class OpenTelemetryTracer {
  constructor() {
    this.spans = []; // In-memory ring buffer of recent spans
    this.maxSpans = 1000;
  }

  /**
   * Starts a new OpenTelemetry-compatible span
   */
  startSpan(name, { traceId, parentSpanId, attributes = {} } = {}) {
    const span = {
      spanId: uuidv4().slice(0, 16),
      traceId: traceId || uuidv4(),
      parentSpanId: parentSpanId || null,
      name,
      kind: 'SERVER',
      startTime: Date.now(),
      endTime: null,
      durationMs: null,
      status: { code: 'UNSET' }, // 'OK' | 'ERROR' | 'UNSET'
      attributes: this._sanitizeAttributes(attributes),
      events: []
    };

    return {
      span,
      end: (statusCode = 'OK', statusMessage = null) => {
        span.endTime = Date.now();
        span.durationMs = span.endTime - span.startTime;
        span.status = { code: statusCode, message: statusMessage };
        this._recordSpan(span);
        return span;
      },
      recordException: (err) => {
        span.events.push({
          name: 'exception',
          timestamp: Date.now(),
          attributes: {
            'exception.type': err.name || 'Error',
            'exception.message': err.message || 'Unknown error'
          }
        });
        span.status = { code: 'ERROR', message: err.message };
      },
      setAttribute: (key, value) => {
        span.attributes[key] = this._sanitizeValue(value);
      }
    };
  }

  _recordSpan(span) {
    this.spans.push(span);
    if (this.spans.length > this.maxSpans) {
      this.spans.shift();
    }
  }

  /**
   * Redacts sensitive user data (PII, tokens, passwords)
   */
  _sanitizeAttributes(attrs = {}) {
    const clean = {};
    const sensitiveKeys = ['authorization', 'token', 'password', 'key', 'secret', 'email'];

    for (const [k, v] of Object.entries(attrs)) {
      if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk))) {
        clean[k] = '[REDACTED]';
      } else {
        clean[k] = this._sanitizeValue(v);
      }
    }
    return clean;
  }

  _sanitizeValue(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string' && val.length > 500) {
      return val.slice(0, 500) + '...[TRUNCATED]';
    }
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val).slice(0, 500);
      } catch {
        return '[COMPLEX_OBJECT]';
      }
    }
    return val;
  }

  getSpans({ traceId, interviewId, limit = 50 } = {}) {
    let filtered = [...this.spans];
    if (traceId) {
      filtered = filtered.filter(s => s.traceId === traceId);
    }
    if (interviewId) {
      filtered = filtered.filter(s => s.attributes['interview.id'] === interviewId || s.attributes['context.id'] === interviewId);
    }
    return filtered.slice(-limit);
  }

  clear() {
    this.spans = [];
  }
}

module.exports = new OpenTelemetryTracer();
