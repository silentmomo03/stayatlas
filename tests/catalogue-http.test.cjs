'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createServer}=require('../server/local.cjs');
test('actual HTTP catalogue exposes nested reviews and static chunks while historic records stay read-only',async t=>{
 const parent=path.resolve(__dirname,'../.local/test-data');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'catalogue-'));const {server}=await createServer({dataDir:directory,seedData:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.ok(path.resolve(directory).startsWith(parent+path.sep));await fs.rm(directory,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port;
 const list=await fetch(base+'/api/listings?guests=4&maxPrice=100&pageSize=5');assert.equal(list.status,200);assert.equal((await list.json()).items.length,5);
 const detail=await fetch(base+'/api/listings/241032');assert.equal((await detail.json()).listing.name,'Stylish Queen Anne Apartment');
 const reviews=await fetch(base+'/api/listings/241032/reviews');assert.equal((await reviews.json()).subsetTotal,20);
 const forbidden=await fetch(base+'/api/listings/241032',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(forbidden.status,405);assert.equal(forbidden.headers.get('Allow'),'GET');
 const index=await fetch(base+'/data/index.json');assert.equal(index.status,200);assert.ok(index.headers.get('Content-Type').includes('application/json'));assert.equal((await index.json()).listingCount,1000);
 const chunk=await fetch(base+'/data/reviews/241032.json');assert.equal(chunk.status,200);assert.equal((await chunk.json()).items.length,20);
 assert.equal((await fetch(base+'/data/../package.json')).status,404);assert.equal((await fetch(base+'/.local/cloud/resources.json')).status,404);
 const config=await(await fetch(base+'/api/config')).json();assert.equal(config.maxFileBytes,3*1024*1024);
});
