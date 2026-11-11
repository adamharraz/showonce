/** Validate an imported project without touching the editor or its undo history. */
import { analyze, defOf } from './circuit.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = value => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const require = (condition, message) => { if (!condition) throw new Error(message); };

export function prepareProject(input) {
  require(record(input), 'not a Proto Lab project');
  const doc = { v: 1, title: 'Untitled prototype', items: [], wires: [], rules: [], main: null, lang: null, ...structuredClone(input) };
  require(Array.isArray(doc.items) && Array.isArray(doc.wires) && Array.isArray(doc.rules), 'items, wires and rules must be lists');
  require(typeof doc.title === 'string' && (doc.lang === null || typeof doc.lang === 'string'), 'invalid project details');
  const ids = new Set();
  function checkId(value) {
    require(record(value) && typeof value.uid === 'string' && /^[a-zA-Z0-9_-]+$/.test(value.uid) && !ids.has(value.uid), 'invalid or duplicate object ID');
    ids.add(value.uid);
  }
  for (const item of doc.items) {
    checkId(item);
    const def = typeof item.type === 'string' && defOf(item);
    require(def && ['board', 'part', 'breadboard'].includes(def.kind), 'unknown component type');
    require(Number.isFinite(item.x) && Number.isFinite(item.y) && (item.rot === undefined || Number.isFinite(item.rot)), 'invalid component position');
    require(item.name === undefined || typeof item.name === 'string', 'invalid component name');
    require(item.props === undefined || (record(item.props) && Object.values(item.props).every(scalar)), 'invalid component properties');
  }
  require(doc.main === null || doc.items.some(item => item.uid === doc.main && defOf(item).kind === 'board'), 'invalid main board');
  for (const wire of doc.wires) {
    checkId(wire);
    require(typeof wire.a === 'string' && typeof wire.b === 'string' && (wire.color === undefined || typeof wire.color === 'string'), 'invalid wire');
  }
  for (const rule of doc.rules) {
    checkId(rule);
    require(typeof rule.src === 'string' && doc.items.some(item => rule.src.startsWith(item.uid + '.')), 'invalid rule source');
    require(doc.items.some(item => item.uid === rule.dst && defOf(item).out), 'invalid rule output');
    require(['is', '<', '>'].includes(rule.op) && scalar(rule.val) && (rule.act === undefined || typeof rule.act === 'string') && (rule.arg === undefined || scalar(rule.arg)), 'invalid rule');
  }
  const analysis = analyze(doc);
  require(doc.wires.every(wire => analysis.pins.has(wire.a) && analysis.pins.has(wire.b)), 'wire refers to an unknown pin');
  return doc;
}
