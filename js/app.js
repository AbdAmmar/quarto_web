import { State, applyAction, getLegalActions } from './logic.js';
import { DIFFICULTIES } from './mcts.js';
import { drawPiece } from './pieceView.js';
import { theme } from './theme.js';
import { NetClient } from './net.js';

// ---------------------------------------------------------------- layout
const BOARD_FRAME = 10;
const BOARD_CELL = 88;
const BOARD_GAP = 4;
const BOARD_PIX = BOARD_FRAME * 2 + BOARD_CELL * 4;

const POOL_FRAME = 8;
const POOL_CELL = 48;
const POOL_GAP = 4;
const POOL_PIX = POOL_FRAME * 2 + POOL_CELL * 4;

const HAND_PIX = 96;

const SESSION_KEY = 'quarto_online_session';

// ---------------------------------------------------------------- DOM refs
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const modeToggle = document.getElementById('mode-toggle');
const firstToggle = document.getElementById('first-toggle');
const difficultyToggle = document.getElementById('difficulty-toggle');
const computerOptions = document.getElementById('computer-options');
const onlineOptions = document.getElementById('online-options');
const startBtn = document.getElementById('start-btn');

const serverUrlInput = document.getElementById('server-url');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinCodeInput = document.getElementById('join-code-input');
const onlineStatus = document.getElementById('online-status');
const rejoinRow = document.getElementById('rejoin-row');
const rejoinBtn = document.getElementById('rejoin-btn');
const roomLinkRow = document.getElementById('room-link-row');
const roomLinkInput = document.getElementById('room-link-input');
const copyLinkBtn = document.getElementById('copy-link-btn');

const statusBadge = document.getElementById('status-badge');
const roomCodeLabel = document.getElementById('room-code-label');
const infoBtn = document.getElementById('info-btn');
const boardCanvas = document.getElementById('board-canvas');
const handCanvas = document.getElementById('hand-canvas');
const poolCanvas = document.getElementById('pool-canvas');
const thinkLabel = document.getElementById('think-label');
const newGameBtn = document.getElementById('new-game-btn');

const legendDialog = document.getElementById('legend-dialog');
const legendCanvas = document.getElementById('legend-canvas');
const legendCloseBtn = document.getElementById('legend-close-btn');

boardCanvas.width = BOARD_PIX;
boardCanvas.height = BOARD_PIX;
handCanvas.width = HAND_PIX;
handCanvas.height = HAND_PIX;
poolCanvas.width = POOL_PIX;
poolCanvas.height = POOL_PIX;

// ---------------------------------------------------------------- canvas helper
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------------------------------------------------------------- app state
let state = null;
let vsComputer = true;
let humanPlayer = 0;
let computerPlayer = 1;
let thinking = false;
let mode = 'two_players';
let firstChoice = 'human';
let difficulty = 'Medium';

// Online-mode state
let onlineMode = false;
let net = null;
let mySlot = null;
let roomId = null;
let roomToken = null;
let opponentPresent = true;

const worker = new Worker('js/worker.js', { type: 'module' });
let pendingResolve = null;
worker.onmessage = (event) => {
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve(event.data.action);
  }
};

// ---------------------------------------------------------------- setup screen
function setupSegmented(container, onChange) {
  container.querySelectorAll('.segment').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.segment').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
    });
  });
}

setupSegmented(modeToggle, (value) => {
  mode = value;
  computerOptions.classList.toggle('hidden', mode !== 'computer');
  onlineOptions.classList.toggle('hidden', mode !== 'online');
  startBtn.classList.toggle('hidden', mode === 'online');
});

setupSegmented(firstToggle, (value) => {
  firstChoice = value;
});

setupSegmented(difficultyToggle, (value) => {
  difficulty = value;
});

startBtn.addEventListener('click', startGame);
newGameBtn.addEventListener('click', () => {
  if (state && state.phase !== 'over') {
    const message = onlineMode
      ? 'Leave this match? Your opponent will be disconnected and the game will be lost.'
      : 'Leave this game in progress? Progress will be lost.';
    if (!window.confirm(message)) return;
  }
  backToMenu();
});

// Warn before an accidental page refresh/close loses an in-progress game
// (this shows the browser's own generic prompt -- custom text isn't
// allowed by modern browsers for this event).
window.addEventListener('beforeunload', (event) => {
  if (state && state.phase !== 'over') {
    event.preventDefault();
    event.returnValue = '';
  }
});
infoBtn.addEventListener('click', () => legendDialog.showModal());
legendCloseBtn.addEventListener('click', () => legendDialog.close());

