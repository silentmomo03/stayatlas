'use strict';
const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const base=String(window.STAYATLAS_CONFIG?.apiBase||'').replace(/\/$/u,''),absolute=path=>base+path;
const state={source:null,listings:[],assets:[],view:'explore',page:1,pageSize:12,config:null,listing:null,reviews:[],reviewPage:1,reviewEpoch:0,asset:null,editing:null,upload:null,uploadEpoch:0,accessResolve:null};
let token=sessionStorage.getItem('stayatlas-write-token')||'',saved;
try{saved=new Set(JSON.parse(localStorage.getItem('stayatlas-saved')||'[]'));}catch{saved=new Set();}
let toastTimer;
const types={'Entire home/apt':'整套房源','Private room':'独立房间','Shared room':'合住房间'};
const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n/100);
const date=iso=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
async function api(path,{method='GET',body}={}){
 const r=await fetch(absolute(path),{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Write-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',signal:AbortSignal.timeout(55000)});
 let data;try{data=r.status===204?null:await r.json();}catch{throw new Error('接口返回格式不正确。请确认从本地服务地址打开网页。');}
 if(!r.ok){if(r.status===401){token='';sessionStorage.removeItem('stayatlas-write-token');updateManage();}throw new Error(data?.error?.message||'操作未完成，请稍后重试。');}return data;
}
async function reference(path){const r=await fetch(path,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('历史数据暂时无法读取，请重新加载。');return r.json();}
function roomPhoto(item){const index=state.listings.findIndex(r=>r.id===item.id);return 'assets/room-'+((Math.max(0,index)%3)+1)+'.jpg';}
function updateManage(){$('access-button').hidden=!state.config?.writeAccessRequired;$('access-button').textContent=token?'退出管理':'管理';}
async function ensureAccess(){
 if(!state.config){toast('资料服务尚未连接，请稍后重试。');return false;}
 if(!state.config.writeAccessRequired||token)return true;
 $('access-error').hidden=true;$('access-form').reset();$('access-dialog').returnValue='';$('access-dialog').showModal();return new Promise(resolve=>state.accessResolve=resolve);
}
function favourite(item){
 if(saved.has(item.id))saved.delete(item.id);else saved.add(item.id);
 try{localStorage.setItem('stayatlas-saved',JSON.stringify([...saved]));}catch{toast('浏览器暂时无法保存收藏，此次收藏仅保留到页面关闭。');}
 $('saved-count').textContent=saved.size;if(state.listing?.id===item.id)$('save-listing').textContent=saved.has(item.id)?'已收藏，点击取消':'收藏房源';render();
}
function switchView(view){state.view=view;state.page=1;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('section-title').textContent={explore:'在西雅图，找一处灵感',saved:'留给下一次出发的灵感',media:'照片与指南，在这里相遇'}[view];$('section-eyebrow').textContent={explore:'FIND YOUR CORNER',saved:'YOUR SAVED PLACES',media:'THE SHARED NOTEBOOK'}[view];
 $('media-filter').hidden=view!=='media';$('budget-label').hidden=$('sort').parentElement.hidden=view==='media';$('search-form').hidden=view==='media';$('empty-action').textContent=view==='media'?'分享一份资料':'重置筛选';render();
}
function filteredListings(){
 const q=$('search').value.trim().toLowerCase(),n=$('neighbourhood').value,t=$('room-type').value,g=Number($('guests').value),max=$('max-price').value===''?Infinity:Number($('max-price').value)*100;
 let rows=state.listings.filter(r=>(state.view!=='saved'||saved.has(r.id))&&(!q||(r.name+' '+r.neighbourhood).toLowerCase().includes(q))&&(!n||r.neighbourhood===n)&&(!t||r.roomType===t)&&r.accommodates>=g&&r.nightlyPriceCents<=max);
 const sort=$('sort').value;if(sort!=='source')rows.sort((a,b)=>sort==='reviews'?b.reviewCount-a.reviewCount:sort==='price-asc'?a.nightlyPriceCents-b.nightlyPriceCents:b.nightlyPriceCents-a.nightlyPriceCents);return rows;
}
function listingCard(item){
 const card=el('article','listing-card'),wrap=el('div','card-image-wrap'),open=el('button','image-button'),img=el('img');open.type='button';open.setAttribute('aria-label','查看房源 '+item.name);img.src=roomPhoto(item);img.alt='住宿空间示意图，非该房源实拍';img.loading='lazy';open.append(img);open.onclick=()=>openListing(item);
 const save=el('button','favorite',saved.has(item.id)?'♥':'♡');save.type='button';save.setAttribute('aria-label',(saved.has(item.id)?'取消收藏 ':'收藏 ')+item.name);save.setAttribute('aria-pressed',String(saved.has(item.id)));save.onclick=()=>favourite(item);wrap.append(open,el('span','image-disclosure','示意图，非房源实拍'),save);
 const name=el('button','card-title',item.name);name.type='button';name.onclick=()=>openListing(item);
 const bottom=el('div','card-bottom'),price=el('div','card-price',money(item.nightlyPriceCents));price.append(el('span','price-label','/ 晚 · 2016 历史价'));bottom.append(price,el('span','',item.reviewCount+' 条保留评论'));
 card.append(wrap,el('p','card-neighbourhood',item.neighbourhood),name,el('p','card-summary',(types[item.roomType]||item.roomType)+' · 最多 '+item.accommodates+' 人'),bottom);return card;
}
function mediaCard(asset){
 const card=el('article','media-card'),wrap=el('div','card-image-wrap'),open=el('button','image-button');open.type='button';open.setAttribute('aria-label','预览资料 '+asset.title);open.onclick=()=>openAsset(asset);
 if(asset.mediaType==='photo'){const img=el('img');img.src=absolute(asset.fileUrl);img.alt=asset.title;img.loading='lazy';open.append(img);}else{const pdf=el('div','pdf-card');pdf.append(el('strong','','PDF'),el('span','','THE TRAVEL NOTEBOOK'),el('small','','STAYATLAS / ORIGINAL GUIDE'));open.append(pdf);}
 wrap.append(open,el('span','image-disclosure',asset.mediaType==='photo'?'共享照片':'PDF 旅行指南'));
 const title=el('button','card-title',asset.title);title.type='button';title.onclick=()=>openAsset(asset);const bottom=el('div','card-bottom');bottom.append(el('span','',asset.creatorName+' · '+size(asset.file.sizeBytes)),el('span','',date(asset.createdAt)));
 card.append(wrap,el('p','card-neighbourhood',asset.listing.neighbourhood),title,el('p','card-summary',asset.listing.name),bottom);return card;
}
function render(){
 const media=state.view==='media';const rows=media?state.assets.filter(a=>$('media-filter').value==='all'||a.mediaType===$('media-filter').value):filteredListings();const pages=Math.max(1,Math.ceil(rows.length/state.pageSize));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.pageSize;
 $('cards').replaceChildren(...rows.slice(start,start+state.pageSize).map(media?mediaCard:listingCard));$('empty-state').hidden=rows.length!==0;$('result-count').textContent=media?rows.length+' 份共享资料':rows.length+' 个匹配房源'+(rows.length?'，显示 '+(start+1)+'–'+Math.min(start+state.pageSize,rows.length):'');$('pagination').hidden=rows.length<=state.pageSize;$('page-number').textContent=state.page+' / '+pages;$('previous').disabled=state.page<=1;$('next').disabled=state.page>=pages;$('saved-count').textContent=saved.size;
}
function resetFilters(){$('search-form').reset();$('max-price').value='';$('sort').value='source';state.page=1;render();}
function listingMeta(item){const dl=$('listing-meta');dl.replaceChildren();for(const [k,v] of [['房源编号',item.id],['房型',types[item.roomType]||item.roomType],['可住人数',item.accommodates+' 人'],['历史每晚价格',money(item.nightlyPriceCents)+' USD'],['数据快照',item.snapshotDate]])dl.append(el('dt','',k),el('dd','',v));}
function related(){const target=$('listing-assets');target.replaceChildren();const rows=state.assets.filter(a=>a.listing.id===state.listing?.id);if(!rows.length)target.append(el('p','small-note','暂时没有资料。你可以分享一张照片或原创 PDF 指南。'));for(const a of rows){const b=el('button','related-asset',a.title);b.type='button';b.append(el('span','',(a.mediaType==='photo'?'照片':'PDF 指南')+' · '+a.creatorName));b.onclick=()=>{$('listing-dialog').close();openAsset(a);};target.append(b);}}
async function openListing(item){
 state.listing=item;state.reviews=[];state.reviewPage=1;const epoch=++state.reviewEpoch;$('listing-title').textContent=item.name;$('listing-photo').src=roomPhoto(item);$('listing-location').textContent=item.neighbourhood+' · Seattle';listingMeta(item);$('save-listing').textContent=saved.has(item.id)?'已收藏，点击取消':'收藏房源';$('review-form').reset();$('reviews').replaceChildren();$('review-total').textContent=item.reviewCount+' 条保留评论';$('review-status').textContent='正在读取这个房源的历史评论…';$('review-page').textContent='';related();if(!$('listing-dialog').open)$('listing-dialog').showModal();
 try{const data=await reference('data/reviews/'+item.id+'.json');if(epoch!==state.reviewEpoch)return;state.reviews=data.items;renderReviews();}catch(e){if(epoch===state.reviewEpoch)$('review-status').textContent=e.message;}
}
function renderReviews(){
 const q=$('review-search').value.trim().toLowerCase(),from=$('review-from').value,to=$('review-to').value;if(from&&to&&from>to){$('review-status').textContent='开始日期不能晚于结束日期。';return;}
 const rows=state.reviews.filter(r=>(!q||r.comments.toLowerCase().includes(q))&&(!from||r.date>=from)&&(!to||r.date<=to)).sort((a,b)=>b.date.localeCompare(a.date));const pages=Math.max(1,Math.ceil(rows.length/4));state.reviewPage=Math.min(state.reviewPage,pages);$('reviews').replaceChildren();$('review-status').textContent=rows.length+' 条匹配评论';
 for(const r of rows.slice((state.reviewPage-1)*4,state.reviewPage*4)){const article=el('article','review'),header=el('div','review-header'),time=el('time','',r.date);time.dateTime=r.date;header.append(el('span','review-avatar','s'),el('span','','历史住客'),time);const text=el('p','review-text',r.comments);article.append(header,text);if(r.comments.length>500){const b=el('button','text-button review-expand','展开完整评论');b.onclick=()=>{text.classList.toggle('review-expanded');b.textContent=text.classList.contains('review-expanded')?'收起评论':'展开完整评论';};article.append(b);}$('reviews').append(article);}
 $('review-page').textContent=state.reviewPage+' / '+pages;$('review-prev').disabled=state.reviewPage<=1;$('review-next').disabled=state.reviewPage>=pages;
}
async function reloadMedia(){const data=await api('/api/assets');state.assets=data.items;render();if(state.listing)related();}
async function openForm(asset=null,listingId=''){
 if(!await ensureAccess())return;state.editing=asset;state.upload=null;state.uploadEpoch++;$('asset-form').reset();$('form-error').hidden=true;$('file-status').textContent='';$('file-label').textContent='选择文件，或拖放到这里';$('file-section').hidden=!!asset;$('field-listing').disabled=!!asset;$('listing-edit-help').hidden=!asset;$('form-title').textContent=asset?'编辑资料信息':'分享旅行资料';$('submit-asset').disabled=false;$('submit-asset').textContent=asset?'保存修改':'发布资料 ↗';$('field-listing').value=asset?.listing.id||listingId;
 if(asset){for(const [field,key] of [['title','title'],['creator','creatorName'],['description','description'],['language','language'],['rights','rights']])$('field-'+field).value=asset[key];$('field-tags').value=asset.tags.join('，');}
 $('upload-dialog').showModal();
}
async function chooseFile(file){
 if(!file)return;state.upload=null;const epoch=++state.uploadEpoch;$('submit-asset').disabled=true;$('file-status').textContent='正在检查文件内容与大小…';
 try{if(!file.size||file.size>state.config.maxFileBytes)throw new Error('文件不能为空，且不能超过 3 MB。');const type={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'}[file.name.split('.').pop().toLowerCase()];if(!type)throw new Error('请选择 PNG、JPG 或 PDF 文件。');const dataBase64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('文件读取失败。'));r.readAsDataURL(file);});const upload={fileName:file.name,contentType:type,dataBase64};const checked=await api('/api/analyze',{method:'POST',body:upload});if(epoch!==state.uploadEpoch)return;state.upload=upload;$('file-label').textContent=file.name;$('file-status').textContent='✓ 类型与大小检查通过 · '+size(checked.file.sizeBytes)+(checked.file.width?' · '+checked.file.width+' × '+checked.file.height:'');if(!$('field-title').value)$('field-title').value=file.name.replace(/\.[^.]+$/u,'');}catch(e){if(epoch===state.uploadEpoch){$('file-status').textContent=e.message;toast(e.message);}}finally{if(epoch===state.uploadEpoch)$('submit-asset').disabled=false;}
}
function openAsset(asset){
 window.StayPdf.close();state.asset=asset;$('asset-title').textContent=asset.title;$('asset-listing').textContent=asset.listing.name+' ↗';$('asset-tags').replaceChildren(...asset.tags.map(t=>el('span','tag',t)));$('asset-description').textContent=asset.description||'分享者还没有填写说明。';$('translated').hidden=true;$('translation-help').textContent=state.config?.translationAvailable?'译文供阅读参考。原文会保留。':'Azure 翻译服务尚未连接。';$('translate').disabled=!state.config?.translationAvailable||!asset.description;$('translate').textContent=asset.language==='en'?'翻译为中文':'Translate to English';
 $('asset-meta').replaceChildren();for(const [k,v] of [['分享者',asset.creatorName],['文件类型',asset.file.contentType],['文件大小',size(asset.file.sizeBytes)],['分享日期',date(asset.createdAt)],['分享依据',{original:'本人原创',permission:'已获授权','public-domain':'公共领域'}[asset.rights]]])$('asset-meta').append(el('dt','',k),el('dd','',v));$('asset-preview').replaceChildren();$('download').href=absolute(asset.fileUrl+'?download=1');$('download').download=asset.file.fileName;if(!$('asset-dialog').open)$('asset-dialog').showModal();
 if(asset.mediaType==='photo'){const img=el('img');img.src=absolute(asset.fileUrl);img.alt=asset.title;$('asset-preview').append(img);}else window.StayPdf.show(asset,$('asset-preview'),absolute(asset.fileUrl));
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}));
$('asset-dialog').addEventListener('close',()=>window.StayPdf.close());$('listing-dialog').addEventListener('close',()=>state.reviewEpoch++);$('upload-dialog').addEventListener('close',()=>state.uploadEpoch++);
$('share-top').onclick=$('share-bottom').onclick=()=>openForm();$('share-listing').onclick=()=>{const id=state.listing.id;$('listing-dialog').close();openForm(null,id);};$('save-listing').onclick=()=>favourite(state.listing);$('asset-listing').onclick=()=>{const item=state.listings.find(r=>r.id===state.asset.listing.id);$('asset-dialog').close();if(item)openListing(item);};
$('search-form').onsubmit=e=>{e.preventDefault();state.page=1;render();};for(const id of ['sort','max-price','media-filter'])$(id).onchange=()=>{state.page=1;render();};$('reset-filters').onclick=resetFilters;$('empty-action').onclick=()=>state.view==='media'?openForm():resetFilters();$('previous').onclick=()=>{state.page--;render();$('catalogue').scrollIntoView();};$('next').onclick=()=>{state.page++;render();$('catalogue').scrollIntoView();};
$('review-form').onsubmit=e=>{e.preventDefault();state.reviewPage=1;renderReviews();};$('review-reset').onclick=()=>{$('review-form').reset();state.reviewPage=1;renderReviews();};$('review-prev').onclick=()=>{state.reviewPage--;renderReviews();};$('review-next').onclick=()=>{state.reviewPage++;renderReviews();};
$('upload-file').onchange=e=>chooseFile(e.target.files[0]);for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.add('dragover');});for(const name of ['dragleave','drop'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.remove('dragover');});$('dropzone').addEventListener('drop',e=>chooseFile(e.dataTransfer.files[0]));
$('asset-form').onsubmit=async e=>{
 e.preventDefault();$('form-error').hidden=true;if(!state.editing&&!state.upload){$('form-error').textContent='请先选择一份通过检查的文件。';$('form-error').hidden=false;return;}
 const body={title:$('field-title').value,creatorName:$('field-creator').value,description:$('field-description').value,tags:$('field-tags').value.split(/[,，]/u).map(v=>v.trim()).filter(Boolean),language:$('field-language').value,rights:$('field-rights').value};const editing=state.editing;$('submit-asset').disabled=true;$('submit-asset').textContent=editing?'正在保存…':'正在发布…';
 try{const result=await api('/api/assets'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',body:editing?body:{...body,listingId:$('field-listing').value,upload:state.upload}});$('upload-dialog').close();await reloadMedia();switchView('media');openAsset(result.asset);toast(editing?'资料信息已更新。':'资料已发布。');}catch(error){$('form-error').textContent=error.message;$('form-error').hidden=false;}finally{$('submit-asset').disabled=false;$('submit-asset').textContent=editing?'保存修改':'发布资料 ↗';}
};
$('edit').onclick=()=>{const asset=state.asset;$('asset-dialog').close();openForm(asset);};$('delete').onclick=async()=>{if(await ensureAccess())$('delete-dialog').showModal();};
$('delete-form').onsubmit=async e=>{e.preventDefault();$('confirm-delete').disabled=true;try{await api('/api/assets/'+state.asset.id,{method:'DELETE'});$('delete-dialog').close();$('asset-dialog').close();await reloadMedia();toast('资料已删除。');}catch(error){toast(error.message);}finally{$('confirm-delete').disabled=false;}};
$('translate').onclick=async()=>{if(!await ensureAccess())return;const asset=state.asset;$('translate').disabled=true;try{const result=await api('/api/translate',{method:'POST',body:{text:asset.description,to:asset.language==='en'?'zh-Hans':'en'}});if(state.asset.id===asset.id){$('translated').textContent=result.text;$('translated').hidden=false;}}catch(error){toast(error.message);}finally{$('translate').disabled=!state.config?.translationAvailable;}};
$('access-dialog').addEventListener('close',()=>{if(state.accessResolve){state.accessResolve($('access-dialog').returnValue==='allowed');state.accessResolve=null;}});$('access-form').onsubmit=async e=>{e.preventDefault();token=$('access-key').value;try{await api('/api/access',{method:'POST',body:{}});sessionStorage.setItem('stayatlas-write-token',token);updateManage();$('access-dialog').close('allowed');toast('已启用资料管理。');}catch(error){$('access-error').textContent=error.message;$('access-error').hidden=false;}};
$('access-button').onclick=async()=>{if(token){token='';sessionStorage.removeItem('stayatlas-write-token');updateManage();toast('已退出管理。');}else await ensureAccess();};
$('retry').onclick=initialize;
async function initialize(){
 $('page-error').hidden=true;
 try{const source=await reference('data/index.json');state.source=source;state.listings=source.items;$('listing-total').textContent=source.listingCount.toLocaleString();const n=$('neighbourhood');n.replaceChildren(el('option','','全部街区'));n.firstChild.value='';for(const name of [...new Set(source.items.map(i=>i.neighbourhood))].sort()){const option=el('option','',name);option.value=name;n.append(option);}const select=$('field-listing');select.replaceChildren(el('option','','请选择一个历史房源'));select.firstChild.value='';for(const r of source.items){const option=el('option','',r.name+' · #'+r.id);option.value=r.id;select.append(option);}render();
  try{state.config=await api('/api/config');updateManage();$('mode-label').textContent=state.config.mode==='azure'?'Azure 云端':'本机演示';$('storage-note').textContent=state.config.mode==='azure'?'资料保存于 Azure':'资料保存在当前电脑';await reloadMedia();}catch(error){$('mode-label').textContent='资料服务未连接';toast(error.message);}
 }catch(error){$('page-error').hidden=false;$('page-error').querySelector('p').textContent=error.message;$('cards').replaceChildren();$('result-count').textContent='数据载入失败';}
}
initialize();
