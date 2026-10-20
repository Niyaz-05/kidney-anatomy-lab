import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { kidneyDefinition as def } from '../../src/kidney/definition';

describe('structure list', () => {
  it('lists every mesh structure exactly once (directly or inside its group)', () => {
    const src = fs.readFileSync('src/ui/StructurePanel.tsx', 'utf8');
    const block = src.slice(src.indexOf('const SECTIONS'), src.indexOf('];', src.indexOf('const SECTIONS')));
    const ids = [...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!);
    const listed = ids.flatMap((id) => { const s = def.structures.find((x) => x.id === id); expect(s, id).toBeTruthy(); return s!.kind === 'group' ? s!.members! : [id]; });
    expect([...listed].sort()).toEqual(def.structures.filter((s) => s.kind === 'mesh').map((s) => s.id).sort());
  });
});
