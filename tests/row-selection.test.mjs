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
