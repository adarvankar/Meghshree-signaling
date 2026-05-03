/**
 * Meghshree Remote - Signaling Server
 * Deploy this on Render (repo: adarvankar/Meghshree-signaling)
 *
 * Session roles:
 *   session.tech   = customer's browser socket (called create-session)
 *   session.client = technician's app socket   (called join-session)
 *
 * Control commands flow: technician → server → session.tech (customer PC)
 */

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 50 * 1024 * 1024, // 50 MB for file chunks
});

const PORT = process.env.PORT || 3000;

// Active sessions: sessionId → { tech: socketId, client: socketId }
const sessions = new Map();

// ─── Static / Health ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', sessions: sessions.size })
);

// ─── Socket.IO ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Session Management ───────────────────────────────────────────────────

  // Customer's browser calls this → stored as session.tech
  socket.on('create-session', ({ sessionId }) => {
    sessions.set(sessionId, { tech: socket.id, client: null });
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.role      = 'tech';
    console.log(`[Session] Created: ${sessionId} by customer ${socket.id}`);
    socket.emit('session-created', { sessionId });
  });

  // Technician app calls this → stored as session.client
  socket.on('join-session', ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session) {
      socket.emit('error', { message: 'Invalid session code. Ask the customer to refresh.' });
      return;
    }
    if (session.client) {
      socket.emit('error', { message: 'Session already has a connected technician.' });
      return;
    }
    session.client  = socket.id;
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.role      = 'client';
    console.log(`[Session] Tech ${socket.id} joined session ${sessionId}`);

    // Tell customer that tech has connected
    io.to(session.tech).emit('client-connected', { sessionId });
    socket.emit('session-joined', { sessionId });
  });

  // ── WebRTC Signaling ─────────────────────────────────────────────────────

  socket.on('webrtc-offer', ({ sessionId, offer }) => {
    socket.to(sessionId).emit('webrtc-offer', { offer });
  });

  socket.on('webrtc-answer', ({ sessionId, answer }) => {
    socket.to(sessionId).emit('webrtc-answer', { answer });
  });

  socket.on('webrtc-ice-candidate', ({ sessionId, candidate }) => {
    socket.to(sessionId).emit('webrtc-ice-candidate', { candidate });
  });

  // ── Chat ─────────────────────────────────────────────────────────────────

  socket.on('chat-message', ({ sessionId, message, sender, timestamp }) => {
    const ts = timestamp || new Date().toLocaleTimeString();
    io.to(sessionId).emit('chat-message', { message, sender, timestamp: ts });
  });

  // ── Remote Control: Technician → Customer PC ─────────────────────────────
  // session.tech holds the CUSTOMER's socket id (they called create-session)

  socket.on('remote-mouse', ({ sessionId, x, y, type, button }) => {
    const session = sessions.get(sessionId);
    if (session?.tech) {
      io.to(session.tech).emit('remote-mouse', { x, y, type, button });
    }
  });

  socket.on('remote-key', ({ sessionId, key, type }) => {
    const session = sessions.get(sessionId);
    if (session?.tech) {
      io.to(session.tech).emit('remote-key', { key, type });
    }
  });

  socket.on('remote-command', ({ sessionId, command }) => {
    const session = sessions.get(sessionId);
    if (session?.tech) {
      console.log(`[Command] ${command} → session ${sessionId}`);
      io.to(session.tech).emit('remote-command', { command });
    }
  });

  // ── File Transfer: Technician → Customer ─────────────────────────────────

  socket.on('file-transfer-start', ({ sessionId, fileName, fileSize, totalChunks }) => {
    socket.to(sessionId).emit('file-transfer-start', { fileName, fileSize, totalChunks });
  });

  socket.on('file-chunk', ({ sessionId, chunk, fileName, chunkIndex, totalChunks }) => {
    socket.to(sessionId).emit('file-chunk', { chunk, fileName, chunkIndex, totalChunks });
  });

  socket.on('file-transfer-complete', ({ sessionId, fileName }) => {
    socket.to(sessionId).emit('file-transfer-complete', { fileName });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const { sessionId, role } = socket;
    if (!sessionId || !sessions.has(sessionId)) return;

    console.log(`[-] Disconnected: ${socket.id} (${role}) from session ${sessionId}`);
    socket.to(sessionId).emit('peer-disconnected', { role });

    if (role === 'tech') {
      // Customer left — close session entirely
      sessions.delete(sessionId);
      console.log(`[Session] Closed: ${sessionId}`);
    } else if (role === 'client') {
      // Technician left — session stays so customer doesn't have to refresh
      const session = sessions.get(sessionId);
      if (session) session.client = null;
    }
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n✅ Meghshree Remote Signaling Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
