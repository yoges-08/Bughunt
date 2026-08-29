/**
 * Real-Time WebSocket Manager for LAN Communication
 * 
 * CORE REQUIREMENT 1:
 * Pushes problem files directly to student app instances over LAN.
 * Tracks online/offline status of students and admins in real-time.
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

    this.wss.on('connection', (ws, req) => {
      // Extract token from URL query: /ws?token=...
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Authentication token required');
        return;
      }

      const payload = verifyToken(token);
      if (!payload) {
        ws.close(4002, 'Invalid or expired token');
        return;
      }

      const user = db.findUserById(payload.id);
      if (!user) {
        ws.close(4003, 'User not found');
        return;
      }

      ws.userId = user.id;
      ws.username = user.username;
      ws.role = user.role;
      ws.user = user;
      ws.isAlive = true;

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

      // Handle incoming messages if needed
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
          }
        } catch {}
      });

      ws.on('close', () => {
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
        if (ws.readyState === WebSocket.OPEN) {
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
  pushProblemToAll(problemData) {
    const allStudents = db.getAllStudents();
    const results = [];

    for (const student of allStudents) {
      db.assignProblemToStudent(student.id, problemData.problemId);
      const online = this.pushProblemToStudent(student.id, problemData);
      results.push({ studentId: student.id, username: student.username, online });
    }

    return results;
  }

  /**
   * Broadcast message to all connected admins (for live monitoring)
   */
  broadcastToAdmins(data) {
    const msg = JSON.stringify(data);
    for (const ws of this.adminSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }
}

export const socketManager = new SocketManager();
