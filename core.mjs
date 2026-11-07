export function parseRoster(text) {
  const records = [], errors = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let id = '', name = '';
    const pair = line.match(/^([0-9]+)(?:\s*,\s*|\s+)([^,]+)$/u);
    if (pair) { id = pair[1]; name = pair[2].trim(); }
    else if (!/[\d,\t]/u.test(line)) name = line;
    else { errors.push(`${i + 1}행: 학번과 이름을 확인해 주세요.`); return; }
    if (!name || /[\u0000-\u001F\u007F]/u.test(name)) errors.push(`${i + 1}행: 이름을 확인해 주세요.`);
    else if ([...name].length > 50 || id.length > 20) errors.push(`${i + 1}행: 학번 또는 이름이 너무 깁니다.`);
    else records.push({ id, name });
  });
  if (errors.length) throw new Error(errors.join('\n'));
  return records;
}

export function validateConfig(raw) {
  const c = { ...raw, title: String(raw.title || '').trim() };
  if (!c.title) throw new Error('출석부 제목을 입력해 주세요.');
  for (const [key, label, min, max] of [['capacity','전체 인원',1,300],['start','시작 번호',1,99999],['columns','출석 확인 칸',1,40],['rows','페이지당 인원',5,40]]) {
    c[key] = Number(raw[key]);
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`${label}은 ${min}~${max} 사이의 정수로 입력해 주세요.`);
  }
  c.year = raw.year === '' ? null : Number(raw.year);
  c.month = raw.month === '' ? null : Number(raw.month);
  if (c.year !== null && (!Number.isInteger(c.year) || c.year < 1900 || c.year > 2200)) throw new Error('연도는 1900~2200 사이로 입력해 주세요.');
  if (c.month !== null && (!Number.isInteger(c.month) || c.month < 1 || c.month > 12)) throw new Error('월은 1~12 사이로 선택해 주세요.');
  if (c.columnMode === 'day' && c.columns > 31) throw new Error('날짜 칸은 최대 31칸입니다. 32칸 이상은 회차 표시를 선택해 주세요.');
  if (c.weekdays && (c.year === null || c.month === null || c.columnMode !== 'day')) throw new Error('요일 자동 기입은 날짜 표시와 연도·월을 모두 지정해야 합니다.');
  c.records = parseRoster(raw.roster || '');
  if (c.records.length > c.capacity) throw new Error(`입력 명단은 ${c.records.length}명, 전체 인원은 ${c.capacity}명입니다. 전체 인원을 늘려 주세요. 명단을 임의로 자르지 않습니다.`);
  return c;
}

export function pageCount(c) { return Math.ceil(c.capacity / c.rows); }

const fontCharacterSets = new WeakMap();
function fittedSize(font, text, width, wanted, minimum = 5.5) {
  if (!fontCharacterSets.has(font)) fontCharacterSets.set(font, new Set(font.getCharacterSet()));
  const supported = fontCharacterSets.get(font);
  if ([...text].some(ch=>!supported.has(ch.codePointAt(0)))) throw new Error(`지원하지 않는 문자가 있습니다: '${text}'. 이모지나 특수 문자를 확인해 주세요.`);
  const measured = font.widthOfTextAtSize(text, wanted);
  const size = measured > width ? wanted * width / measured : wanted;
  if (size < minimum) throw new Error(`'${text}'을 칸 안에 읽기 좋게 넣을 수 없습니다. 글자를 줄이거나 칸을 넓혀 주세요.`);
  return size;
}

export function centeredText(page, font, text, x, y, w, h, wanted, color, align = 'center') {
  if (!text) return;
  const size = fittedSize(font, text, w - 5, wanted);
  const textWidth=font.widthOfTextAtSize(text,size);
  page.drawText(text, { x:align==='left'?x+2.5:align==='right'?x+w-textWidth-2.5:x+(w-textWidth)/2, y:y + (h - font.heightAtSize(size,{descender:false}))/2, size, font, color });
}

