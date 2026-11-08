// Run with: node tests/added-areas.cjs (Playwright and Chromium required).
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const baseURL=process.env.BASE_URL||'http://127.0.0.1:8080';
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(baseURL)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto(baseURL);
  await page.waitForFunction(()=>document.querySelector('#summary').textContent.includes('빈 이름 칸'));
  await page.locator('summary').filter({hasText:'용지와 배치'}).click();
  const source=await page.evaluate(async()=>{const d=await PDFLib.PDFDocument.create();for(let i=0;i<2;i++){const p=d.addPage([600,800]);p.drawText('Original template '+(i+1),{x:200,y:740,size:16});for(let r=0;r<=5;r++)p.drawLine({start:{x:200,y:640-r*30},end:{x:400,y:640-r*30}});}return [...await d.save()];});
  await page.locator('#template-file').setInputFiles({name:'template.pdf',mimeType:'application/pdf',buffer:Buffer.from(source)});
  await page.locator('#template-controls').waitFor({state:'visible'});
  await page.locator('#capacity').fill('7');await page.locator('#rows').fill('5');
  await page.locator('#roster').fill('0011 가상학생\n0012 테스트\n0013 이름셋\n0014 이름넷\n0015 이름다섯\n0016 이름여섯\n0017 이름일곱');
  await page.locator('[data-map="name"]').click();await page.waitForFunction(()=>!document.querySelector('#download').disabled);
  let overlay=page.locator('.mapping-overlay');await overlay.waitFor();await overlay.scrollIntoViewIfNeeded();await page.waitForTimeout(500);
  let box=await overlay.boundingBox();
  await page.mouse.click(box.x+box.width*.34,box.y+box.height*.2);
  await page.mouse.click(box.x+box.width*.66,box.y+box.height*.2375);
  await page.locator('#add-id-area').click();await page.waitForFunction(()=>!document.querySelector('#download').disabled);
  overlay=page.locator('.mapping-overlay');await overlay.scrollIntoViewIfNeeded();await page.waitForTimeout(500);box=await overlay.boundingBox();
  await page.mouse.move(box.x+box.width*.1,box.y+box.height*.2);await page.mouse.down();
  await overlay.dispatchEvent('pointercancel');await page.mouse.up();
  assert.ok((await page.locator('#area-kind').innerHTML()).includes('name'));
  await page.mouse.move(box.x+box.width*.1,box.y+box.height*.2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.25,box.y+box.height*.2375,{steps:10});await page.mouse.up();
  assert.equal(await page.locator('#area-kind').inputValue(),'id');
  assert.equal(await page.locator('#area-header').isChecked(),true);
  assert.equal(await page.locator('#area-border').isChecked(),true);
  assert.ok(Math.abs(Number(await page.locator('#row-gap').inputValue())-30)<.2);
  // Move and resize with a pointer, then make a precise numeric adjustment.
  box=await overlay.boundingBox();
  await page.mouse.move(box.x+box.width*.17,box.y+box.height*.22);await page.mouse.down();await page.mouse.move(box.x+box.width*.19,box.y+box.height*.22,{steps:5});await page.mouse.up();
  assert.ok(Number(await page.locator('#area-x').inputValue())>11);
  const x=Number(await page.locator('#area-x').inputValue())/100,y=Number(await page.locator('#area-y').inputValue())/100,w=Number(await page.locator('#area-w').inputValue())/100,h=Number(await page.locator('#area-h').inputValue())/100;
  await page.mouse.move(box.x+box.width*(x+w),box.y+box.height*(y+h));await page.mouse.down();await page.mouse.move(box.x+box.width*(x+w+.02),box.y+box.height*(y+h),{steps:5});await page.mouse.up();
  assert.ok(Number(await page.locator('#area-w').inputValue())>16);
  await page.locator('#area-x').fill('10');await page.locator('#area-w').fill('15');
  await page.locator('#area-font').fill('11');await page.locator('#area-align').selectOption('left');
  await page.screenshot({path:'/tmp/added-areas-editor.png',fullPage:true});
  const downloadEvent=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadEvent;await download.saveAs('/tmp/added-areas-result.pdf');
  await page.locator('.paper').first().screenshot({path:'/tmp/added-areas-preview.png'});
  const ink=await page.locator('.paper').first().evaluate(c=>{const ctx=c.getContext('2d');return [ctx.getImageData(108,315,1,1).data[0],ctx.getImageData(145,234,1,1).data[0]];});
  assert.ok(ink.every(v=>v<230),'New column and heading borders must be visible in the generated PDF');
  // Read the downloaded PDF directly through a routed response (no document upload).
  await page.route('**/__test_output.pdf',route=>route.fulfill({path:'/tmp/added-areas-result.pdf',contentType:'application/pdf'}));
  const texts=await page.evaluate(async()=>{const bytes=new Uint8Array(await(await fetch('/__test_output.pdf')).arrayBuffer());const lib=await import('/vendor/pdf.min.mjs');const d=await lib.getDocument({data:bytes,isEvalSupported:false}).promise;const out=[];for(let i=1;i<=d.numPages;i++){const p=await d.getPage(i);out.push((await p.getTextContent()).items.map(t=>({text:t.str,x:t.transform[4],size:t.height})));}await d.destroy();return out;});
  assert.equal(texts.length,2);assert.ok(texts[0].some(t=>t.text==='학번'));assert.ok(texts[0].some(t=>t.text==='0011'));assert.ok(texts[1].some(t=>t.text==='0016'));assert.ok(!texts[0].some(t=>t.text==='0016'));
  const id=texts[0].find(t=>t.text==='0011');assert.ok(Math.abs(id.x-62.5)<1);assert.equal(id.size,11);
  assert.ok(texts[0].some(t=>t.text.includes('Original template')));
  // Invalid geometry, heading placement, font size, and final row are rejected.
  await page.locator('#area-y').fill('1');await page.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#form-error').textContent.includes('제목 칸'));
  await page.locator('#area-y').fill('99');await page.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#form-error').textContent.includes('용지 안'));
  await page.locator('#area-y').fill('90');await page.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#form-error').textContent.includes('마지막 행'));
  await page.locator('#area-y').fill('20');await page.locator('#area-font').fill('50');await page.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#form-error').textContent.includes('6~36'));
  await page.locator('#area-font').fill('11');
  await page.locator('#delete-area').click();assert.equal(await page.locator('#area-kind').inputValue(),'name');
  await page.locator('[name="showId"]').uncheck();await page.locator('button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#form-error').textContent&&document.querySelector('#summary').textContent.includes('명단 7명'));
  // An image uses the same added-column path on a narrow touch viewport.
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,600,800);return c.toDataURL().split(',')[1];});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#template-file').setInputFiles({name:'blank.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.waitForFunction(()=>document.querySelector('#template-status').textContent.includes('이미지 600'));
  await page.locator('#add-id-area').click();await page.waitForFunction(()=>!document.querySelector('#download').disabled);overlay=page.locator('.mapping-overlay');await overlay.scrollIntoViewIfNeeded();await page.waitForTimeout(500);box=await overlay.boundingBox();
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.1,y:box.y+box.height*.2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.3,y:box.y+box.height*.24}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('#roster').fill('');await page.locator('button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#summary').textContent.includes('명단 0명'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // Regression: the screenshot selected 71.193% of the page as one data cell.
  const originalGap=await page.locator('#row-gap').inputValue();
  await page.locator('#capacity').fill('24');await page.locator('#rows').fill('24');
  await page.locator('#add-id-area').click();await page.waitForFunction(()=>!document.querySelector('#download').disabled);
  overlay=page.locator('.mapping-overlay');await overlay.scrollIntoViewIfNeeded();await page.waitForTimeout(500);box=await overlay.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.1,y:box.y+box.height*.20984}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.2,y:box.y+box.height*.92177}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(Math.abs(Number(await page.locator('#area-h').inputValue())-71.193/24)<.01);
  assert.equal(await page.locator('#row-gap').inputValue(),originalGap);
  assert.ok(Number(await page.locator('#area-gap').inputValue())<40);
  await page.locator('button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#download').disabled);
  assert.equal(await page.locator('#form-error').textContent(),'');
  // Recover an already selected full-height area, including after PDF generation.
  await page.locator('#area-h').fill('71.193');await page.locator('#split-area').click();
  await page.waitForFunction(()=>Number(document.querySelector('#area-h').value)<4);
  await page.locator('button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#download').disabled);
  assert.equal(await page.locator('#form-error').textContent(),'');
  // The reported layout: ID is fitted, while name/number remain full-height.
  const regression=await page.evaluate(async source=>{
    const core=await import('/core.mjs');const font=await(await fetch('/assets/NanumGothic-Regular.ttf')).arrayBuffer();
    const c={title:'배치 검증',rows:24,capacity:24,showId:true,start:1,records:Array.from({length:24},(_,i)=>({id:String(i+1).padStart(4,'0'),name:'가상학생'}))};
    const mapping={id:{x:.03,y:.21,w:.1,h:.71/24,rowStep:.71/24,border:true,header:true},name:{x:.3,y:.21,w:.2,h:.71},number:{x:.2,y:.21,w:.08,h:.71},title:{x:.3,y:.05,w:.3,h:.05}};
    const data=await core.customDocument(c,PDFLib,fontkit,font,new Uint8Array(source),mapping,60,9);
    const pdfjs=await import('/vendor/pdf.min.mjs');const doc=await pdfjs.getDocument({data,isEvalSupported:false}).promise;const p=await doc.getPage(1);const texts=(await p.getTextContent()).items.map(x=>({text:x.str,y:x.transform[5]}));await doc.destroy();
    let error='';try{await core.customDocument(c,PDFLib,fontkit,font,new Uint8Array(source),{...mapping,name:{...mapping.name,h:.03,rowGap:60}},30,9);}catch(e){error=e.message;}
    return {texts,error};
  },source);
  assert.equal(regression.texts.filter(t=>t.text==='가상학생').length,24);
  assert.ok(regression.texts.find(t=>t.text==='0024').y>0);
  assert.ok(regression.error.includes('이름 영역의 마지막 행'));assert.ok(regression.error.includes('1쪽'));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: PDF/image upload, added column, drag/move/resize, typography, multi-page PDF, validation, deletion, original mapping, mobile layout, no external requests');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
