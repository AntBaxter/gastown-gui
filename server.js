/**
 * Gas Town GUI Bridge Server
 *
 * Node.js server that bridges the browser UI to the Gas Town CLI.
 * - Executes gt/bd commands via child_process
 * - Streams real-time events via WebSocket
 * - Serves static files
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import { createApp } from './server/app/createApp.js';
import { CommandRunner } from './server/infrastructure/CommandRunner.js';
import { CacheRegistry } from './server/infrastructure/CacheRegistry.js';
import { BDGateway } from './server/gateways/BDGateway.js';
import { GTGateway } from './server/gateways/GTGateway.js';
import { GitHubGateway } from './server/gateways/GitHubGateway.js';
import { TmuxGateway } from './server/gateways/TmuxGateway.js';
import { AgentService } from './server/services/AgentService.js';
import { BeadService } from './server/services/BeadService.js';
import { ConvoyService } from './server/services/ConvoyService.js';
import { CrewService } from './server/services/CrewService.js';
import { DoctorService } from './server/services/DoctorService.js';
import { FormulaService } from './server/services/FormulaService.js';
import { GitHubService } from './server/services/GitHubService.js';
import { MailService } from './server/services/MailService.js';
import { NudgeService } from './server/services/NudgeService.js';
import { RigService } from './server/services/RigService.js';
import { ServiceControlService } from './server/services/ServiceControlService.js';
import { StatusService } from './server/services/StatusService.js';
import { TargetService } from './server/services/TargetService.js';
import { WorkService } from './server/services/WorkService.js';
import { registerAgentRoutes } from './server/routes/agents.js';
import { registerBeadRoutes } from './server/routes/beads.js';
import { registerConvoyRoutes } from './server/routes/convoys.js';
import { registerCrewRoutes } from './server/routes/crews.js';
import { registerDoctorRoutes } from './server/routes/doctor.js';
import { registerFormulaRoutes } from './server/routes/formulas.js';
import { registerGitHubRoutes } from './server/routes/github.js';
import { registerMailRoutes } from './server/routes/mail.js';
import { registerNudgeRoutes } from './server/routes/nudge.js';
import { registerRigRoutes } from './server/routes/rigs.js';
import { registerServiceRoutes } from './server/routes/services.js';
import { registerStatusRoutes } from './server/routes/status.js';
import { registerTargetRoutes } from './server/routes/targets.js';
import { registerWorkRoutes } from './server/routes/work.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.GASTOWN_PORT || 7667;
const HOST = process.env.HOST || '127.0.0.1';
const HOME = process.env.HOME || os.homedir();
const GT_ROOT = process.env.GT_ROOT || path.join(HOME, 'gt');

// ============= Infrastructure =============

const commandRunner = new CommandRunner();
const backendCache = new CacheRegistry();

// Cache cleanup interval — removes expired entries to prevent memory leaks
const CACHE_CLEANUP_INTERVAL = 60000;
setInterval(() => {
  const cleaned = backendCache.cleanup();
  if (cleaned > 0) {
    console.log(`[Cache] Cleaned ${cleaned} expired entries`);
  }
}, CACHE_CLEANUP_INTERVAL);

// ============= Gateways =============

const gtGateway = new GTGateway({ runner: commandRunner, gtRoot: GT_ROOT });
const bdGateway = new BDGateway({ runner: commandRunner, gtRoot: GT_ROOT });
const tmuxGateway = new TmuxGateway({ runner: commandRunner });
const gitHubGateway = new GitHubGateway({ runner: commandRunner });

// ============= WebSocket =============

const defaultOrigins = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : defaultOrigins;
const allowNullOrigin = process.env.ALLOW_NULL_ORIGIN === 'true';

const app = createApp({ allowedOrigins, allowNullOrigin });
const server = createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function emit(type, data) {
  broadcast({ type, data });
}

// ============= Services =============

const statusService = new StatusService({ gtGateway, tmuxGateway, cache: backendCache, gtRoot: GT_ROOT });
const targetService = new TargetService({ statusService });
const convoyService = new ConvoyService({ gtGateway, cache: backendCache, emit });
const beadService = new BeadService({ bdGateway, statusService, cache: backendCache, emit });
const workService = new WorkService({ gtGateway, bdGateway, emit });
const gitHubService = new GitHubService({ gitHubGateway, statusService, cache: backendCache });
const mailService = new MailService({ gtGateway, cache: backendCache, gtRoot: GT_ROOT });
const nudgeService = new NudgeService({ gtGateway, statusService, tmuxGateway, emit });
const agentService = new AgentService({ gtGateway, statusService, tmuxGateway, bdGateway, cache: backendCache, gtRoot: GT_ROOT, emit });
const rigService = new RigService({ gtGateway, bdGateway, cache: backendCache, gtRoot: GT_ROOT, emit });
const crewService = new CrewService({ gtGateway, cache: backendCache, emit });
const doctorService = new DoctorService({ gtGateway, cache: backendCache });
const serviceControlService = new ServiceControlService({ gtGateway, statusService, tmuxGateway, emit });

const formulaCache = {
  get: (key) => backendCache.get(key),
  set: (key, value, ttlMs) => backendCache.set(key, value, ttlMs),
  delete: (key) => backendCache.delete(key),
};
const formulaService = new FormulaService({ gtGateway, bdGateway, cache: formulaCache, emit });

// ============= Static Files =============

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'assets', 'favicon.ico'));
});

// ============= REST API Routes =============

registerStatusRoutes(app, { statusService });
registerConvoyRoutes(app, { convoyService });
registerWorkRoutes(app, { workService });
registerBeadRoutes(app, { beadService });
registerTargetRoutes(app, { targetService });
registerMailRoutes(app, { mailService });
registerNudgeRoutes(app, { nudgeService });
registerAgentRoutes(app, { agentService });
registerRigRoutes(app, { rigService });
registerCrewRoutes(app, { crewService });
registerDoctorRoutes(app, { doctorService });
registerServiceRoutes(app, { serviceControlService });
registerFormulaRoutes(app, { formulaService });
registerGitHubRoutes(app, { gitHubService });

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============= Activity Stream =============

let activityProcess = null;

function parseActivityLine(line) {
  const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s+(.+?)\s+(\S+)\s+(.+)$/u);
  if (!match) return null;

  const [, time, symbol, target, rest] = match;
  const [action, ...descParts] = rest.split(' · ');

  const typeMap = {
    '+': 'bead_created', '→': 'bead_updated', '✓': 'work_complete',
    '✗': 'work_failed', '⊘': 'bead_deleted', '📌': 'bead_pinned',
    '🦉': 'patrol_started', '⚡': 'agent_nudged', '🎯': 'work_slung',
    '🤝': 'handoff', '⚙': 'merge_started', '🚀': 'convoy_created',
    '📦': 'convoy_updated',
  };

  // Build a real timestamp from the HH:MM:SS in the feed line
  const today = new Date();
  const [hh, mm, ss] = time.split(':').map(Number);
  const eventDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hh, mm, ss);
  // If the parsed time is in the future (e.g. feed line from just before midnight),
  // assume it was yesterday
  if (eventDate > today) {
    eventDate.setDate(eventDate.getDate() - 1);
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    time,
    type: typeMap[symbol.trim()] || 'system',
    target,
    action: action.trim(),
    message: descParts.join(' · ').trim(),
    summary: `${action.trim()}${descParts.length ? ': ' + descParts.join(' · ').trim() : ''}`,
    timestamp: eventDate.toISOString(),
  };
}

function startActivityStream() {
  if (activityProcess) return;

  console.log('[WS] Starting activity stream...');
  activityProcess = spawn('gt', ['feed', '--plain', '--follow'], { cwd: GT_ROOT });

  activityProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => {
      const event = parseActivityLine(line);
      if (event) broadcast({ type: 'activity', data: event });
    });
  });

  activityProcess.stderr.on('data', (data) => {
    console.error(`[Activity] stderr: ${data}`);
  });

  activityProcess.on('close', (code) => {
    console.log(`[Activity] Process exited with code ${code}`);
    activityProcess = null;
    if (clients.size > 0) {
      setTimeout(startActivityStream, 5000);
    }
  });
}

// ============= WebSocket Connection Handler =============

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  clients.add(ws);

  if (clients.size === 1) startActivityStream();

  statusService
    .getStatus({ refresh: false })
    .then((data) => {
      if (data && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'status', data }));
      }
    })
    .catch((err) => {
      console.error('[WS] Error getting initial status:', err.message);
    });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    clients.delete(ws);
    if (clients.size === 0 && activityProcess) {
      activityProcess.kill();
      activityProcess = null;
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] Error:', error);
  });
});

// ============= Start Server =============

server.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
  console.log(`
╔══════════════════════════════════════════════════════════╗
║              GAS TOWN GUI SERVER                         ║
╠══════════════════════════════════════════════════════════╣
║  URL:        http://${displayHost}:${PORT}                       ║
║  GT_ROOT:    ${GT_ROOT.padEnd(40)}║
║  WebSocket:  ws://${displayHost}:${PORT}/ws                      ║
╚══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  if (activityProcess) activityProcess.kill();
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});
