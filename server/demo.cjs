'use strict';
const {createDocument}=require('./domain.cjs');
function originalPdf(title,lines){
  const encode=v=>v.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const content=`BT /F1 21 Tf 54 778 Td (${encode(title)}) Tj /F1 11 Tf 0 -34 Td\n`+lines.map(v=>`(${encode(v)}) Tj 0 -22 Td`).join('\n')+'\nET';
  const parts=[null,'<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(let i=1;i<parts.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i} 0 obj\n${parts[i]}\nendobj\n`;}
  const start=Buffer.byteLength(pdf);pdf+=`xref\n0 ${parts.length}\n0000000000 65535 f \n`+offsets.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${parts.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf,'ascii');
}
async function seed(store){
  if((await store.list()).length)return;
  const listings=require('../data/index.json').items.slice(0,3);
  for(let i=0;i<listings.length;i++){
    const bytes=originalPdf(['Seattle arrival checklist','Shared stay etiquette','A lighter travel bag'][i],[
      'Original educational guide prepared for StayAtlas.',
      'Reference listing: '+listings[i].id+'. Data snapshot: 2016-01-04.',
      'This worksheet does not describe the actual property or a real guest stay.',
      ...[
        ['Before travel, confirm the current address with the host.','Save offline directions and an emergency contact.','Check current arrival times and accessibility requirements.','Historical prices are not current booking quotations.'],
        ['Agree quiet hours before arrival.','Keep valuables secure and respect other occupants.','Ask the current host about waste sorting and check-out.','Write notes without publishing personal contact details.'],
        ['Carry essential documents and a reusable water bottle.','Check current weather before selecting clothing.','Keep a small offline copy of your itinerary.','Share only media you have permission to publish.']
      ][i]
    ]);
    const title=['抵达西雅图：出发前检查清单','共享住宿：入住礼仪备忘','轻装出发：旅行打包指南'][i];
    const {document}=createDocument({listingId:listings[i].id,title,creatorName:'StayAtlas 编辑',description:'原创演示指南，展示 PDF 分享与预览。内容为通用旅行建议，与历史房源关联仅用于课程演示，不代表房东提供的实际服务。',tags:['原创指南','旅行准备'],language:'en',rights:'original',upload:{fileName:`stayatlas-guide-${i+1}.pdf`,contentType:'application/pdf',dataBase64:bytes.toString('base64')}});
    document.createdAt=document.updatedAt=new Date(Date.now()-(i+1)*86400000).toISOString();await store.create(document,bytes);
  }
}
module.exports={seed,originalPdf};