function startGame() {
  // "Online" games are started through Create/Join, never through this
  // button (which is hidden in that mode) -- guard anyway.
  if (mode === 'online') return;
  vsComputer = mode === 'computer';
  onlineMode = false;
  if (vsComputer) {
    humanPlayer = firstChoice === 'human' ? 0 : 1;
    computerPlayer = 1 - humanPlayer;
  }
  state = State.newGame();
  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  render();
  maybeTriggerComputer();
}

function backToMenu() {
  if (legendDialog.open) legendDialog.close();
  if (onlineMode && net) {
    net.close();
  }
  onlineMode = false;
  net = null;
  mySlot = null;
  roomId = null;
  roomToken = null;
  clearSession();
  roomCodeLabel.classList.add('hidden');
  roomLinkRow.classList.add('hidden');
  onlineStatus.textContent = '';
  gameScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  refreshRejoinRow();
}

// ---------------------------------------------------------------- online: session persistence
function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      url: serverUrlInput.value.trim(),
      roomId,
      token: roomToken,
    }));
  } catch (e) {
    // localStorage might be unavailable (private browsing, etc.) -- not fatal.
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // ignore
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function refreshRejoinRow() {
  const session = loadSession();
  rejoinRow.classList.toggle('hidden', !session);
}

function showRoomLink(id) {
  const link = `${location.origin}${location.pathname}?room=${id}`;
  roomLinkInput.value = link;
  roomLinkRow.classList.remove('hidden');
}

copyLinkBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomLinkInput.value);
  } catch (e) {
    roomLinkInput.select();
    document.execCommand('copy');
  }
  const original = copyLinkBtn.textContent;
  copyLinkBtn.textContent = 'Copied!';
  setTimeout(() => { copyLinkBtn.textContent = original; }, 1500);
});

// If the page was opened via a shared room link (?room=CODE), jump
// straight into "Online" mode with that code ready to join.
function checkRoomLinkParam() {
  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (!roomParam) return;
  modeToggle.querySelector('[data-value="online"]').click();
  joinCodeInput.value = roomParam.toUpperCase();
}
checkRoomLinkParam();

// ---------------------------------------------------------------- online: networking
function stateFromServerPayload(msg) {
  return {
    board: msg.board,
    remaining: new Set(msg.remaining),
    pieceInHand: msg.piece_in_hand,
    currentPlayer: msg.current_player,
    phase: msg.phase,
    winner: msg.winner,
    winningLine: msg.winning_line,
  };
}

function attachNetHandlers() {
  net.on('room_created', (msg) => {
    roomId = msg.room_id;
    roomToken = msg.token;
    mySlot = msg.slot;
    saveSession();
    onlineStatus.textContent = `Room created: ${roomId}\nShare this code -- waiting for your opponent...`;
    showRoomLink(roomId);
  });

  net.on('joined', (msg) => {
    roomId = msg.room_id;
    roomToken = msg.token;
    mySlot = msg.slot;
    saveSession();
    onlineStatus.textContent = `Joined room ${roomId}. Starting...`;
  });

  net.on('reconnected', (msg) => {
    roomId = msg.room_id;
    mySlot = msg.slot;
    onlineStatus.textContent = `Reconnected to room ${roomId}.`;
  });

  net.on('opponent_joined', () => {
    opponentPresent = true;
    if (state) updateStatus();
  });

  net.on('opponent_left', () => {
    opponentPresent = false;
    if (state) updateStatus();
  });

  net.on('state', (msg) => {
    opponentPresent = true;
    state = stateFromServerPayload(msg);
    if (setupScreen.classList.contains('hidden') === false) {
      enterOnlineGameScreen();
    }
    render();
  });

  net.on('error', (msg) => {
    if (!setupScreen.classList.contains('hidden')) {
      onlineStatus.textContent = 'Error: ' + msg.message;
    } else {
      thinkLabel.textContent = msg.message;
      setTimeout(() => { thinkLabel.textContent = ''; }, 2000);
    }
  });

  net.on('close', () => {
    if (onlineMode && state && state.phase !== 'over') {
      opponentPresent = false;
      updateStatus();
    } else if (onlineMode && !state) {
      // Connection dropped before the match even started (e.g. while
      // waiting for the other player, and the host stayed idle long
      // enough for the server/host to drop the connection).
      onlineStatus.textContent = 'Connection lost. Please try again.';
    }
  });
}

async function connectNet() {
  const url = serverUrlInput.value.trim();
  net = new NetClient(url);
  attachNetHandlers();
  await net.connect();
}

createRoomBtn.addEventListener('click', async () => {
  onlineStatus.textContent = 'Connecting...';
  try {
    onlineMode = true;
    vsComputer = false;
    await connectNet();
    net.createRoom();
  } catch (e) {
    onlineStatus.textContent = 'Could not connect to the server. Check the address and try again.';
  }
});

