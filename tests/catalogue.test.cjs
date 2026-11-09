'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {getListing,listListings,listReviews,summary}=require('../server/catalogue.cjs');
const {createDocument,metadata,MAX_FILE_BYTES}=require('../server/domain.cjs');
const {originalPdf}=require('../server/demo.cjs');
const query=s=>new URLSearchParams(s);
test('verified real subset contains 1000 listings and 13130 reviews with no invented star ratings',()=>{
 const index=require('../data/index.json');assert.equal(index.items.length,1000);assert.equal(index.reviewCount,13130);assert.equal(index.snapshotDate,'2016-01-04');assert.ok(fs.statSync(path.join(__dirname,'../data/index.json')).size<250000);
 let count=0;for(const r of index.items){const reviews=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/reviews',r.id+'.json'),'utf8')).items;assert.ok(reviews.length>=2&&reviews.length<=20);assert.equal(reviews.length,r.reviewCount);assert.equal(r.currency,'USD');for(const v of reviews){assert.deepEqual(Object.keys(v).sort(),['comments','date','id']);assert.ok(v.comments.trim());}count+=reviews.length;}assert.equal(count,13130);
 assert.equal(summary().listingCount,1000);assert.ok(summary().neighbourhoods.includes('West Queen Anne'));assert.equal(getListing('241032').name,'Stylish Queen Anne Apartment');
});
test('listing pagination, neighbourhood, room type, guests, historical budget and sorting combine correctly',()=>{
 const first=listListings();assert.equal(first.total,1000);assert.equal(first.items.length,12);assert.equal(first.pages,84);assert.equal(listListings(query('page=2')).items[0].id,require('../data/index.json').items[12].id);
 const result=listListings(query('neighbourhood=West+Queen+Anne&roomType=Entire+home%2Fapt&guests=4&maxPrice=100&sort=price-asc&pageSize=50'));assert.ok(result.total>0);assert.ok(result.items.every(r=>r.neighbourhood==='West Queen Anne'&&r.roomType==='Entire home/apt'&&r.accommodates>=4&&r.nightlyPriceCents<=10000));assert.deepEqual(result.items.map(r=>r.nightlyPriceCents),result.items.map(r=>r.nightlyPriceCents).sort((a,b)=>a-b));assert.ok(listListings(query('q=stylish')).items.length>0);
 for(const s of ['page=0','page=1.5','pageSize=100','guests=-1','maxPrice=no','minPrice=100&maxPrice=1','sort=sql'])assert.throws(()=>listListings(query(s)),{status:400});
});
test('nested review search and date ranges return real matching comments with stable paging',()=>{
 const all=listReviews('241032',query('pageSize=50'));assert.equal(all.subsetTotal,20);assert.equal(all.total,20);assert.ok(all.items[0].date>=all.items.at(-1).date);
 const matched=listReviews('241032',query('q=quiet&from=2011-11-01&to=2012-12-31&pageSize=50'));assert.ok(matched.items.every(v=>v.comments.toLowerCase().includes('quiet')&&v.date>='2011-11-01'&&v.date<='2012-12-31'));
 assert.equal(listReviews('241032',query('q=impossible-query-abcdef')).total,0);assert.throws(()=>listReviews('241032',query('from=2016-02-31')),{status:400});assert.throws(()=>listReviews('241032',query('from=2016-01-01&to=2011-01-01')),{status:400});assert.throws(()=>getListing('../index'),{status:400});assert.throws(()=>getListing('999999999999'),{status:404});
});
test('new media keeps an immutable nested listing snapshot and cannot inject or rebind identity',()=>{
 const input={title:'Original guide',listingId:'241032',creatorName:'Traveller',rights:'original',upload:{fileName:'guide.pdf',contentType:'application/pdf',dataBase64:originalPdf('Fixture',['Original guide.']).toString('base64')}};
 const {document}=createDocument(input);assert.equal(document.listing.id,'241032');assert.equal(document.listing.snapshotDate,'2016-01-04');assert.equal(document.listing.nightlyPriceCents,8500);assert.equal(document.mediaType,'guide');assert.equal(MAX_FILE_BYTES,3*1024*1024);
 assert.throws(()=>createDocument({...input,listingId:'999999999999'}),{status:404});assert.throws(()=>createDocument({...input,listing:{name:'forged'}}),{status:400});assert.throws(()=>metadata({listingId:'241032'},true),{status:400});assert.throws(()=>metadata({listing:{id:'241032'}},true),{status:400});
});
