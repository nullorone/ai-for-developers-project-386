import type { LoggerService, LogLevel } from '@nestjs/common';

const SENSITIVE_KEY =
  /(?:authorization|cookie|password|secret|token|idempotency.?key|guest.?email|guest.?name|comment|database.?url|rabbitmq.?url)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_CREDENTIALS = /(amqps?|postgres(?:ql)?):\/\/[^\s:@/]+:[^\s@/]+@/gi;
const BEARER = /\bBearer\s+[^\s,;]+/gi;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** One-line JSON logger with recursive key and common PII/credential redaction. */
export class JsonLogger implements LoggerService {
  private readonly enabled: ReadonlySet<LogLevel>;

  constructor(levels: readonly LogLevel[]) {
    this.enabled = new Set(levels);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: LogLevel | 'fatal', message: unknown, optionalParams: unknown[]): void {
    if (level !== 'fatal' && !this.enabled.has(level)) return;
    const params = [...optionalParams];
    const context = typeof params.at(-1) === 'string' ? String(params.pop()) : undefined;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      ...(context ? { context: this.redactString(context) } : {}),
      message: this.sanitize(message),
      ...(params.length ? { details: this.sanitize(params) } : {}),
    };
    const line = `${JSON.stringify(record)}\n`;
    (level === 'error' || level === 'fatal' ? process.stderr : process.stdout).write(line);
  }

  private sanitize(value: unknown, seen = new WeakSet<object>()): JsonValue {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value.startsWith('{') || value.startsWith('[')) {
        try {
          return this.sanitize(JSON.parse(value) as unknown, seen);
        } catch {
          // A regular message that merely starts like JSON remains a string.
        }
      }
      return this.redactString(value);
    }
    if (typeof value === 'undefined') return '[undefined]';
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'symbol') return `[Symbol(${value.description ?? ''})]`;
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (value instanceof Error) {
      return {
        name: this.redactString(value.name),
        message: this.redactString(value.message),
        ...(value.stack ? { stack: this.redactString(value.stack) } : {}),
      };
    }
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item, seen));
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : this.sanitize(item, seen);
    }
    return output;
  }

  private redactString(value: string): string {
    return value
      .replace(URL_CREDENTIALS, '$1://[REDACTED]@')
      .replace(BEARER, 'Bearer [REDACTED]')
      .replace(EMAIL, '[EMAIL]')
      .slice(0, 10_000);
  }
}