export async function standardDocument(c, lib, fontkit, fontBytes) {
  const { PDFDocument, rgb } = lib;
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes,{subset:false});
  const palettes = {green:[[.13,.36,.28],[.91,.95,.90]],blue:[[.18,.34,.48],[.91,.94,.97]],gray:[[.25,.25,.25],[.94,.94,.94]]};
  const [dark, pale] = palettes[c.accent] || palettes.green;
  const ink=rgb(...dark), wash=rgb(...pale), black=rgb(.15,.19,.16), line=rgb(.57,.65,.57);
  const total=pageCount(c), [w,h]=c.orientation==='landscape'?[841.89,595.28]:[595.28,841.89];
  for (let p=0;p<total;p++) {
    const page=doc.addPage([w,h]), margin=24, tableW=w-48;
    centeredText(page,font,c.title,margin,h-68,tableW,33,23,ink);
    const period=[c.year?`${c.year}년`:'',c.month?`${c.month}월`:''].filter(Boolean).join(' ');
    if (period) centeredText(page,font,period,margin,h-90,tableW,18,10,ink);
    const widths=[27,...(c.showId?[48]:[]),65,...Array(c.columns).fill(0),...(c.showNote?[48]:[])];
    const dateStart=c.showId?3:2, fixed=widths.reduce((a,b)=>a+b,0), dateW=(tableW-fixed)/c.columns;
    for(let i=0;i<c.columns;i++) widths[dateStart+i]=dateW;
    const xs=[margin]; widths.forEach(v=>xs.push(xs.at(-1)+v));
    const top=h-108, headerH=35, bottom=33, rowH=(top-headerH-bottom)/c.rows;
    page.drawRectangle({x:margin,y:top-headerH,width:tableW,height:headerH,color:wash});
    const labels=['번호',...(c.showId?['학번']:[]),'이름',...Array.from({length:c.columns},(_,i)=>String(i+1)),...(c.showNote?['비고']:[])];
    labels.forEach((text,i)=>{
      const isDate=i>=dateStart&&i<dateStart+c.columns;
      centeredText(page,font,text,xs[i],top-headerH+(isDate?14:0),widths[i],isDate?21:headerH,isDate?Math.min(9,dateW*.65):9,ink);
      if(isDate) {
        const day=i-dateStart+1;
        let below=c.columnMode==='session'?'회':'';
        if(c.weekdays && day<=new Date(c.year,c.month,0).getDate()) below='일월화수목금토'[new Date(c.year,c.month-1,day).getDay()];
        if(below) centeredText(page,font,below,xs[i],top-headerH,widths[i],14,Math.min(7,dateW*.6),ink);
      }
    });
    for(let r=0;r<c.rows;r++) {
      const index=p*c.rows+r, y=top-headerH-(r+1)*rowH;
      if(r%2===1) page.drawRectangle({x:margin,y,width:tableW,height:rowH,color:rgb(.98,.985,.975)});
      if(index<c.capacity) {
        const rec=c.records[index], values=[String(c.start+index),...(c.showId?[rec?.id||'']:[]),rec?.name||''];
        values.forEach((value,i)=>centeredText(page,font,value,xs[i],y,widths[i],rowH,Math.min(10,rowH*.48),black));
      }
    }
    const end=top-headerH-c.rows*rowH;
    xs.forEach(x=>page.drawLine({start:{x,y:top},end:{x,y:end},thickness:.45,color:line}));
    [top,top-headerH,...Array.from({length:c.rows},(_,r)=>top-headerH-(r+1)*rowH)].forEach(y=>page.drawLine({start:{x:margin,y},end:{x:w-margin,y},thickness:.45,color:line}));
    centeredText(page,font,`${p+1} / ${total}`,margin,10,tableW,15,7,rgb(.5,.56,.5));
  }
  doc.setTitle(c.title);doc.setCreator('출석부 작업실');doc.setProducer('출석부 작업실 · pdf-lib');
  return doc.save();
}

