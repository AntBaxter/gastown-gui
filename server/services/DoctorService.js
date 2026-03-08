export class DoctorService {
  constructor({ gtGateway, cache, doctorTtlMs = 30000 } = {}) {
    if (!gtGateway) throw new Error('DoctorService requires gtGateway');
    this._gt = gtGateway;
    this._cache = cache ?? null;
    this._doctorTtlMs = doctorTtlMs;
  }

  async check({ refresh = false } = {}) {
    if (!refresh && this._cache?.get) {
      const cached = this._cache.get('doctor');
      if (cached !== undefined) return cached;
    }

    // Try with --json first
    let result = await this._gt.doctor({ json: true });
    if (result.ok && result.data) {
      this._cache?.set?.('doctor', result.data, this._doctorTtlMs);
      return result.data;
    }

    // If JSON parse failed but we have output, return raw
    if (result.ok && result.raw) {
      const response = { raw: result.raw, checks: [] };
      this._cache?.set?.('doctor', response, this._doctorTtlMs);
      return response;
    }

    // Fallback: try without --json
    result = await this._gt.doctor({ json: false });
    if (result.ok || result.raw) {
      const response = this._parseTextOutput(result.raw);
      this._cache?.set?.('doctor', response, this._doctorTtlMs);
      return response;
    }

    // Both failed
    const response = {
      checks: [],
      raw: result.error || 'gt doctor command not available',
      error: result.error,
    };
    this._cache?.set?.('doctor', response, 10000);
    return response;
  }

  async fix() {
    const result = await this._gt.doctorFix();
    this._cache?.delete?.('doctor');
    return {
      success: result.ok,
      output: result.raw || '',
      error: result.ok ? undefined : result.error,
    };
  }

  _parseTextOutput(text) {
    const lines = (text || '').split('\n');
    const checks = [];
    let currentCheck = null;

    for (const line of lines) {
      const checkMatch = line.match(/^([✓✔✗✘×⚠!])\s*([^:]+):\s*(.+)$/);

      if (checkMatch) {
        if (currentCheck) checks.push(currentCheck);

        const [, symbol, checkName, description] = checkMatch;
        const status = '✓✔'.includes(symbol) ? 'pass' : '✗✘×'.includes(symbol) ? 'fail' : 'warn';

        currentCheck = {
          id: checkName.trim(),
          name: checkName.trim(),
          description: description.trim(),
          status,
          details: [],
          fix: null,
        };
      } else if (currentCheck) {
        const detailMatch = line.match(/^\s{4}(.+)$/);
        if (detailMatch) {
          const detail = detailMatch[1].trim();
          if (detail.startsWith('→')) {
            currentCheck.fix = detail.substring(1).trim();
          } else {
            currentCheck.details.push(detail);
          }
        }
      }
    }

    if (currentCheck) checks.push(currentCheck);

    const summaryMatch = text.match(/(\d+)\s*checks?,\s*(\d+)\s*passed?,\s*(\d+)\s*warnings?,\s*(\d+)\s*errors?/);
    const summary = summaryMatch ? {
      total: parseInt(summaryMatch[1]),
      passed: parseInt(summaryMatch[2]),
      warnings: parseInt(summaryMatch[3]),
      errors: parseInt(summaryMatch[4]),
    } : null;

    return { checks, summary, raw: text };
  }
}
