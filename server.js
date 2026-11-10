const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const Redis = require('ioredis');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Database Setup ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

// Create tables on startup
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      socket_id TEXT UNIQUE,
      username TEXT,
      age INTEGER,
      gender TEXT,
      prefer_gender TEXT,
      bio TEXT,
      interests TEXT[],
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_socket TEXT,
      reported_socket TEXT,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id SERIAL PRIMARY KEY,
      blocker_socket TEXT,
      blocked_socket TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(blocker_socket, blocked_socket)
    );
  `);
  console.log('Database tables ready');
}
initDB().catch(console.error);

// ---------- Matching Logic ----------
const waitingQueueKey = 'meetup:waiting';
const userKey = (socketId) => `meetup:user:${socketId}`;
const callKey = (socketId) => `meetup:call:${socketId}`;

async function saveUser(socketId, user) {
  if (redis) {
    await redis.set(userKey(socketId), JSON.stringify(user), 'EX', 3600 * 4); // 4 hours
  }
  // Also save to Postgres for history
  await pool.query(
    `INSERT INTO users (socket_id, username, age, gender, prefer_gender, bio, interests)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (socket_id) DO UPDATE SET
       username = EXCLUDED.username,
       age = EXCLUDED.age,
       gender = EXCLUDED.gender,
       prefer_gender = EXCLUDED.prefer_gender,
       bio = EXCLUDED.bio,
       interests = EXCLUDED.interests`,
    [socketId, user.username, user.age, user.gender, user.preferGender, user.bio, user.interests]
  );
}

async function getUser(socketId) {
  if (redis) {
    const data = await redis.get(userKey(socketId));
    if (data) return JSON.parse(data);
  }
  const res = await pool.query('SELECT * FROM users WHERE socket_id = $1', [socketId]);
  return res.rows[0] || null;
}

async function findMatch(socket) {
  const user = await getUser(socket.id);
  if (!user) return;

  if (!redis) {
    // Fallback to in-memory if no Redis (not recommended for production)
    return socket.emit('error', 'Redis not configured');
  }

  // Remove self from queue
  await redis.lrem(waitingQueueKey, 0, socket.id);

  const queue = await redis.lrange(waitingQueueKey, 0, -1);
  for (const partnerId of queue) {
    if (partnerId === socket.id) continue;

    const partner = await getUser(partnerId);
    if (!partner) continue;

    // Check blocks
    const blocked = await pool.query(
      'SELECT 1 FROM blocks WHERE (blocker_socket=$1 AND blocked_socket=$2) OR (blocker_socket=$2 AND blocked_socket=$1)',
      [socket.id, partnerId]
    );
    if (blocked.rows.length) continue;

    // Gender preference
    if (user.prefer_gender && user.prefer_gender !== 'any' && partner.gender !== user.prefer_gender) continue;
    if (partner.prefer_gender && partner.prefer_gender !== 'any' && user.gender !== partner.prefer_gender) continue;

    // Interests
    if (user.interests?.length && partner.interests?.length) {
      const common = user.interests.some(i => partner.interests.includes(i));
      if (!common) continue;
    }

    // Match!
    await redis.lrem(waitingQueueKey, 0, partnerId);
    await redis.set(callKey(socket.id), partnerId, 'EX', 3600);
    await redis.set(callKey(partnerId), socket.id, 'EX', 3600);

    socket.emit('matched', { partnerId, partner });
    io.to(partnerId).emit('matched', { partnerId: socket.id, partner: user });
    return;
  }

  // No match → add to queue
  await redis.rpush(waitingQueueKey, socket.id);
  socket.emit('waiting');
}

// ---------- Socket Handlers ----------
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('register', async (data) => {
    const user = {
      socketId: socket.id,
      username: data.username || 'Anonymous',
      age: data.age,
      gender: data.gender || 'other',
      bio: data.bio || '',
      interests: data.interests || [],
      preferGender: data.preferGender || 'any'
    };
    await saveUser(socket.id, user);
    socket.emit('registered', { id: socket.id });
  });

  socket.on('find-match', () => findMatch(socket));

  socket.on('next', async () => {
    if (redis) {
      const partnerId = await redis.get(callKey(socket.id));
      if (partnerId) {
        await redis.del(callKey(socket.id), callKey(partnerId));
        io.to(partnerId).emit('partner-left');
      }
    }
    findMatch(socket);
  });

  socket.on('report', async ({ partnerId, reason }) => {
    await pool.query(
      'INSERT INTO reports (reporter_socket, reported_socket, reason) VALUES ($1,$2,$3)',
      [socket.id, partnerId, reason]
    );
    socket.emit('reported');
  });

  socket.on('block', async (partnerId) => {
    await pool.query(
      'INSERT INTO blocks (blocker_socket, blocked_socket) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [socket.id, partnerId]
    );
    socket.emit('blocked');
  });

  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });

  socket.on('disconnect', async () => {
    console.log('Disconnected:', socket.id);
    if (redis) {
      const partnerId = await redis.get(callKey(socket.id));
      if (partnerId) {
        await redis.del(callKey(partnerId));
        io.to(partnerId).emit('partner-left');
      }
      await redis.lrem(waitingQueueKey, 0, socket.id);
      await redis.del(userKey(socket.id), callKey(socket.id));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MeetUp server running on port ${PORT}`);
});