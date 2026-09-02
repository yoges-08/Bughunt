/**
 * Real-Time WebSocket Manager for LAN Communication
 * 
 * CORE REQUIREMENT 1:
 * Pushes problem files directly to student app instances over LAN.
 * Tracks online/offline status of students and admins in real-time.
 * In-band authentication handshake prevents token leakage in connection URLs.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './auth.js';
import { db } from './db.js';

class SocketManager {
  constructor() {
    this.wss = null;
    // Map: studentId -> Set of WebSockets (in case student has multiple tabs or reconnected)
    this.studentSockets = new Map();
    // Set of admin WebSockets
    this.adminSockets = new Set();
  }

  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      ws.authenticated = false;
      ws.isAlive = true;

      // 5-second authentication handshake timeout
      const authTimeout = setTimeout(() => {
        if (!ws.authenticated) {
          ws.close(4001, 'Authentication handshake timed out');
        }
      }, 5000);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());

          // Handle in-band authentication handshake
          if (!ws.authenticated) {
            if (data.type === 'AUTH' && data.token) {
              const payload = verifyToken(data.token);
              if (!payload) {
                clearTimeout(authTimeout);
                ws.close(4002, 'Invalid or expired authentication token');
                return;
              }

              const user = db.findUserById(payload.id);
              if (!user) {
                clearTimeout(authTimeout);
                ws.close(4003, 'User account not found');
                return;
              }

              clearTimeout(authTimeout);
              ws.authenticated = true;
              ws.userId = user.id;
              ws.username = user.username;
              ws.role = user.role;
              ws.user = user;

              // Confirm successful handshake to client
              ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', payload: { role: user.role } }));

              // Register connection by role
              if (user.role === 'admin') {
                this.adminSockets.add(ws);
              } else if (user.role === 'student') {
                if (!this.studentSockets.has(user.id)) {
                  this.studentSockets.set(user.id, new Set());
                }
                this.studentSockets.get(user.id).add(ws);

                // Notify admins that student came online
                this.broadcastToAdmins({
                  type: 'STUDENT_ONLINE',
                  payload: {
                    studentId: user.id,
                    username: user.username,
                    name: user.name,
                    online: true,
                    timestamp: new Date().toISOString()
                  }
                });
              }
            } else {
              // Unauthenticated messages rejected
              ws.close(4001, 'Authentication required');
            }
            return;
          }

          // Handle authenticated messages (e.g. heartbeat PING)
          if (data.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
          }
        } catch (err) {
          console.error('WebSocket message parsing error:', err.message);
        }
      });

      ws.on('close', () => {
        clearTimeout(authTimeout);
        if (!ws.authenticated) return;

        if (ws.role === 'admin') {
          this.adminSockets.delete(ws);
        } else if (ws.role === 'student') {
          const sockets = this.studentSockets.get(ws.userId);
          if (sockets) {
            sockets.delete(ws);
            if (sockets.size === 0) {
              this.studentSockets.delete(ws.userId);
              // Notify admins student went offline
              this.broadcastToAdmins({
                type: 'STUDENT_OFFLINE',
                payload: {
                  studentId: ws.userId,
                  username: ws.username,
                  online: false,
                  timestamp: new Date().toISOString()
                }
              });
            }
          }
        }
      });
    });
  }

  /**
   * Check if a student is currently connected
   */
  isStudentOnline(studentId) {
    const sockets = this.studentSockets.get(studentId);
    return Boolean(sockets && sockets.size > 0);
  }

  /**
   * Push a problem file directly over LAN to a specific student.
   * 
   * @param {string} studentId
   * @param {Object} problemData - { problemId, title, language, filename, starterCode, description }
   */
  pushProblemToStudent(studentId, problemData) {
    const sockets = this.studentSockets.get(studentId);
    let sent = false;

    if (sockets && sockets.size > 0) {
      const message = JSON.stringify({
        type: 'PROBLEM_ASSIGNED',
        payload: problemData
      });

      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN && ws.authenticated) {
          ws.send(message);
          sent = true;
        }
      }
    }

    return sent;
  }

  /**
   * Push problem file to all connected students (Group send)
   */
  pushProblemToAll(problemData, studentIds = null) {
    const targetIds = studentIds || db.getAllStudents().map(s => s.id);
    const results = [];

    for (const studentId of targetIds) {
      const student = db.findUserById(studentId);
      const online = this.pushProblemToStudent(studentId, problemData);
      results.push({ studentId, username: student?.username, online });
    }

    return results;
  }

  /**
   * Broadcast message to all connected admins (for live monitoring)
   */
  broadcastToAdmins(data) {
    const msg = JSON.stringify(data);
    for (const ws of this.adminSockets) {
      if (ws.readyState === WebSocket.OPEN && ws.authenticated) {
        ws.send(msg);
      }
    }
  }
}

export const socketManager = new SocketManager();