export function validateMapping(c, mapping) {
  if(c.records.length && !mapping.name) throw new Error('PDF 양식에서 이름의 첫 번째 칸을 지정해 주세요.');
  if(c.records.some(r=>r.id) && c.showId && !mapping.id) throw new Error('학번이 있는 명단입니다. 학번의 첫 번째 칸을 지정하거나 학번 칸 표시를 꺼 주세요.');
  for(const [kind,box] of Object.entries(mapping)) {
    if(!['x','y','w','h'].every(k=>Number.isFinite(box[k]))||box.w<.005||box.h<.005||box.x<0||box.y<0||box.x+box.w>1.000001||box.y+box.h>1.000001) throw new Error(`${kind} 기입 영역을 용지 안에 지정해 주세요.`);
    if(box.fontSize!==undefined&&(!Number.isFinite(box.fontSize)||box.fontSize<6||box.fontSize>36)) throw new Error('영역 글자 크기는 6~36pt로 지정해 주세요.');
    if(box.header&&box.y<box.h) throw new Error('학번 제목 칸이 용지 위를 벗어납니다. 학번 영역을 아래로 이동해 주세요.');
  }
}

export async function customDocument(c, lib, fontkit, fontBytes, template, mapping, gap, fontSize) {
  validateMapping(c,mapping);
  if(!Number.isFinite(gap)||gap<=0||gap>200) throw new Error('행 간격은 0보다 크고 200 이하인 pt 값이어야 합니다.');
  if(!Number.isFinite(fontSize)||fontSize<6||fontSize>36) throw new Error('글자 크기는 6~36pt로 지정해 주세요.');
  const source=await lib.PDFDocument.load(template),doc=await lib.PDFDocument.create();doc.registerFontkit(fontkit);
  const font=await doc.embedFont(fontBytes,{subset:false}), count=Math.max(source.getPageCount(),pageCount(c));
  for(let p=0;p<count;p++) {
    const original=source.getPage(p%source.getPageCount());
    if(original.getRotation().angle!==0) throw new Error('회전 정보가 있는 PDF입니다. PDF 편집기에서 페이지 회전을 적용해 저장한 뒤 다시 첨부해 주세요.');
    const [page]=await doc.copyPages(source,[p%source.getPageCount()]);doc.addPage(page);
    const {width:w,height:h}=page.getSize();
    for(const [kind,b] of Object.entries(mapping)) {
      if(kind==='id'&&!c.showId) continue;
      const size=b.fontSize??fontSize;
      const border=(y)=>page.drawRectangle({x:b.x*w,y,width:b.w*w,height:b.h*h,borderWidth:.5,borderColor:lib.rgb(.25,.3,.25)});
      if(kind==='id'&&b.header){
        const y=h-b.y*h;
        border(y);
        centeredText(page,font,'학번',b.x*w,y,b.w*w,b.h*h,size,lib.rgb(0,0,0),b.align);
      }
      const limit=kind==='title'?1:c.rows;
      for(let r=0;r<limit;r++) {
        const index=p*c.rows+r;
        if(kind!=='title'&&index>=c.capacity) break;
        const rec=c.records[index];
        const text=kind==='title'?c.title:kind==='number'?String(c.start+index):kind==='id'?(rec?.id||''):(rec?.name||'');
        const y=h-(b.y+b.h)*h-r*gap;
        if(y<0) throw new Error('마지막 행이 용지를 벗어납니다. 페이지당 인원 또는 행 간격을 줄여 주세요.');
        if(kind==='title') page.drawRectangle({x:b.x*w,y,width:b.w*w,height:b.h*h,color:lib.rgb(1,1,1)});
        if(b.border)border(y);
        centeredText(page,font,text,b.x*w,y,b.w*w,b.h*h,size,lib.rgb(0,0,0),b.align);
      }
    }
  }
  doc.setTitle(c.title);doc.setCreator('출석부 작업실');return doc.save();
}

