export interface GameState {
  board_size: number; // e.g. 4 for 4x4 dots (3x3 boxes)
  horizontal_lines: boolean[][];
  vertical_lines: boolean[][];
  claimed_boxes: (string | null)[][]; // stores player_id of who claimed the box
  player1_score: number;
  player2_score: number;
  player1_id: string;
  player2_id: string | null;
  current_player_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  winner_id: string | null;
  game_mode: 'quick' | 'private' | 'bot';
  updated_at?: string;
  created_at?: string;
}

export interface GameMove {
  type: 'horizontal' | 'vertical';
  r: number;
  c: number;
}

/**
 * Creates a brand new, initialized game state
 */
export function createGame(
  player1Id: string,
  player2Id: string | null = null,
  gameMode: 'quick' | 'private' | 'bot' = 'quick',
  boardSize: number = 4
): GameState {
  const boxCount = boardSize - 1;

  // Initialize horizontal lines matrix: boardSize rows, boxCount cols
  const horizontal_lines: boolean[][] = Array.from({ length: boardSize }, () =>
    Array(boxCount).fill(false)
  );

  // Initialize vertical lines matrix: boxCount rows, boardSize cols
  const vertical_lines: boolean[][] = Array.from({ length: boxCount }, () =>
    Array(boardSize).fill(false)
  );

  // Initialize claimed boxes matrix: boxCount rows, boxCount cols
  const claimed_boxes: (string | null)[][] = Array.from({ length: boxCount }, () =>
    Array(boxCount).fill(null)
  );

  return {
    board_size: boardSize,
    horizontal_lines,
    vertical_lines,
    claimed_boxes,
    player1_score: 0,
    player2_score: 0,
    player1_id: player1Id,
    player2_id: player2Id,
    current_player_id: player1Id, // player 1 goes first
    status: gameMode === 'private' && !player2Id ? 'waiting' : 'playing',
    winner_id: null,
    game_mode: gameMode,
  };
}

/**
 * Check if a line coordinate is valid and within bounds
 */
export function isValidLine(boardSize: number, type: 'horizontal' | 'vertical', r: number, c: number): boolean {
  const boxCount = boardSize - 1;
  if (type === 'horizontal') {
    return r >= 0 && r < boardSize && c >= 0 && c < boxCount;
  } else {
    return r >= 0 && r < boxCount && c >= 0 && c < boardSize;
  }
}

/**
 * Check if a line has already been claimed (played)
 */
export function isLinePlayed(state: GameState, type: 'horizontal' | 'vertical', r: number, c: number): boolean {
  if (type === 'horizontal') {
    return state.horizontal_lines[r]?.[c] ?? true;
  } else {
    return state.vertical_lines[r]?.[c] ?? true;
  }
}

/**
 * Validates whether a move is legal
 */
export function isValidMove(state: GameState, move: GameMove, playerId: string): boolean {
  // Check game status
  if (state.status !== 'playing') return false;

  // Check turn
  if (state.current_player_id !== playerId) return false;

  const { type, r, c } = move;

  // Check bounds
  if (!isValidLine(state.board_size, type, r, c)) return false;

  // Check if already played
  if (isLinePlayed(state, type, r, c)) return false;

  return true;
}

/**
 * Returns a list of all legal moves remaining on the board
 */
export function getLegalMoves(state: GameState): GameMove[] {
  const moves: GameMove[] = [];
  const boardSize = state.board_size;
  const boxCount = boardSize - 1;

  // Horizontal lines
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boxCount; c++) {
      if (!state.horizontal_lines[r][c]) {
        moves.push({ type: 'horizontal', r, c });
      }
    }
  }

  // Vertical lines
  for (let r = 0; r < boxCount; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (!state.vertical_lines[r][c]) {
        moves.push({ type: 'vertical', r, c });
      }
    }
  }

  return moves;
}

/**
 * Check if making a move completes any boxes, and returns the boxes completed
 * Each box is defined by its (row, col) coordinates
 */
export function checkCompletedBoxes(
  state: GameState,
  move: GameMove
): { r: number; c: number }[] {
  const { type, r, c } = move;
  const completed: { r: number; c: number }[] = [];
  const boardSize = state.board_size;
  const boxCount = boardSize - 1;

  // Helper to check if a specific box index is completed
  const isBoxClosed = (br: number, bc: number): boolean => {
    if (br < 0 || br >= boxCount || bc < 0 || bc >= boxCount) return false;
    
    // A box at (br, bc) has 4 lines:
    // Top: Horiz(br, bc)
    // Bottom: Horiz(br+1, bc)
    // Left: Vert(br, bc)
    // Right: Vert(br, bc+1)
    return (
      state.horizontal_lines[br][bc] &&
      state.horizontal_lines[br + 1][bc] &&
      state.vertical_lines[br][bc] &&
      state.vertical_lines[br][bc + 1]
    );
  };

  if (type === 'horizontal') {
    // A horizontal line at (r, c) is:
    // - The bottom line of the box above it (r - 1, c)
    // - The top line of the box below it (r, c)
    if (isBoxClosed(r - 1, c)) completed.push({ r: r - 1, c });
    if (isBoxClosed(r, c)) completed.push({ r, c });
  } else {
    // A vertical line at (r, c) is:
    // - The right line of the box to the left (r, c - 1)
    // - The left line of the box to the right (r, c)
    if (isBoxClosed(r, c - 1)) completed.push({ r, c: c - 1 });
    if (isBoxClosed(r, c)) completed.push({ r, c });
  }

  return completed;
}

/**
 * Apply a move to the game state. Mutates state and returns the updated state.
 */
export function makeMove(state: GameState, move: GameMove, playerId: string): GameState {
  if (!isValidMove(state, move, playerId)) {
    throw new Error('Invalid move');
  }

  const { type, r, c } = move;

  // 1. Claim the line
  if (type === 'horizontal') {
    state.horizontal_lines[r][c] = true;
  } else {
    state.vertical_lines[r][c] = true;
  }

  // 2. Check for newly completed boxes
  const completedBoxes = checkCompletedBoxes(state, move);

  if (completedBoxes.length > 0) {
    // Claim boxes for this player
    for (const box of completedBoxes) {
      state.claimed_boxes[box.r][box.c] = playerId;
    }

    // Update player scores
    if (playerId === state.player1_id) {
      state.player1_score += completedBoxes.length;
    } else {
      state.player2_score += completedBoxes.length;
    }

    // Keep turn with the current player
    state.current_player_id = playerId;
  } else {
    // Switch turns
    state.current_player_id =
      playerId === state.player1_id ? state.player2_id : state.player1_id;
  }

  // 3. Check for game completion
  const boxCount = state.board_size - 1;
  let totalClaimed = 0;
  for (let br = 0; br < boxCount; br++) {
    for (let bc = 0; bc < boxCount; bc++) {
      if (state.claimed_boxes[br][bc] !== null) {
        totalClaimed++;
      }
    }
  }

  if (totalClaimed === boxCount * boxCount) {
    state.status = 'finished';
    state.current_player_id = null;
    
    // Determine winner
    if (state.player1_score > state.player2_score) {
      state.winner_id = state.player1_id;
    } else if (state.player2_score > state.player1_score) {
      state.winner_id = state.player2_id;
    } else {
      state.winner_id = null; // Draw
    }
  }

  return state;
}

/**
 * Returns the game result status text
 */
export function getGameResultText(state: GameState, currentUserId: string): string {
  if (state.status !== 'finished') return '';
  if (state.winner_id === null) return "It's a draw!";
  return state.winner_id === currentUserId ? 'You Won!' : 'Opponent Won!';
}
