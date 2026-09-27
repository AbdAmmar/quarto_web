/**
 * Pure Quarto game rules. No DOM, no canvas -- this module only knows about
 * game state and legality, exactly like the Python logic.py it's ported
 * from. It can be unit-tested with plain Node and reused from a Web Worker
 * (for the AI) as well as from the main UI thread.
 *
 * Rules recap
 * -----------
 * Each of the 16 pieces varies along 4 binary attributes: Tall/Short,
 * Dark/Light, Round/Square, Hollow/Solid (bits 0-3 of an int 0-15). On your
 * turn you PLACE the piece your opponent handed you on any empty square. If
 * that completes a row, column, or diagonal of 4 pieces sharing at least
 * one attribute, you win -- even though your opponent chose the piece! If
 * you don't win, you SELECT a piece from what's left and hand it to your
 * opponent, who places it next. The game is a draw if the board fills up
 * with no winning line.
 */

export const NUM_PIECES = 16;
export const NUM_CELLS = 16;

/** The (up to 4) winning lines that pass through board position `pos` (0-15). */
export function linesThrough(pos) {
  const r = Math.floor(pos / 4);
  const c = pos % 4;
  const lines = [
    [0, 1, 2, 3].map((cc) => r * 4 + cc),
    [0, 1, 2, 3].map((rr) => rr * 4 + c),
  ];
  if (r === c) lines.push([0, 1, 2, 3].map((i) => i * 4 + i));
  if (r + c === 3) lines.push([0, 1, 2, 3].map((i) => i * 4 + (3 - i)));
  return lines;
}

/** True if all 4 cells in `line` are filled and share an attribute. */
export function lineIsWinning(board, line) {
  const pieces = line.map((p) => board[p]);
  if (pieces.some((p) => p === null)) return false;
  for (let bit = 0; bit < 4; bit++) {
    const v0 = (pieces[0] >> bit) & 1;
    if (pieces.every((p) => ((p >> bit) & 1) === v0)) return true;
  }
  return false;
}

/** Check only the lines through the last-played position. Returns the
 * winning line (array of 4 positions) or null. */
export function checkWin(board, pos) {
  for (const line of linesThrough(pos)) {
    if (lineIsWinning(board, line)) return line;
  }
  return null;
}

/**
 * Game state, treated as immutable: applyAction() returns a new State
 * rather than mutating the one passed in.
 *
 * @property {(number|null)[]} board - 16 cells, null or piece 0-15
 * @property {Set<number>} remaining - pieces not placed and not in hand
 * @property {number|null} pieceInHand - piece the current player must place
 * @property {0|1} currentPlayer
 * @property {'select'|'place'|'over'} phase
 * @property {null|0|1|'draw'} winner
 * @property {number[]|null} winningLine
 */
export class State {
  constructor(board, remaining, pieceInHand, currentPlayer, phase, winner = null, winningLine = null) {
    this.board = board;
    this.remaining = remaining;
    this.pieceInHand = pieceInHand;
    this.currentPlayer = currentPlayer;
    this.phase = phase;
    this.winner = winner;
    this.winningLine = winningLine;
  }

  static newGame() {
    const remaining = new Set();
    for (let i = 0; i < NUM_PIECES; i++) remaining.add(i);
    return new State(new Array(NUM_CELLS).fill(null), remaining, null, 0, 'select');
  }
}

export function getLegalActions(state) {
  if (state.phase === 'select') return Array.from(state.remaining);
  if (state.phase === 'place') {
    const actions = [];
    for (let i = 0; i < NUM_CELLS; i++) if (state.board[i] === null) actions.push(i);
    return actions;
  }
  return [];
}

/** Return a new State obtained by applying `action` to `state`. */
export function applyAction(state, action) {
  let { board, remaining, pieceInHand, currentPlayer, phase } = state;
  let winner = null;
  let winningLine = null;

  if (phase === 'select') {
    const piece = action;
    remaining = new Set(remaining);
    remaining.delete(piece);
    pieceInHand = piece;
    currentPlayer = 1 - currentPlayer;
    phase = 'place';
  } else if (phase === 'place') {
    const pos = action;
    board = board.slice();
    board[pos] = pieceInHand;
    pieceInHand = null;
    const wline = checkWin(board, pos);
    if (wline) {
      winner = currentPlayer;
      winningLine = wline;
      phase = 'over';
    } else if (remaining.size === 0) {
      winner = 'draw';
      phase = 'over';
    } else {
      phase = 'select';
    }
  } else {
    throw new Error('Game is already over');
  }

  return new State(board, remaining, pieceInHand, currentPlayer, phase, winner, winningLine);
}

/** Play uniformly-random moves to the end from `state`. Returns the
 * outcome from Player 0's perspective: +1 win, -1 loss, 0 draw. */
export function rolloutResult(state) {
  let s = state;
  while (s.phase !== 'over') {
    const actions = getLegalActions(s);
    const a = actions[Math.floor(Math.random() * actions.length)];
    s = applyAction(s, a);
  }
  if (s.winner === 'draw') return 0;
  return s.winner === 0 ? 1 : -1;
}
