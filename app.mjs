import { parseRoster, validateConfig, standardDocument, customDocument, rowSelection } from './core.mjs?v=20261107-column-selection-1';
import { templateType, imageTemplate } from './image-template.mjs';
import * as pdfjs from './vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
const $=id=>document.getElementById(id), form=$('roster-form');
document.querySelectorAll('button, input, select, textarea').forEach(control=>{control.disabled=false;});
const areaNames={name:'이름',id:'학번',number:'번호',title:'제목'};
let selectedArea=null,addingArea=false,gesture=null;
let template=null,mapping={},mappingTarget=null,firstPoint=null,output=null,dirty=true,busy=false,currentConfig=null,toastTimer,previewGeneration=0,revision=0;
const fontPromise=fetch('./assets/NanumGothic-Regular.ttf').then(r=>{if(!r.ok)throw new Error('한글 글꼴을 불러오지 못했습니다. 페이지를 다시 열어 주세요.');return r.arrayBuffer()});
// The font is local to this deployment. No roster or PDF is sent anywhere.
fontPromise.catch(()=>{});

function config(){const f=new FormData(form);return validateConfig({title:f.get('title'),capacity:f.get('capacity'),start:f.get('start'),columns:f.get('columns'),columnMode:f.get('columnMode'),year:f.get('year'),month:f.get('month'),rows:f.get('rows'),orientation:f.get('orientation'),accent:f.get('accent'),roster:f.get('roster'),weekdays:f.has('weekdays'),showId:f.has('showId'),showNote:f.has('showNote')});}
function error(message=''){ $('form-error').textContent=message;$('form-error').hidden=!message;if(message)$('form-error').scrollIntoView({behavior:'smooth',block:'center'}); }
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function setBusy(value){busy=value;for(const id of ['download','print','template-file'])$(id).disabled=value;form.querySelector('[type=submit]').disabled=value;}
function markDirty(){revision++;dirty=true;$('summary').classList.add('dirty');$('summary').textContent='설정이 변경되었습니다. 업데이트 또는 PDF 저장을 눌러 주세요.';}
function countRoster(){try{$('roster-count').textContent=`입력한 명단 ${parseRoster($('roster').value).length}명`;}catch{$('roster-count').textContent='명단 형식을 확인해 주세요';}}

async function renderBytes(bytes,mapper=false){
  const generation=++previewGeneration;
  const pdf=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
  const fragment=document.createDocumentFragment();
  try{
    if(pdf.numPages>15)throw new Error('미리보기는 최대 15쪽까지 지원합니다. 페이지당 인원을 늘리거나 더 작은 PDF를 선택해 주세요.');
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i),view=page.getViewport({scale:1.8});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.className='paper';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`출석부 ${i}페이지 미리보기`);
      await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
      if(mapper&&i===1){
        const banner=document.createElement('p');banner.className='mapping-banner';banner.textContent='양식 위치 지정 · 항목을 선택한 뒤 한 칸 또는 제목을 제외한 열 전체의 두 모서리를 눌러 주세요. 초록색 편집 표시는 PDF에 포함되지 않으며, 새 학번 칸의 테두리와 제목은 PDF에 저장됩니다.';fragment.append(banner);
        const wrap=document.createElement('div');wrap.className='mapping-wrapper';wrap.append(canvas);
        const overlay=document.createElement('canvas');overlay.className='mapping-overlay';overlay.width=canvas.width;overlay.height=canvas.height;overlay.setAttribute('aria-label','양식 첫 행의 기입 영역 지정');overlay.dataset.pageHeight=page.getViewport({scale:1}).height;overlay.addEventListener('pointerdown',areaPointerDown);overlay.addEventListener('pointermove',areaPointerMove);overlay.addEventListener('pointerup',areaPointerUp);overlay.addEventListener('pointercancel',areaPointerCancel);wrap.append(overlay);fragment.append(wrap);
      }else fragment.append(canvas);
      page.cleanup();
    }
    if(generation!==previewGeneration)return;
    $('preview-pages').replaceChildren(fragment);
    $('page-info').textContent=`${mapper||template?'첨부 양식':currentConfig?.orientation==='landscape'?'A4 가로':'A4 세로'} · ${pdf.numPages}페이지`;
    if(mapper)drawMapping();
  }finally{await pdf.destroy();}
}

