export function templateType(bytes) {
  if (new TextDecoder('latin1').decode(bytes.subarray(0,1024)).includes('%PDF-')) return 'application/pdf';
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png';
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  const ascii=new TextDecoder('latin1').decode(bytes.subarray(0,12));
  if (ascii.startsWith('RIFF') && ascii.slice(8,12)==='WEBP') return 'image/webp';
  throw new Error('PDF, PNG, JPG 또는 WebP 파일을 선택해 주세요. HEIC 사진은 JPG나 PNG로 변환한 뒤 불러와 주세요.');
}

export async function imageTemplate(bytes, type, lib) {
  const image=new Image(),url=URL.createObjectURL(new Blob([bytes],{type}));
  let canvas;
  try {
    image.src=url;
    try { await image.decode(); } catch { throw new Error('이미지를 읽을 수 없습니다. 손상되지 않은 PNG·JPG·WebP 파일을 선택해 주세요.'); }
    const width=image.naturalWidth,height=image.naturalHeight;
    if(!width||!height||width*height>40000000) throw new Error('이미지는 4천만 화소 이하로 첨부해 주세요. 이미지 크기를 줄인 뒤 다시 불러와 주세요.');
    // Browser decoding applies JPEG orientation; flatten transparency onto white.
    const scale=Math.min(1,3000/Math.max(width,height));
    canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이미지를 처리할 수 없습니다. 브라우저를 다시 열어 주세요.');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const doc=await lib.PDFDocument.create(),picture=await doc.embedPng(canvas.toDataURL('image/png'));
    const pointScale=841.89/Math.max(canvas.width,canvas.height),pageWidth=canvas.width*pointScale,pageHeight=canvas.height*pointScale;
    const page=doc.addPage([pageWidth,pageHeight]);page.drawImage(picture,{x:0,y:0,width:pageWidth,height:pageHeight});
    doc.setCreator('출석부 작업실');
    return {bytes:await doc.save(),width,height};
  } finally {URL.revokeObjectURL(url);if(canvas){canvas.width=1;canvas.height=1;}}
}
