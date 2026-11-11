/** Solderless breadboard hole layout and internal connections. Units: mm, origin at centre. */
const P = 2.54;
export const BB_TOP = 8.5;   // height of the breadboard surface above the bench
export const ROWS = 'abcdefghij';
// rows a–e below the centre channel (+y), f–j above it (−y)
export const rowY = (r) => (r < 5 ? 3.81 + (4 - r) * P : -3.81 - (r - 5) * P);
export const RAILS = [
  { id: 'T+', y: -21.59, sign: '+', side: 'top' }, { id: 'T-', y: -19.05, sign: '-', side: 'top' },
  { id: 'B+', y: 19.05, sign: '+', side: 'bottom' }, { id: 'B-', y: 21.59, sign: '-', side: 'bottom' },
];
const cache = {};
/** @returns {{cols:number, holes:{n:string,x:number,y:number,g:string,rail?:string}[]}} */
export function layout(kind) {
  if (cache[kind]) return cache[kind];
  const cols = kind === 'full' ? 63 : 30, railN = kind === 'full' ? 50 : 25;
  const cx = (c) => (c - (cols + 1) / 2) * P;      // column 1..cols
  const holes = [];
  for (let c = 1; c <= cols; c++) for (let r = 0; r < 10; r++) holes.push({ n: `${ROWS[r]}${c}`, x: cx(c), y: rowY(r), g: `${r < 5 ? 'L' : 'U'}${c}`, col: c, row: r });
  for (const R of RAILS) for (let k = 0; k < railN; k++) {
    const c = 2 + k + Math.floor(k / 5) + (kind === 'full' ? 1 : 0);
    holes.push({ n: `${R.id}${k + 1}`, x: cx(c), y: R.y, g: R.id, rail: R.id });
  }
  return (cache[kind] = { cols, holes, cx });
}
export function holeLabel(n) {
  const m = n.match(/^([TB])([+-])(\d+)$/);
  if (m) return `${m[1] === 'T' ? 'top' : 'bottom'} ${m[2] === '+' ? '+' : '−'} rail`;
  return `row ${n[0]} · col ${n.slice(1)}`;
}