function drawMapping(){
  const canvas=document.querySelector('.mapping-overlay');if(!canvas)return;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  const names=areaNames;
  for(const [kind,b]of Object.entries(mapping)){
    ctx.fillStyle=kind==='title'?'#e3ac4230':'#14635430';ctx.strokeStyle=kind==='title'?'#b97712':'#146354';ctx.lineWidth=2;
    ctx.fillRect(b.x*w,b.y*h,b.w*w,b.h*h);ctx.strokeRect(b.x*w,b.y*h,b.w*w,b.h*h);
    if(b.border||b.header){
      const gap=Number($('row-gap').value)/Number(canvas.dataset.pageHeight);
      ctx.setLineDash([5,4]);
      if(b.header)ctx.strokeRect(b.x*w,(b.y-b.h)*h,b.w*w,b.h*h);
      if(b.border&&Number.isFinite(gap))for(let r=1;r<Math.min(Number($('rows').value),Number($('capacity').value));r++)ctx.strokeRect(b.x*w,(b.y+r*gap)*h,b.w*w,b.h*h);
      ctx.setLineDash([]);
    }
    if(kind===selectedArea){ctx.fillStyle='#146354';ctx.fillRect((b.x+b.w)*w-6,(b.y+b.h)*h-6,12,12);}
    ctx.font='bold 15px sans-serif';ctx.fillStyle='#146354';ctx.fillText(names[kind],b.x*w+2,Math.max(16,b.y*h-5));
  }
  if(firstPoint){ctx.fillStyle='#ba7130';ctx.beginPath();ctx.arc(firstPoint.x*w,firstPoint.y*h,5,0,Math.PI*2);ctx.fill();}
  $('mapping-status').textContent=Object.keys(mapping).length?`지정 완료: ${Object.keys(mapping).map(k=>names[k]).join(', ')}`:'아직 지정한 영역이 없습니다.';
  document.querySelectorAll('[data-map]').forEach(b=>{b.classList.toggle('active',b.dataset.map===mappingTarget);b.classList.toggle('mapped',!!mapping[b.dataset.map]);});
}
function mapClick(event){
  if(!mappingTarget){toast('왼쪽 설정에서 이름 칸 등 지정할 항목을 먼저 선택해 주세요.');return;}
  const rect=event.currentTarget.getBoundingClientRect(),point={x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
  if(!firstPoint){firstPoint=point;toast('이제 같은 칸의 반대쪽 모서리를 눌러 주세요.');}
  else{
    const box={x:Math.min(point.x,firstPoint.x),y:Math.min(point.y,firstPoint.y),w:Math.abs(point.x-firstPoint.x),h:Math.abs(point.y-firstPoint.y)};
    if(box.w<.005||box.h<.005){toast('영역이 너무 작습니다. 두 모서리를 다시 지정해 주세요.');firstPoint=null;drawMapping();return;}
    let selected;try{selected=mappingTarget==='title'?{box,split:false}:rowSelection(box,Number($('rows').value),Number(event.currentTarget.dataset.pageHeight),$('selection-mode').value);}catch(e){error(e.message);firstPoint=null;return;}
    if(selected.split){$('row-gap').value=Number(selected.gap.toFixed(3));toast(`선택한 열을 ${$('rows').value}명분으로 나눴습니다.`);}
    mapping[mappingTarget]=selected.box;selectedArea=mappingTarget;firstPoint=null;mappingTarget=null;syncAreaEditor();markDirty();
  }
  drawMapping();
}

function syncAreaEditor(){
  if(!mapping[selectedArea])selectedArea=Object.keys(mapping)[0]||null;
  $('area-editor').hidden=!selectedArea;
  $('area-kind').replaceChildren(...Object.keys(mapping).map(kind=>{const o=document.createElement('option');o.value=kind;o.textContent=areaNames[kind];return o;}));
  if(!selectedArea)return;
  $('area-kind').value=selectedArea;const b=mapping[selectedArea];
  for(const k of ['x','y','w','h'])$('area-'+k).value=Number((b[k]*100).toFixed(3));
  $('area-font').value=b.fontSize??$('font-size').value;$('area-align').value=b.align||'center';
  $('area-border').checked=!!b.border;$('area-header').checked=!!b.header;
  $('area-header').disabled=selectedArea!=='id';$('split-area').disabled=selectedArea==='title';
}
function pointAt(event){const rect=event.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
function areaPointerDown(event){
  if(busy||gesture||event.button!==0||event.isPrimary===false)return;
  if(mappingTarget&&!addingArea){mapClick(event);return;}
  const point=pointAt(event),canvas=event.currentTarget;
  if(addingArea){gesture={mode:'create',start:point,before:mapping.id?{...mapping.id}:null};selectedArea='id';}
  else{
    const hit=Object.keys(mapping).reverse().find(kind=>{const b=mapping[kind];return point.x>=b.x&&point.x<=b.x+b.w+.01&&point.y>=b.y&&point.y<=b.y+b.h+.01;});
    if(!hit){toast('항목을 선택해 위치를 지정하거나 학번 칸 새로 추가를 눌러 주세요.');return;}
    selectedArea=hit;const b=mapping[hit],rect=canvas.getBoundingClientRect();
    const resize=Math.abs(point.x-b.x-b.w)*rect.width<16&&Math.abs(point.y-b.y-b.h)*rect.height<16;
    gesture={mode:resize?'resize':'move',start:point,before:{...b}};
  }
  canvas.setPointerCapture(event.pointerId);if(gesture.mode!=='create')syncAreaEditor();drawMapping();
}
function areaPointerMove(event){
  if(!gesture)return;
  const point=pointAt(event),g=gesture,b=g.before;
  if(g.mode==='create'){selectedArea='id';mapping.id={x:Math.min(point.x,g.start.x),y:Math.min(point.y,g.start.y),w:Math.abs(point.x-g.start.x),h:Math.abs(point.y-g.start.y),border:true,header:true,align:'center'};}
  else if(g.mode==='move')mapping[selectedArea]={...b,x:Math.max(0,Math.min(1-b.w,b.x+point.x-g.start.x)),y:Math.max(0,Math.min(1-b.h,b.y+point.y-g.start.y))};
  else mapping[selectedArea]={...b,w:Math.max(.005,Math.min(1-b.x,point.x-b.x)),h:Math.max(.005,Math.min(1-b.y,point.y-b.y))};
  syncAreaEditor();drawMapping();
}
function areaPointerUp(event){
  if(!gesture)return;areaPointerMove(event);const g=gesture,b=mapping[selectedArea];
  if(g.mode==='create'&&(!b||b.w<.005||b.h<.005)){
    if(g.before)mapping.id=g.before;else delete mapping.id;
    toast('첫 사람의 학번 칸을 충분한 크기로 드래그해 주세요.');
  }else{
    if(g.mode==='create'){
      let selected;try{selected=rowSelection(b,Number($('rows').value),Number(event.currentTarget.dataset.pageHeight),$('selection-mode').value);}catch(e){areaPointerCancel();error(e.message);return;}
      mapping.id=selected.box;
      $('row-gap').value=Number((selected.box.h*Number(event.currentTarget.dataset.pageHeight)).toFixed(3));
      form.elements.showId.checked=true;addingArea=false;mappingTarget=null;
      toast(selected.split?`학번 열을 ${$('rows').value}명분으로 나눴습니다. 이름 칸도 열 전체로 지정했다면 같은 방식으로 나눠 주세요.`:'학번 칸을 추가했습니다. 행 간격과 페이지당 인원을 확인한 뒤 업데이트해 주세요.');
    }
    markDirty();
  }
  gesture=null;syncAreaEditor();drawMapping();
}
function areaPointerCancel(){
  if(!gesture)return;
  const kind=gesture.mode==='create'?'id':selectedArea;
  if(gesture.before)mapping[kind]=gesture.before;else delete mapping[kind];
  gesture=null;syncAreaEditor();drawMapping();
}
async function openAreaEditor(kind,add=false){
  if(!template||busy)return;
  selectedArea=kind;mappingTarget=add?'id':null;addingArea=add;firstPoint=null;setBusy(true);
  try{await renderBytes(template,true);syncAreaEditor();drawMapping();document.querySelector('.mapping-wrapper')?.scrollIntoView({behavior:'smooth',block:'start'});if(add)toast('첫 학번 칸 또는 제목을 제외한 학번 열 전체를 드래그하세요. 페이지당 인원을 원본 행 수에 맞춰 주세요.');}
  catch(e){error(e.message);}finally{setBusy(false);}
}
$('add-id-area').addEventListener('click',()=>openAreaEditor('id',true));
$('edit-area').addEventListener('click',()=>openAreaEditor(selectedArea));
$('area-kind').addEventListener('change',()=>{selectedArea=$('area-kind').value;syncAreaEditor();drawMapping();});
for(const key of ['x','y','w','h','font','align','border','header'])$('area-'+key).addEventListener('input',()=>{
  if(!mapping[selectedArea])return;
  const b=mapping[selectedArea],el=$('area-'+key);
  if(['x','y','w','h'].includes(key))b[key]=el.value===''?NaN:Number(el.value)/100;
  else if(key==='font')b.fontSize=el.value===''?NaN:Number(el.value);
  else if(key==='align')b.align=el.value;
  else b[key]=el.checked;
  drawMapping();
});
$('delete-area').addEventListener('click',()=>{if(busy)return;delete mapping[selectedArea];mappingTarget=null;addingArea=false;firstPoint=null;syncAreaEditor();drawMapping();markDirty();});
$('split-area').addEventListener('click',async()=>{
  if(busy||!mapping[selectedArea]||selectedArea==='title')return;
  try{
    if(!document.querySelector('.mapping-overlay'))await openAreaEditor(selectedArea);
    const canvas=document.querySelector('.mapping-overlay');if(!canvas)return;
    const height=Number(canvas.dataset.pageHeight);
    const selected=rowSelection(mapping[selectedArea],Number($('rows').value),height,'column');
    mapping[selectedArea]=selected.box;$('row-gap').value=Number(selected.gap.toFixed(3));
    syncAreaEditor();drawMapping();markDirty();error();toast(`선택 영역을 ${$('rows').value}명분으로 나누고 행 간격을 맞췄습니다.`);
  }catch(e){error(e.message);}
});
$('row-gap').addEventListener('input',drawMapping);

async function generate(){
  if(busy)return false;const generationRevision=revision;setBusy(true);error();
  try{
    const c=config(),font=await fontPromise;
    if(!globalThis.PDFLib||!globalThis.fontkit)throw new Error('PDF 도구를 불러오지 못했습니다. 페이지를 다시 열어 주세요.');
    const bytes=template?await customDocument(c,PDFLib,fontkit,font,template,mapping,Number($('row-gap').value),Number($('font-size').value)):await standardDocument(c,PDFLib,fontkit,font);
    currentConfig=c;await renderBytes(bytes);output=bytes;dirty=false;mappingTarget=null;firstPoint=null;addingArea=false;gesture=null;
    $('summary').classList.remove('dirty');$('summary').textContent=`${c.capacity}명 · 명단 ${c.records.length}명 · 빈 이름 칸 ${c.capacity-c.records.length}명${template?' · 첨부 양식 적용':''}`;
    if(generationRevision!==revision){markDirty();return false;}
    return true;
  }catch(e){error(e.message||'PDF를 만들지 못했습니다. 입력과 양식을 확인해 주세요.');return false;}
  finally{setBusy(false);}
}

form.addEventListener('submit',e=>{e.preventDefault();generate();});
form.addEventListener('input',e=>{if(e.target.id==='roster')countRoster();if(['rows','capacity'].includes(e.target.id))drawMapping();if(e.target.id!=='template-file')markDirty();});
form.addEventListener('change',e=>{if(e.target.id!=='template-file')markDirty();});
$('sample').addEventListener('click',()=>{if($('roster').value.trim()){toast('현재 명단을 비운 뒤 예시를 불러와 주세요.');return;}$('roster').value='0011 홍길동\n0012 김하늘\n0013 이바다';countRoster();markDirty();toast('설명용 가상 명단 3명을 넣었습니다. 실제 명단으로 바꿔 주세요.');});
$('clear-roster').addEventListener('click',()=>{$('roster').value='';countRoster();markDirty();});
$('download').addEventListener('click',async()=>{
  if(busy)return;if(dirty||!output){if(!await generate())return;}
  const blob=new Blob([output],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${currentConfig.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')}.pdf`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('PDF를 저장했습니다. 모바일에서는 다운로드 목록을 확인해 주세요.');
});
$('print').addEventListener('click',async()=>{
  if(busy)return;if(dirty||!output){if(!await generate())return;}
  const images=[...document.querySelectorAll('#preview-pages .paper')].map(canvas=>{const img=new Image();img.src=canvas.toDataURL('image/png');return img;});
  $('print-pages').replaceChildren(...images);await Promise.all(images.map(img=>img.decode()));
  let style=$('print-size');if(!style){style=document.createElement('style');style.id='print-size';document.head.append(style);}style.textContent=`@media print{@page{size:${!template&&currentConfig.orientation==='landscape'?'A4 landscape':'A4 portrait'};margin:0}}`;
  if(template)toast('첨부 양식은 PDF 저장 후 PDF 뷰어에서 인쇄하면 원본 용지 크기를 유지할 수 있습니다.');window.print();
});
$('template-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;if(busy)return;
  if(file.size>10*1024*1024){error('양식 파일은 10MB 이하로 첨부해 주세요.');e.target.value='';return;}
  setBusy(true);error();
  try{
    const inputBytes=new Uint8Array(await file.arrayBuffer()),type=templateType(inputBytes);
    const converted=type==='application/pdf'?null:await imageTemplate(inputBytes,type,PDFLib);
    const bytes=converted?converted.bytes:inputBytes;
    const probe=await PDFLib.PDFDocument.load(bytes);if(probe.getPageCount()>15)throw new Error('첨부 PDF는 최대 15쪽까지 지원합니다.');
    for(const p of probe.getPages()){
      if(p.getRotation().angle!==0)throw new Error('페이지 회전을 적용해 저장한 PDF를 첨부해 주세요.');
      const crop=p.getCropBox(),media=p.getMediaBox();
      if(crop.x!==0||crop.y!==0||media.x!==0||media.y!==0||crop.width!==media.width||crop.height!==media.height)throw new Error('잘라내기 정보가 있는 PDF입니다. PDF로 인쇄해 일반 페이지로 저장한 뒤 첨부해 주세요.');
    }
    await renderBytes(bytes,true);template=bytes;mapping={};mappingTarget=null;firstPoint=null;selectedArea=null;addingArea=false;gesture=null;syncAreaEditor();drawMapping();
    $('template-controls').hidden=false;$('template-status').textContent=`${file.name} · ${converted?`이미지 ${converted.width}×${converted.height} → PDF 1쪽`:`${probe.getPageCount()}쪽`}`;
    $('summary').textContent='원본 양식을 불러왔습니다. 첫 행의 기입 영역을 지정해 주세요.';markDirty();
  }catch(e){error(e.message?.includes('encrypt')?'암호화된 PDF는 지원하지 않습니다. 암호를 해제한 파일을 첨부해 주세요.':e.message||'양식을 불러오지 못했습니다.');}
  finally{setBusy(false);e.target.value='';}
});
document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',async()=>{
  if(!template||busy)return;mappingTarget=button.dataset.map;addingArea=false;gesture=null;firstPoint=null;setBusy(true);
  try{await renderBytes(template,true);drawMapping();document.querySelector('.mapping-wrapper')?.scrollIntoView({behavior:'smooth',block:'start'});toast('한 칸 또는 제목을 제외한 열 전체의 왼쪽 위와 오른쪽 아래를 차례로 눌러 주세요.');}catch(e){error(e.message);}finally{setBusy(false);}
}));
$('reset-mapping').addEventListener('click',async()=>{if(busy)return;mapping={};mappingTarget=null;firstPoint=null;selectedArea=null;addingArea=false;gesture=null;syncAreaEditor();markDirty();setBusy(true);try{await renderBytes(template,true);}catch(e){error(e.message);}finally{setBusy(false);}});
$('remove-template').addEventListener('click',()=>{if(busy)return;template=null;mapping={};mappingTarget=null;firstPoint=null;selectedArea=null;addingArea=false;gesture=null;syncAreaEditor();$('template-controls').hidden=true;$('template-status').textContent='첨부 없이 기본 출석부를 만들 수 있어요.';markDirty();generate();});
generate();
