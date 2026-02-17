// Global variables
let socket;
let localStream;
let remoteStream;
let peerConnection;
let currentRoom;
let currentUser;
let isCallActive = false;
let isVideoEnabled = true;
let isAudioEnabled = true;

// ICE servers for WebRTC
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const videoContainer = document.getElementById('video-container');
const incomingCallModal = document.getElementById('incoming-call-modal');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const roomDisplay = document.getElementById('room-display');
const userCount = document.getElementById('user-count');

// Join Room
function joinRoom() {
  const username = document.getElementById('username-input').value.trim();
  const room = document.getElementById('room-input').value.trim();
  
  if (!username || !room) {
    alert('Please enter both username and room ID');
    return;
  }
  
  currentUser = username;
  currentRoom = room;
  
  // Connect to server
  socket = io({
  transports: ['websocket', 'polling']
  });
  
  socket.emit('join-room', room, username);
  
  // Setup socket listeners
  setupSocketListeners();
  
  // Switch screens
  loginScreen.classList.remove('active');
  appScreen.classList.add('active');
  roomDisplay.textContent = room;
}

// Setup all socket event listeners
function setupSocketListeners() {
  // User connected
  socket.on('user-connected', (userId) => {
    addSystemMessage(`${userId} joined the room`);
    updateUserCount(1);
  });
  
  // Existing users
  socket.on('existing-users', (users) => {
    updateUserCount(users.length + 1);
  });
  
  // Receive message
  socket.on('receive-message', (data) => {
    addMessage(data.userId, data.message, data.timestamp, false);
  });
  
  // User disconnected
  socket.on('user-disconnected', (userId) => {
    addSystemMessage(`${userId} left the room`);
    updateUserCount(-1);
    if (isCallActive) endCall();
  });
  
  // Incoming call
  socket.on('incoming-call', (fromUser, callType) => {
    document.getElementById('caller-name').textContent = fromUser;
    document.getElementById('call-type-text').textContent = 
      callType === 'video' ? 'video calling...' : 'voice calling...';
    incomingCallModal.classList.remove('hidden');
    isVideoEnabled = callType === 'video';
  });
  
  // Call accepted
  socket.on('call-accepted', async () => {
  // Initialize camera first if not already done
  if (!localStream) {
    try {
      const constraints = isVideoEnabled ? 
        { audio: true, video: true } : 
        { audio: true, video: false };
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localVideo.srcObject = localStream;
    } catch (err) {
      console.error('Failed to get media:', err);
      return;
    }
  }
  
  await createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', currentRoom, offer, currentUser);
});
  
  // Call rejected
  socket.on('call-rejected', () => {
    alert('Call was declined');
    stopMediaStream();
    isCallActive = false;
  });
  
  // Call ended
  socket.on('call-ended', () => {
    endCall();
  });
  
  // WebRTC signaling
  socket.on('offer', async (offer, fromUser, targetUser) => {
    if (!peerConnection) await createPeerConnection();
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', currentRoom, answer, fromUser);
  });
  
  socket.on('answer', async (answer, fromUser) => {
    await peerConnection.setRemoteDescription(answer);
  });
  
  socket.on('ice-candidate', async (candidate, fromUser) => {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding ice candidate:', e);
    }
  });
}

// Create WebRTC peer connection
async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceServers);
  
  // Add local stream
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
  
  // Handle remote stream
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };
  
  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', currentRoom, event.candidate, currentUser);
    }
  };
  
  videoContainer.classList.remove('hidden');
  isCallActive = true;
}

// Start Voice Call
async function startVoiceCall() {
  if (isCallActive) return;
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: true, 
      video: false 
    });
    localVideo.srcObject = localStream;
    isVideoEnabled = false;
    
    socket.emit('call-user', currentRoom, currentUser, 'audio');
    addSystemMessage('Calling...');
  } catch (err) {
    console.error('Error accessing microphone:', err);
    alert('Could not access microphone');
  }
}

// Start Video Call
async function startVideoCall() {
  if (isCallActive) {
    console.log("Call already active");
    return;
  }
  
  console.log("Starting video call...");
  
  try {
    // Get media first
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: true, 
      video: true 
    });
    
    console.log("Got local stream:", localStream);
    localVideo.srcObject = localStream;
    isVideoEnabled = true;
    
    // Then emit
    console.log("Emitting call-user event");
    socket.emit('call-user', currentRoom, currentUser, 'video');
    addSystemMessage('Video calling...');
    
  } catch (err) {
    console.error('Error accessing camera:', err);
    alert('Could not access camera/microphone: ' + err.message);
  }
}

// Accept incoming call
async function acceptCall() {
  incomingCallModal.classList.add('hidden');
  
  try {
    const constraints = isVideoEnabled ? 
      { audio: true, video: true } : 
      { audio: true, video: false };
    
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    
    socket.emit('accept-call', currentRoom, currentUser);
  } catch (err) {
    console.error('Error accessing media:', err);
    alert('Could not access microphone/camera: ' + err.message);
  }
}

// Reject call
function rejectCall() {
  incomingCallModal.classList.add('hidden');
  socket.emit('reject-call', currentRoom, currentUser);
  stopMediaStream();
}

// Toggle microphone
function toggleMic() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById('mic-btn').innerHTML = 
      audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : 
                           '<i class="fas fa-microphone-slash"></i>';
  }
}

// Toggle camera
function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    document.getElementById('camera-btn').innerHTML = 
      videoTrack.enabled ? '<i class="fas fa-video"></i>' : 
                          '<i class="fas fa-video-slash"></i>';
  }
}

// End call
function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  stopMediaStream();
  videoContainer.classList.add('hidden');
  isCallActive = false;
  
  socket.emit('end-call', currentRoom);
  addSystemMessage('Call ended');
}

// Stop media stream
function stopMediaStream() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
}

// Send chat message
function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;
  
  socket.emit('send-message', currentRoom, message);
  addMessage(currentUser, message, new Date().toLocaleTimeString(), true);
  messageInput.value = '';
}

// Handle enter key
function handleKeyPress(e) {
  if (e.key === 'Enter') sendMessage();
}

// Add message to chat
function addMessage(userId, text, time, isOwn) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isOwn ? 'own' : 'other'}`;
  msgDiv.innerHTML = `
    <div class="message-header">${userId}</div>
    <div class="message-text">${escapeHtml(text)}</div>
    <div class="message-time">${time}</div>
  `;
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Add system message
function addSystemMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'system-message';
  msgDiv.textContent = text;
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Update user count
function updateUserCount(change) {
  const current = parseInt(userCount.textContent);
  userCount.textContent = Math.max(1, current + change);
}

// Leave room
function leaveRoom() {
  if (isCallActive) endCall();
  socket.disconnect();
  location.reload();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Toggle emoji picker (placeholder)
function toggleEmoji() {
  messageInput.value += '😊';
}