'use strict';
window.StayPdf=(()=>{
  let epoch=0,task=null,library=null;
  const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text)e.textContent=text;return e;};
  function close(){epoch++;if(task){task.destroy().catch(()=>{});task=null;}}
  async function show(asset,container,url){
    close();const current=epoch;
    const status=node('p','pdf-status','正在渲染 PDF…'),paper=node('div','pdf-document'),canvas=node('canvas','pdf-canvas'),toolbar=node('div','pdf-toolbar');
    const prev=node('button','','上一页'),next=node('button','','下一页'),label=node('span','');prev.type=next.type='button';toolbar.append(prev,label,next);paper.append(canvas);container.append(status,toolbar,paper);toolbar.hidden=paper.hidden=true;
    try{
      const lib=await(library??=import('./vendor/pdf.mjs'));if(current!==epoch)return;
      lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
      task=lib.getDocument({url,cMapUrl:new URL('./vendor/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/standard_fonts/',location.href).href,wasmUrl:new URL('./vendor/wasm/',location.href).href,withCredentials:false,isEvalSupported:false,enableXfa:false,useSystemFonts:true});
      const pdf=await task.promise;if(current!==epoch)return;let pageNumber=1,busy=false;
      async function draw(){busy=true;prev.disabled=next.disabled=true;try{const page=await pdf.getPage(pageNumber);if(current!==epoch)return;const initial=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1.5,Math.max(180,container.clientWidth-24)/initial.width)}),ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;if(current!==epoch)return;canvas.setAttribute('aria-label',asset.file.fileName+'，第 '+pageNumber+' 页，共 '+pdf.numPages+' 页');status.hidden=true;toolbar.hidden=paper.hidden=false;label.textContent=pageNumber+' / '+pdf.numPages;}finally{busy=false;prev.disabled=pageNumber<=1;next.disabled=pageNumber>=pdf.numPages;}}
      const error=()=>{if(current===epoch){status.hidden=false;status.textContent='此页暂时无法预览，可以下载原文件查看。';}};
      prev.onclick=()=>{if(!busy&&pageNumber>1){pageNumber--;draw().catch(error);}};next.onclick=()=>{if(!busy&&pageNumber<pdf.numPages){pageNumber++;draw().catch(error);}};await draw();
    }catch{if(current===epoch){status.textContent='此 PDF 暂时无法预览，可以下载原文件查看。';toolbar.hidden=paper.hidden=true;}}
  }
  return {show,close};
})();
