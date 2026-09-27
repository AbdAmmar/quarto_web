/**
 * Runs MCTS in a background thread (a Web Worker) so the UI stays
 * responsive while the AI thinks -- the browser equivalent of the
 * background Python thread in the tkinter version.
 *
 * The main thread posts a plain object describing the state (Sets and
 * classes don't survive postMessage cleanly, so we serialize to arrays),
 * and this worker posts back the chosen action.
 */
import { State } from './logic.js';
import { mctsSearch } from './mcts.js';

self.onmessage = (event) => {
  const { board, remaining, pieceInHand, currentPlayer, phase, iterations, timeLimit } = event.data;
  const state = new State(board, new Set(remaining), pieceInHand, currentPlayer, phase);
  const action = mctsSearch(state, iterations, timeLimit);
  self.postMessage({ action });
};
