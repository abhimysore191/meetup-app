const socket = io();

let currentUser = null;
let localStream = null;
let peerConnection = null;
let partnerId = null;
let isMuted = false;
let isCamOff = false;

const registerScreen = document.getElementById('register-screen');
const mainScreen = document.getElementById('main-screen');
const registerForm = document.getElementById('register-form');
const userDisplay = document.getElementById('user-display');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const remotePlaceholder = document.getElementById('remote-placeholder');
const remoteInfo = document.getElementById('remote-info');
const statusEl = document.getElementById('status');
const nextBtn = document.getElementById('next-btn');
const muteBtn = document.getElementById('mute-btn');
const camBtn = document.getElementById('cam-btn');
const reportBtn = document.getElementById('report-btn');
const blockBtn = document.getElementById('block-btn');
const logoutBtn = document.getElementById('logout-btn');

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function setStatus(msg) { statusEl.textContent = msg; }

function loadUser() {
  const saved = localStorage.getItem('meetup_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    showMain();
  }
}

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const interestsRaw = document.getElementById('interests').value;
  currentUser = {
    username: document.getElementById('username').value.trim(),
    age: parseInt(document.getElementById('age').value),
    gender: document.getElementById('gender').value,
    preferGender: document.getElementById('preferGender').value,
    interests: interestsRaw ? interestsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [],
    bio: document.getElementById('bio').value.trim()
  };
  if (currentUser.age < 18) { alert('Must be 18+'); return; }
  localStorage.setItem('meetup_user', JSON.stringify(currentUser));
  showMain();
});

function showMain() {
  registerScreen.classList.remove('active');
  mainScreen.classList.add('active');
  userDisplay.textContent = currentUser.username;
  socket.emit('register', currentUser);
  startCamera();
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('meetup_user');
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (peerConnection) peerConnection.close();
  location.reload();
});

async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    setStatus('Ready. Looking for matches...');
    socket.emit('find-match');
  } catch (err) {
    setStatus('Please allow camera & microphone');
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceServers);

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.onicecandidate = (e) => {
    if (e.candidate && partnerId) {
      socket.emit('signal', { to: partnerId, signal: { type: 'candidate', candidate: e.candidate } });
    }
  };

  peerConnection.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
    remotePlaceholder.style.display = 'none';
    setStatus('Connected!');
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      endCall();
    }
  };
}

async function startCall(isInitiator) {
  createPeerConnection();
  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { to: partnerId, signal: { type: 'offer', sdp: offer } });
  }
}

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  remotePlaceholder.style.display = 'flex';
  remoteInfo.textContent = '';
  partnerId = null;
}

socket.on('matched', async ({ partnerId: id, partner }) => {
  partnerId = id;
  remoteInfo.textContent = `${partner.username}, ${partner.age} • ${partner.interests?.slice(0,2).join(', ') || ''}`;
  setStatus(`Matched with ${partner.username}!`);
  await startCall(true); // both sides will handle offer/answer via signaling
});

socket.on('signal', async ({ from, signal }) => {
  if (!peerConnection) createPeerConnection();

  if (signal.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('signal', { to: from, signal: { type: 'answer', sdp: answer } });
  } else if (signal.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
  } else if (signal.type === 'candidate') {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch (e) {}
  }
});

socket.on('partner-left', () => {
  setStatus('Partner left. Finding next...');
  endCall();
  setTimeout(() => socket.emit('find-match'), 1000);
});

socket.on('waiting', () => setStatus('Waiting for a match...'));

nextBtn.addEventListener('click', () => {
  endCall();
  socket.emit('next');
  setStatus('Looking for next person...');
});

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
});

camBtn.addEventListener('click', () => {
  isCamOff = !isCamOff;
  localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
  camBtn.textContent = isCamOff ? 'Cam On' : 'Cam';
});

reportBtn.addEventListener('click', () => {
  if (!partnerId) return alert('No one to report');
  const reason = prompt('Reason for report?') || 'Inappropriate behavior';
  socket.emit('report', { partnerId, reason });
  alert('Report submitted. Thank you.');
});

blockBtn.addEventListener('click', () => {
  if (!partnerId) return;
  socket.emit('block', partnerId);
  endCall();
  socket.emit('next');
  alert('Blocked and skipped.');
});

loadUser();