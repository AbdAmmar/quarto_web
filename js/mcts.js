/**
 * Monte Carlo Tree Search AI for Quarto. Depends only on logic.js -- no DOM
 * code here, so this runs identically on the main thread or inside a Web
 * Worker.
 */

import { getLegalActions, applyAction, rolloutResult } from './logic.js';

class MCTSNode {
  constructor(state, parent = null, action = null) {
    this.state = state;
    this.parent = parent;
    this.action = action;
    this.children = [];
    this.untried = state.phase !== 'over' ? getLegalActions(state) : [];
    this.visits = 0;
    this.value = 0.0;
  }

  isTerminal() {
    return this.state.phase === 'over';
  }

  fullyExpanded() {
    return this.untried.length === 0;
  }
}

function uctPick(node, c) {
  const player = node.state.currentPlayer;
  let best = null;
  let bestScore = -Infinity;
  for (const child of node.children) {
    let score;
    if (child.visits === 0) {
      score = Infinity;
    } else {
      const persp = player === 0 ? child.value / child.visits : -child.value / child.visits;
      const exploit = (persp + 1.0) / 2.0;
      const explore = c * Math.sqrt(Math.log(node.visits) / child.visits);
      score = exploit + explore;
    }
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

/** Run MCTS from rootState and return the action with the most visits. */
export function mctsSearch(rootState, iterations, timeLimit = null, c = 1.4) {
  const root = new MCTSNode(rootState);
  if (root.untried.length === 0) return null;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    if (timeLimit !== null && (Date.now() - start) / 1000 > timeLimit) break;

    let node = root;
    // 1. Selection
    while (!node.isTerminal() && node.fullyExpanded()) {
      node = uctPick(node, c);
    }

    // 2. Expansion
    if (!node.isTerminal() && !node.fullyExpanded()) {
      const idx = Math.floor(Math.random() * node.untried.length);
      const action = node.untried.splice(idx, 1)[0];
      const childState = applyAction(node.state, action);
      const child = new MCTSNode(childState, node, action);
      node.children.push(child);
      node = child;
    }

    // 3. Simulation
    const result = rolloutResult(node.state);

    // 4. Backpropagation
    let n = node;
    while (n !== null) {
      n.visits += 1;
      n.value += result;
      n = n.parent;
    }
  }

  if (root.children.length === 0) {
    const actions = getLegalActions(rootState);
    return actions[Math.floor(Math.random() * actions.length)];
  }

  let best = root.children[0];
  for (const child of root.children) if (child.visits > best.visits) best = child;
  return best.action;
}

// Number of MCTS iterations (and a safety time cap in seconds) per level.
export const DIFFICULTIES = {
  Easy: { iterations: 60, timeLimit: 5 },
  Medium: { iterations: 300, timeLimit: 8 },
  Hard: { iterations: 1200, timeLimit: 12 },
  Expert: { iterations: 4000, timeLimit: 20 },
};
