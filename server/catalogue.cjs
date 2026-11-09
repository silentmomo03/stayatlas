'use strict';
const fs=require('node:fs');
const path=require('node:path');
const source=require('../data/index.json');
const byId=new Map(source.items.map(item=>[item.id,item]));
const bad=message=>require('./domain.cjs').fail(400,'invalid_filter',message);
function getListing(id){
  if(typeof id!=='string'||!/^\d{1,12}$/u.test(id))bad('房源编号格式不正确。');
  const item=byId.get(id);if(!item)require('./domain.cjs').fail(404,'listing_not_found','历史数据中没有这个房源。');
  return {...item};
}
function number(query,key,{min=0,max=100000,defaultValue}={}){
  const raw=query.get(key);if(raw===null||raw==='')return defaultValue;
  if(!/^\d+(\.\d{1,2})?$/u.test(raw))bad('筛选数字格式不正确。');
  const value=Number(raw);if(value<min||value>max)bad('筛选数字超出范围。');return value;
}
function paging(items,query){
  const page=number(query,'page',{min:1,max:10000,defaultValue:1}),pageSize=number(query,'pageSize',{min:1,max:50,defaultValue:12});
  if(!Number.isInteger(page)||!Number.isInteger(pageSize))bad('分页参数必须是整数。');
  return {items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize,pages:Math.max(1,Math.ceil(items.length/pageSize))};
}
function listListings(query=new URLSearchParams()){
  const q=(query.get('q')||'').trim().toLowerCase();if(q.length>120)bad('搜索内容过长。');
  const neighbourhood=query.get('neighbourhood')||'',roomType=query.get('roomType')||'';
  const guests=number(query,'guests',{min:1,max:16,defaultValue:1}),min=number(query,'minPrice',{defaultValue:0}),max=number(query,'maxPrice',{defaultValue:100000});
  if(min>max)bad('最低价格不能超过最高价格。');
  let items=source.items.filter(r=>(!q||(r.name+' '+r.neighbourhood).toLowerCase().includes(q))&&(!neighbourhood||r.neighbourhood===neighbourhood)&&(!roomType||r.roomType===roomType)&&r.accommodates>=guests&&r.nightlyPriceCents>=min*100&&r.nightlyPriceCents<=max*100);
  const sort=query.get('sort')||'source';if(!['source','price-asc','price-desc','reviews'].includes(sort))bad('排序方式不正确。');
  if(sort!=='source')items=[...items].sort((a,b)=>sort==='reviews'?b.reviewCount-a.reviewCount:sort==='price-asc'?a.nightlyPriceCents-b.nightlyPriceCents:b.nightlyPriceCents-a.nightlyPriceCents);
  return {...paging(items,query),snapshotDate:source.snapshotDate};
}
function listReviews(id,query=new URLSearchParams()){
  getListing(id);const all=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/reviews',id+'.json'),'utf8')).items;
  const q=(query.get('q')||'').trim().toLowerCase();if(q.length>120)bad('评论搜索内容过长。');
  const from=query.get('from')||'',to=query.get('to')||'';
  for(const value of [from,to])if(value&&(!/^\d{4}-\d{2}-\d{2}$/u.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))bad('日期格式不正确。');
  if(from&&to&&from>to)bad('开始日期不能晚于结束日期。');
  const items=all.filter(r=>(!q||r.comments.toLowerCase().includes(q))&&(!from||r.date>=from)&&(!to||r.date<=to)).sort((a,b)=>b.date.localeCompare(a.date));
  return {...paging(items,query),listingId:id,subsetTotal:all.length};
}
function summary(){return {source:source.source,sourceUrl:source.sourceUrl,snapshotDate:source.snapshotDate,listingCount:source.listingCount,reviewCount:source.reviewCount,neighbourhoods:[...new Set(source.items.map(i=>i.neighbourhood))].sort(),roomTypes:[...new Set(source.items.map(i=>i.roomType))].sort()};}
module.exports={getListing,listListings,listReviews,summary};
