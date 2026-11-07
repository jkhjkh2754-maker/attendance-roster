import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rowSelection,validateMapping} from '../core.mjs';
test('a full-height data column becomes 24 cells and leaves room for its heading',()=>{
  const full={x:.12779,y:.20984,w:.05413,h:.71193,header:true,border:true};
  const r=rowSelection(full,24,924);
  assert.equal(r.split,true);assert.equal(r.box.h,full.h/24);
  assert.ok(r.gap>27&&r.gap<28);
  assert.doesNotThrow(()=>validateMapping({records:[]}, {id:r.box}));
  assert.deepEqual(full.h,.71193);
});
test('explicit modes handle short columns and unusually tall individual cells',()=>{
  const box={x:.1,y:.2,w:.1,h:.1};
  assert.equal(rowSelection(box,5,800,'column').box.h,.02);
  assert.equal(rowSelection({...box,h:.4},24,800,'cell').box.h,.4);
  assert.equal(rowSelection(box,24,800).split,false);
  assert.throws(()=>rowSelection(box,0,800,'column'),/페이지당 인원/);
});

test('remaining full-height name and number columns are repaired without changing a fitted ID column or title',async()=>{
  const {prepareMapping,mappingRowGap}=await import('../core.mjs');
  const original={
    name:{x:.2,y:.21,w:.1,h:.71},
    number:{x:.15,y:.21,w:.05,h:.71},
    id:{x:.1,y:.21,w:.05,h:.71/24,rowStep:.71/24},
    title:{x:.3,y:.05,w:.3,h:.2}
  };
  const r=prepareMapping(original,24,842);
  assert.deepEqual(r.converted,['name','number']);
  assert.deepEqual(r.mapping.id,original.id);assert.deepEqual(r.mapping.title,original.title);
  assert.ok(Math.abs(mappingRowGap(r.mapping.name,842,60)-24.9091666667)<.001);
  assert.equal(original.name.h,.71);
  assert.deepEqual(prepareMapping(r.mapping,24,842).converted,[]);
  assert.deepEqual(prepareMapping({name:{...original.name,selectionMode:'cell'}},24,842).converted,[]);
  assert.equal(mappingRowGap({...r.mapping.name,rowGap:29},842,60),29);
});