joinRoomBtn.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) {
    onlineStatus.textContent = 'Enter a room code first.';
    return;
  }
  onlineStatus.textContent = 'Connecting...';
  try {
    onlineMode = true;
    vsComputer = false;
    await connectNet();
    net.joinRoom(code);
  } catch (e) {
    onlineStatus.textContent = 'Could not connect to the server. Check the address and try again.';
  }
});

rejoinBtn.addEventListener('click', async () => {
  const session = loadSession();
  if (!session) return;
  serverUrlInput.value = session.url;
  onlineStatus.textContent = 'Reconnecting...';
  try {
    onlineMode = true;
    vsComputer = false;
    await connectNet();
    net.reconnect(session.roomId, session.token);
  } catch (e) {
    onlineStatus.textContent = 'Could not reconnect. The server may be unreachable.';
  }
});

refreshRejoinRow();

function enterOnlineGameScreen() {
  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  roomCodeLabel.textContent = `Room: ${roomId}`;
  roomCodeLabel.classList.remove('hidden');
}

// ---------------------------------------------------------------- drawing
function playerName(p) {
  if (onlineMode) return p === mySlot ? 'You' : 'Opponent';
  if (vsComputer) return p === humanPlayer ? 'You' : 'Computer';
  return `Player ${p + 1}`;
}

function render() {
  drawBoard();
  drawHand();
  drawPool();
  updateStatus();
}

function drawBoard() {
  const ctx = boardCanvas.getContext('2d');
  ctx.clearRect(0, 0, BOARD_PIX, BOARD_PIX);
  roundRectPath(ctx, 0, 0, BOARD_PIX, BOARD_PIX, 18);
  ctx.fillStyle = theme.border;
  ctx.fill();

  const hiliteCells = new Set(state.winningLine || []);
  for (let i = 0; i < 16; i++) {
    const r = Math.floor(i / 4);
    const col = i % 4;
    const x0 = BOARD_FRAME + col * BOARD_CELL + BOARD_GAP / 2;
    const y0 = BOARD_FRAME + r * BOARD_CELL + BOARD_GAP / 2;
    const w = BOARD_CELL - BOARD_GAP;
    const h = BOARD_CELL - BOARD_GAP;
    const fill = hiliteCells.has(i) ? theme.boardHilite : theme.boardCell;
    roundRectPath(ctx, x0, y0, w, h, 10);
    ctx.fillStyle = fill;
    ctx.fill();

    const piece = state.board[i];
    if (piece !== null) {
      drawPiece(ctx, x0 + w / 2, y0 + h / 2, piece, BOARD_CELL, { bgColor: fill, theme });
    }
  }
}

function drawHand() {
  const ctx = handCanvas.getContext('2d');
  ctx.clearRect(0, 0, HAND_PIX, HAND_PIX);
  if (state.pieceInHand !== null) {
    drawPiece(ctx, HAND_PIX / 2, HAND_PIX / 2, state.pieceInHand, BOARD_CELL, {
      scale: 1.15,
      bgColor: theme.bgPanel,
      theme,
    });
  }
}

function drawPool() {
  const ctx = poolCanvas.getContext('2d');
  ctx.clearRect(0, 0, POOL_PIX, POOL_PIX);
  roundRectPath(ctx, 0, 0, POOL_PIX, POOL_PIX, 14);
  ctx.fillStyle = theme.border;
  ctx.fill();

  for (let p = 0; p < 16; p++) {
    const r = Math.floor(p / 4);
    const col = p % 4;
    const x0 = POOL_FRAME + col * POOL_CELL + POOL_GAP / 2;
    const y0 = POOL_FRAME + r * POOL_CELL + POOL_GAP / 2;
    const w = POOL_CELL - POOL_GAP;
    const h = POOL_CELL - POOL_GAP;
    const available = state.remaining.has(p);
    const fill = available ? theme.boardCell : theme.poolUnavailable;
    roundRectPath(ctx, x0, y0, w, h, 8);
    ctx.fillStyle = fill;
    ctx.fill();

    if (available) {
      drawPiece(ctx, x0 + w / 2, y0 + h / 2, p, BOARD_CELL, { scale: 0.6, bgColor: fill, theme });
    }
  }
}

