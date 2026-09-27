/**
 * Thin wrapper around a WebSocket connection to the Quarto online server.
 * Protocol matches server/main.py exactly -- see that file's docstring
 * for the full message shapes.
 *
 * Usage:
 *   const net = new NetClient(url);
 *   net.on('state', (msg) => { ... });
 *   await net.connect();
 *   net.createRoom();
 */
export class NetClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = {};
    this.keepAliveTimer = null;
  }

  on(type, fn) {
    this.handlers[type] = fn;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        settled = true;
        this._startKeepAlive();
        resolve();
      };
      this.ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Could not connect to ' + this.url));
        }
      };
      this.ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (msg.type === 'pong') return; // keepalive reply, nothing to do
        const handler = this.handlers[msg.type];
        if (handler) handler(msg);
      };
      this.ws.onclose = () => {
        this._stopKeepAlive();
        if (this.handlers.close) this.handlers.close();
      };
    });
  }

  // Render's free tier (and similar hosts) can drop WebSocket connections
  // that sit idle too long -- e.g. while the room creator is waiting for
  // the other player to type in the code. A small periodic ping keeps
  // traffic flowing so the connection isn't mistaken for idle.
  _startKeepAlive() {
    this._stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 25000);
  }

  _stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  close() {
    this._stopKeepAlive();
    if (this.ws) this.ws.close();
  }

  send(payload) {
    this.ws.send(JSON.stringify(payload));
  }

  createRoom() {
    this.send({ type: 'create_room' });
  }

  joinRoom(roomId) {
    this.send({ type: 'join_room', room_id: roomId });
  }

  reconnect(roomId, token) {
    this.send({ type: 'reconnect', room_id: roomId, token });
  }

  action(value) {
    this.send({ type: 'action', value });
  }
}
