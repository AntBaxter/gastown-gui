import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fsPromises from 'node:fs/promises';

import { createApp } from '../../server/app/createApp.js';
import { CacheRegistry } from '../../server/infrastructure/CacheRegistry.js';
import { FormulaService } from '../../server/services/FormulaService.js';
import { registerFormulaRoutes } from '../../server/routes/formulas.js';

describe('Formula routes (real Express app)', () => {
  let server;
  let baseUrl;
  let formulasDir;

  beforeAll(async () => {
    formulasDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gastown-formulas-'));

    const cache = new CacheRegistry();
    const events = [];

    const formulaService = new FormulaService({
      gtGateway: { exec: async () => ({ ok: false, stdout: '', error: 'gt disabled in test' }) },
      bdGateway: { exec: async () => ({ ok: false, stdout: '', error: 'bd disabled in test' }) },
      cache,
      formulasDir,
      emit: (type, data) => events.push({ type, data }),
    });

    const app = createApp({ allowedOrigins: ['*'] });
    registerFormulaRoutes(app, { formulaService });

    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fsPromises.rm(formulasDir, { recursive: true, force: true });
  });

  it('DELETE /api/formula/:name deletes existing TOML file', async () => {
    const name = 'delete-me';
    const filePath = path.join(formulasDir, `${name}.toml`);
    await fsPromises.writeFile(filePath, 'x', 'utf8');

    const res = await fetch(`${baseUrl}/api/formula/${name}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    await expect(fsPromises.access(filePath)).rejects.toBeTruthy();
  });
});

