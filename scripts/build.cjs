'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{await require('./prepare-vendor.cjs').prepare();const root=path.join(__dirname,'..');const output=path.join(root,'dist');await fs.mkdir(output,{recursive:true});for(const file of ['index.html','app.js','styles.css','config.js','pdf-preview.js'])await fs.copyFile(path.join(root,'web',file),path.join(output,file));await fs.cp(path.join(root,'web/vendor'),path.join(output,'vendor'),{recursive:true});await fs.cp(path.join(root,'web/assets'),path.join(output,'assets'),{recursive:true});await fs.cp(path.join(root,'data'),path.join(output,'data'),{recursive:true});console.log('Built static frontend: dist/ (website + local PDF.js runtime)');})().catch(e=>{console.error(e);process.exitCode=1;});
