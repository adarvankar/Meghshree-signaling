/**
 * Meghshree Remote - Signaling Server
 * Handles WebRTC negotiation, chat relay, and control commands
 * Run: node server.js
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 50 * 1024 * 1024, // 50 MB for file chunks
});

const PORT = process.env.PORT || 3000;

// Active sessions: sessionId -> { tech: socketId, client: socketId }
const sessions = new Map();

app.get('/health', (req, res) => res.json({ status: 'ok', sessions: sessions.size }));

// Serve a simple session ID generator page (optional helper)
app.get('/', (req, res) => res.send(`
  <h2>Meghshree Remote - Signaling Server</h2>
  <p>Active sessions: ${sessions.size}</p>
  <p>Status: Running on port ${PORT}</p>
`));

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ─── Session Management ───────────────────────────────────────────────────

  // Technician creates a session and waits for a client
  socket.on('create-session', ({ sessionId }) => {
    sessions.set(sessionId, { tech: socket.id, client: null });
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.role = 'tech';
    console.log(`[Session] Created: ${sessionId} by tech ${socket.id}`);
    socket.emit('session-created', { sessionId });
  });

  // Client joins using the 6-digit session code
  socket.on('join-session', ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session) {
      socket.emit('error', { message: 'Invalid session ID. Please check the code.' });
      return;
    }
    if (session.client) {
      socket.emit('error', { message: 'Session already has a connected client.' });
      return;
    }
    session.client = socket.id;
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.role = 'client';
    console.log(`[Session] Client ${socket.id} joined session ${sessionId}`);

    // Notify tech that client is connected
    socket.to(session.tech).emit('client-connected', { sessionId });
    socket.emit('session-joined', { sessionId });
  });

  // ─── WebRTC Signaling ─────────────────────────────────────────────────────

  socket.on('webrtc-offer', ({ sessionId, offer }) => {
    socket.to(sessionId).emit('webrtc-offer', { offer });
  });

  socket.on('webrtc-answer', ({ sessionId, answer }) => {
    socket.to(sessionId).emit('webrtc-answer', { answer });
  });

  socket.on('webrtc-ice-candidate', ({ sessionId, candidate }) => {
    socket.to(sessionId).emit('webrtc-ice-candidate', { candidate });
  });

  // ─── Chat ─────────────────────────────────────────────────────────────────

  socket.on('chat-message', ({ sessionId, message, sender }) => {
    const timestamp = new Date().toLocaleTimeString();
    io.to(sessionId).emit('chat-message', { message, sender, timestamp });
  });

  // ─── Remote Commands (Technician → Client) ────────────────────────────────

  // Mouse move / click — send to CLIENT (session.tech = create-session caller = customer's PC)
  socket.on('remote-mouse', ({ sessionId, x, y, type, button }) => {
    const session = sessions.get(sessionId);
    if (session?.tech) {
      io.to(session.tech).emit('remote-mouse', { x, y, type, button });
    }
  });

  // Keyboard input — send to CLIENT
  socket.on('remote-key', ({ sessionId, key, type }) => {
    const session = sessions.get(sessionId);
    if (session?.tech) {
      io.to(session.tech).emit('remote-key', { key, type });
    }
  });

  // Special commands — send to CLIENT
  socket.on('remote-command', ({ sessionId, command }) => {
    const session = sessions.get(sessionId);
    if (session?.tech) {
      console.log(`[Command] ${command} → session ${sessionId}`);
      io.to(session.tech).emit('remote-command', { command });
    }
  });

  // ─── File Transfer ────────────────────────────────────────────────────────

  // Relay file chunks via signaling server (for small files)
  // Large files use WebRTC DataChannel directly (faster)
  socket.on('file-chunk', ({ sessionId, chunk, fileName, chunkIndex, totalChunks }) => {
    socket.to(sessionId).emit('file-chunk', { chunk, fileName, chunkIndex, totalChunks });
  });

  socket.on('file-transfer-start', ({ sessionId, fileName, fileSize, totalChunks }) => {
    socket.to(sessionId).emit('file-transfer-start', { fileName, fileSize, totalChunks });
  });

  socket.on('file-transfer-complete', ({ sessionId, fileName }) => {
    socket.to(sessionId).emit('file-transfer-complete', { fileName });
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const { sessionId, role } = socket;
    if (sessionId && sessions.has(sessionId)) {
      console.log(`[-] Disconnected: ${socket.id} (${role}) from session ${sessionId}`);
      socket.to(sessionId).emit('peer-disconnected', { role });

      if (role === 'tech') {
        sessions.delete(sessionId);
        console.log(`[Session] Closed: ${sessionId}`);
      } else if (role === 'client') {
        const session = sessions.get(sessionId);
        if (session) session.client = null;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ Meghshree Remote Signaling Server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
});
