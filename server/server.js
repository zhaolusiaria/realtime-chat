const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));
app.use(cors());

// Store connected users
const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Join room
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    users.set(socket.id, { roomId, userId });
    socket.to(roomId).emit('user-connected', userId);
    console.log(`User ${userId} joined room ${roomId}`);
    
    // Send existing users to new user
    const roomUsers = Array.from(users.values())
      .filter(u => u.roomId === roomId && u.userId !== userId)
      .map(u => u.userId);
    socket.emit('existing-users', roomUsers);
  });

  // Handle chat messages
  socket.on('send-message', (roomId, message) => {
    socket.to(roomId).emit('receive-message', {
      userId: users.get(socket.id)?.userId,
      message: message,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  // WebRTC signaling - Video/Voice call
  socket.on('offer', (roomId, offer, targetUserId) => {
    socket.to(roomId).emit('offer', offer, users.get(socket.id)?.userId, targetUserId);
  });

  socket.on('answer', (roomId, answer, targetUserId) => {
    socket.to(roomId).emit('answer', answer, users.get(socket.id)?.userId, targetUserId);
  });

  socket.on('ice-candidate', (roomId, candidate, targetUserId) => {
    socket.to(roomId).emit('ice-candidate', candidate, users.get(socket.id)?.userId, targetUserId);
  });

  // Call signaling
  socket.on('call-user', (roomId, userId, callType) => {
    socket.to(roomId).emit('incoming-call', users.get(socket.id)?.userId, callType);
  });

  socket.on('accept-call', (roomId, userId) => {
    socket.to(roomId).emit('call-accepted', users.get(socket.id)?.userId);
  });

  socket.on('reject-call', (roomId, userId) => {
    socket.to(roomId).emit('call-rejected', users.get(socket.id)?.userId);
  });

  socket.on('end-call', (roomId) => {
    socket.to(roomId).emit('call-ended', users.get(socket.id)?.userId);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      socket.to(user.roomId).emit('user-disconnected', user.userId);
      users.delete(socket.id);
      console.log('User disconnected:', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});