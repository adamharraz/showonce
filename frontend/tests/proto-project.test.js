import { expect, it } from 'vitest';
import { prepareProject } from '../vendor/proto-lab/src/project.js';
import { EXAMPLES } from '../vendor/proto-lab/src/examples.js';

const board = () => ({ uid: 'esp_1', type: 'esp32', x: 0, y: 0, rot: 0, props: {} });

it('rejects malformed projects before an editor can replace its current document', () => {
  for (const doc of [null, [], {items: null}, {items: [{...board(), type: 'unknown'}]},
    {items: [board(), board()]}, {items: [{...board(), x: Infinity}]},
    {items: [board()], wires: null}, {items: [board()], wires: [{uid:'w_1', a:'esp_1:17', b:'missing:GND'}]},
    {items: [{...board(), props: {color: {bad: true}}}]}, {items: [board()], main: 'missing'},
    {items: [board()], rules: [{uid:'r_1', src:'missing.value', dst:'esp_1', op:'>', val:1, act:'on'}]},
  ]) expect(() => prepareProject(doc)).toThrow();
});

it('accepts all saved examples without changing their wiring or rules', () => {
  for (const [,make] of Object.values(EXAMPLES)) {
    const original = JSON.parse(JSON.stringify(make()));
    expect(prepareProject(original)).toEqual(original);
  }
});

it('normalizes blank starters and returns an independent editable document', () => {
  expect(prepareProject({title:'New bench'})).toEqual({v:1,title:'New bench',items:[],wires:[],rules:[],main:null,lang:null});
  const input = {items:[board()]};
  const result = prepareProject(input);
  result.items[0].x = 20;
  expect(input.items[0].x).toBe(0);
});