function updateStatus() {
  if (onlineMode && !opponentPresent && state.phase !== 'over') {
    statusBadge.textContent = 'Opponent disconnected -- waiting for them to reconnect...';
    statusBadge.style.background = theme.neutral;
    return;
  }
  if (state.phase === 'over') {
    if (state.winner === 'draw') {
      statusBadge.textContent = "It's a draw!";
      statusBadge.style.background = theme.neutral;
    } else {
      const name = playerName(state.winner);
      const verb = name === 'You' ? 'win' : 'wins';
      statusBadge.textContent = `${name} ${verb}!`;
      const youLost = (onlineMode && state.winner !== mySlot)
        || (vsComputer && state.winner !== humanPlayer);
      statusBadge.style.background = youLost ? theme.neutral : theme.success;
    }
    return;
  }
  const actor = playerName(state.currentPlayer);
  if (state.phase === 'select') {
    const other = playerName(1 - state.currentPlayer);
    statusBadge.textContent = `${actor}: choose a piece to give to ${other}`;
  } else {
    statusBadge.textContent = `${actor}: place the piece`;
  }
  statusBadge.style.background = theme.accent;
}

// ---------------------------------------------------------------- input
function isMyTurn() {
  if (state.phase === 'over') return false;
  if (onlineMode) return state.currentPlayer === mySlot;
  if (thinking) return false;
  if (!vsComputer) return true;
  return state.currentPlayer === humanPlayer;
}

function canvasCoords(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

boardCanvas.addEventListener('click', (event) => {
  if (!isMyTurn() || state.phase !== 'place') return;
  const { x, y } = canvasCoords(boardCanvas, event);
  const col = Math.floor((x - BOARD_FRAME) / BOARD_CELL);
  const row = Math.floor((y - BOARD_FRAME) / BOARD_CELL);
  if (row < 0 || row > 3 || col < 0 || col > 3) return;
  const pos = row * 4 + col;
  if (!getLegalActions(state).includes(pos)) return;
  submitAction(pos);
});

poolCanvas.addEventListener('click', (event) => {
  if (!isMyTurn() || state.phase !== 'select') return;
  const { x, y } = canvasCoords(poolCanvas, event);
  const col = Math.floor((x - POOL_FRAME) / POOL_CELL);
  const row = Math.floor((y - POOL_FRAME) / POOL_CELL);
  if (row < 0 || row > 3 || col < 0 || col > 3) return;
  const piece = row * 4 + col;
  if (!state.remaining.has(piece)) return;
  submitAction(piece);
});

// ---------------------------------------------------------------- game flow
function submitAction(value) {
  if (onlineMode) {
    net.action(value);
  } else {
    playAction(value);
  }
}

function playAction(action) {
  state = applyAction(state, action);
  render();
  if (state.phase !== 'over') maybeTriggerComputer();
}

function maybeTriggerComputer() {
  if (onlineMode || !vsComputer || state.phase === 'over') return;
  if (state.currentPlayer !== computerPlayer) return;

  thinking = true;
  thinkLabel.textContent = 'Computer is thinking...';
  const settings = DIFFICULTIES[difficulty];

  pendingResolve = (action) => {
    thinking = false;
    thinkLabel.textContent = '';
    playAction(action);
  };

  worker.postMessage({
    board: state.board,
    remaining: Array.from(state.remaining),
    pieceInHand: state.pieceInHand,
    currentPlayer: state.currentPlayer,
    phase: state.phase,
    iterations: settings.iterations,
    timeLimit: settings.timeLimit,
  });
}

// ---------------------------------------------------------------- legend
function drawLegend() {
  const rows = [
    [0b0000, 0b0001, 'Short', 'Tall'],
    [0b0000, 0b0010, 'Light', 'Dark'],
    [0b0000, 0b0100, 'Square', 'Round'],
    [0b0000, 0b1000, 'Solid', 'Hollow'],
  ];
  const rowH = 46;
  legendCanvas.width = 220;
  legendCanvas.height = rowH * rows.length;
  const ctx = legendCanvas.getContext('2d');
  ctx.clearRect(0, 0, legendCanvas.width, legendCanvas.height);
  ctx.font = '11px -apple-system, Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';

  rows.forEach(([a, b, labelA, labelB], i) => {
    const y = rowH * i + rowH / 2 - 6;
    drawPiece(ctx, 30, y, a, BOARD_CELL, { scale: 0.5, bgColor: theme.bgPanel, theme });
    ctx.fillStyle = theme.textDark;
    ctx.fillText(labelA, 30, y + 24);
    ctx.fillStyle = theme.textMuted;
    ctx.font = 'italic 11px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillText('vs', 85, y + 4);
    ctx.font = '11px -apple-system, Helvetica, Arial, sans-serif';
    drawPiece(ctx, 140, y, b, BOARD_CELL, { scale: 0.5, bgColor: theme.bgPanel, theme });
    ctx.fillStyle = theme.textDark;
    ctx.fillText(labelB, 140, y + 24);
  });
}

drawLegend();
