import { GameState, GameMove, getLegalMoves, checkCompletedBoxes, makeMove } from '../game';

/**
 * Deep clones the game state so that simulations don't affect the active game board
 */
function cloneState(state: GameState): GameState {
  return {
    board_size: state.board_size,
    horizontal_lines: state.horizontal_lines.map((row) => [...row]),
    vertical_lines: state.vertical_lines.map((row) => [...row]),
    claimed_boxes: state.claimed_boxes.map((row) => [...row]),
    player1_score: state.player1_score,
    player2_score: state.player2_score,
    player1_id: state.player1_id,
    player2_id: state.player2_id,
    current_player_id: state.current_player_id,
    status: state.status,
    winner_id: state.winner_id,
    game_mode: state.game_mode,
  };
}

/**
 * Counts how many lines of a box (br, bc) have been drawn
 */
function countBoxLines(state: GameState, br: number, bc: number): number {
  let count = 0;
  if (state.horizontal_lines[br][bc]) count++;
  if (state.horizontal_lines[br + 1][bc]) count++;
  if (state.vertical_lines[br][bc]) count++;
  if (state.vertical_lines[br][bc + 1]) count++;
  return count;
}

/**
 * Checks if a move is "safe" (i.e. does not complete the 3rd line of any box, which would give it to the opponent)
 */
function isMoveSafe(state: GameState, move: GameMove): boolean {
  const { type, r, c } = move;
  const boxCount = state.board_size - 1;

  const boxesToCheck: { r: number; c: number }[] = [];
  if (type === 'horizontal') {
    if (r - 1 >= 0) boxesToCheck.push({ r: r - 1, c });
    if (r < boxCount) boxesToCheck.push({ r, c });
  } else {
    if (c - 1 >= 0) boxesToCheck.push({ r, c: c - 1 });
    if (c < boxCount) boxesToCheck.push({ r, c });
  }

  for (const box of boxesToCheck) {
    const lines = countBoxLines(state, box.r, box.c);
    // If it currently has 2 lines, playing here will make it 3, which is unsafe
    if (lines === 2) {
      return false;
    }
  }

  return true;
}

/**
 * Easy Bot Strategy: Random legal move
 */
function getEasyMove(state: GameState): GameMove | null {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * legalMoves.length);
  return legalMoves[randomIndex];
}

/**
 * Medium Bot Strategy:
 * 1. Completes any box if possible
 * 2. Avoids giving obvious scoring moves to the player (avoids creating 3-sided boxes)
 * 3. Chooses a random safe move
 * 4. Fallback to any legal move
 */
function getMediumMove(state: GameState): GameMove | null {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) return null;

  // 1. Check if any move immediately completes a box (scoring opportunity)
  for (const move of legalMoves) {
    const completed = checkCompletedBoxes(state, move);
    if (completed.length > 0) {
      return move;
    }
  }

  // 2. Filter for safe moves
  const safeMoves = legalMoves.filter((move) => isMoveSafe(state, move));
  if (safeMoves.length > 0) {
    const randomIndex = Math.floor(Math.random() * safeMoves.length);
    return safeMoves[randomIndex];
  }

  // 3. No safe moves exist; play a random move that minimizes box creation (or just random)
  // Let's look for a move that creates a 3rd line in a box that has only 1 line, rather than 2 lines, if possible.
  // But a random legal move is a solid fallback for Medium.
  const randomIndex = Math.floor(Math.random() * legalMoves.length);
  return legalMoves[randomIndex];
}

/**
 * Hard Bot Strategy: Minimax search with alpha-beta pruning
 */
function getHardMove(state: GameState, botId: string, playerId: string): GameMove | null {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) return null;

  // 1. Always take immediate box completion if it's there
  for (const move of legalMoves) {
    if (checkCompletedBoxes(state, move).length > 0) {
      return move;
    }
  }

  // Adjust depth based on remaining moves to avoid lagging
  let depth = 3;
  if (legalMoves.length <= 10) {
    depth = 5;
  } else if (legalMoves.length <= 15) {
    depth = 4;
  }

  const { move } = minimax(state, depth, -Infinity, Infinity, true, botId, playerId);
  
  // Fallback to medium move if minimax fails or doesn't find a move
  return move || getMediumMove(state);
}

/**
 * Minimax algorithm with alpha-beta pruning.
 * Evaluates the board as: (Bot Score - Player Score)
 */
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  isBotTurn: boolean,
  botId: string,
  playerId: string
): { score: number; move: GameMove | null } {
  // Base case
  if (depth === 0 || state.status === 'finished') {
    const score = (botId === state.player1_id ? state.player1_score : state.player2_score) -
                  (playerId === state.player1_id ? state.player1_score : state.player2_score);
    return { score, move: null };
  }

  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) {
    const score = (botId === state.player1_id ? state.player1_score : state.player2_score) -
                  (playerId === state.player1_id ? state.player1_score : state.player2_score);
    return { score, move: null };
  }

  // Sort moves: put moves that complete boxes or are safe first to improve pruning
  legalMoves.sort((a, b) => {
    const aCompletes = checkCompletedBoxes(state, a).length > 0 ? 1 : 0;
    const bCompletes = checkCompletedBoxes(state, b).length > 0 ? 1 : 0;
    if (aCompletes !== bCompletes) return bCompletes - aCompletes;

    const aSafe = isMoveSafe(state, a) ? 1 : 0;
    const bSafe = isMoveSafe(state, b) ? 1 : 0;
    return bSafe - aSafe;
  });

  let bestMove: GameMove | null = null;

  if (isBotTurn) {
    let maxEval = -Infinity;
    for (const move of legalMoves) {
      const cloned = cloneState(state);
      const completed = checkCompletedBoxes(cloned, move).length;
      makeMove(cloned, move, botId);

      // In Dots & Boxes, if a player completes a box, they get another turn!
      // So if a box was completed, it remains the Bot's turn.
      const nextIsBotTurn = completed > 0;
      const evaluation = minimax(cloned, depth - 1, alpha, beta, nextIsBotTurn, botId, playerId).score;

      if (evaluation > maxEval) {
        maxEval = evaluation;
        bestMove = move;
      }
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) {
        break; // beta prune
      }
    }
    return { score: maxEval, move: bestMove };
  } else {
    let minEval = Infinity;
    for (const move of legalMoves) {
      const cloned = cloneState(state);
      const completed = checkCompletedBoxes(cloned, move).length;
      makeMove(cloned, move, playerId);

      // If player completes a box, they get another turn (isBotTurn stays false)
      const nextIsBotTurn = completed === 0;
      const evaluation = minimax(cloned, depth - 1, alpha, beta, nextIsBotTurn, botId, playerId).score;

      if (evaluation < minEval) {
        minEval = evaluation;
        bestMove = move;
      }
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) {
        break; // alpha prune
      }
    }
    return { score: minEval, move: bestMove };
  }
}

/**
 * Main entrance function for getting a Bot Move
 */
export function getBotMove(
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard',
  botId: string,
  playerId: string
): GameMove | null {
  switch (difficulty) {
    case 'easy':
      return getEasyMove(state);
    case 'medium':
      return getMediumMove(state);
    case 'hard':
      return getHardMove(state, botId, playerId);
    default:
      return getMediumMove(state);
  }
}
