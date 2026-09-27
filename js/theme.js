/**
 * Color palette used by canvas drawing code (board, pool, piece rendering).
 * These mirror the CSS custom properties in style.css -- if you change one,
 * change the other so the canvas-drawn pieces match the surrounding HTML/CSS
 * chrome (buttons, cards, badges).
 */
export const theme = {
  bgMain: '#faf7f2',
  bgPanel: '#ffffff',
  bgHeader: '#2d2a3d',

  accent: '#e07a5f',
  accentDark: '#c9654a',
  success: '#6a994e',
  neutral: '#9c9686',

  textDark: '#2d2a3d',
  textLight: '#faf7f2',
  textMuted: '#8f897a',

  border: '#2d2a3d',

  boardCell: '#fffdfa',
  boardHilite: '#f2cc8f',
  poolUnavailable: '#d8d2c2',

  pieceDark: '#3d3a4d',
  pieceLight: '#f6f1e7',
  pieceOutline: '#211f2b',
  pieceShadow: '#e6dfd0',
};
