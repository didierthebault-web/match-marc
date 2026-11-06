const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/didie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');let browser,server;
const largePath=path.join(root,'tests','performance-corpus.mrc');
(async()=>{
  const {makeMARC,isbn,concatenate}=await import('../scripts/fixtures.js');
  const bytes=Buffer.from(concatenate(Array.from({length:100000},(_,i)=>makeMARC({id:String(i),title:'Ressource synthétique '+i,isbn:isbn(i+1)}))));
  fs.writeFileSync(largePath,bytes);
  server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url));fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(b);});});await new Promise(r=>server.listen(8797,'127.0.0.1',r));
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(120000);await page.goto('http://127.0.0.1:8797/');
  await page.evaluate(()=>{window.beats=0;window.maxLag=0;let last=performance.now();setInterval(()=>{const now=performance.now();window.beats++;window.maxLag=Math.max(window.maxLag,now-last);last=now;},50);});
  const started=Date.now();const stages={};for(const side of ['pmb','koha']){const t=Date.now();await page.locator('#file-'+side).setInputFiles(largePath);await page.waitForFunction(side=>!document.querySelector('#file-'+side).disabled&&document.querySelector('#stats-'+side).textContent.includes('100'),side);stages['load_'+side+'Ms']=Date.now()-t;}
  let t=Date.now();await page.locator('#compare').click();await page.locator('#marc-export').waitFor();stages.compareMs=Date.now()-t;assert.deepEqual(await page.locator('.metric strong').allTextContents(),['100 000','0','0']);
  t=Date.now();await page.locator('[data-tab="duplicate"]').click();assert.equal(await page.locator('#table-wrap tbody tr').count(),50);stages.tableMs=Date.now()-t;
  const runtime=await page.evaluate(()=>({beats:window.beats,maxMainThreadDelayMs:Math.round(window.maxLag),heapUsedMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null}));assert(runtime.beats>10);
  // Cancellation terminates an active worker without waiting for its synchronous loop.
  await page.locator('#compare').click();await page.locator('#cancel').click();assert(await page.locator('#compare').isDisabled());assert((await page.locator('#message').innerText()).includes('annulé'));assert.deepEqual(errors,[]);
  const report={date:new Date().toISOString(),noticesPerCorpus:100000,bytesPerCorpus:bytes.length,totalMs:Date.now()-started,stages,...runtime,cancellation:true,errors};fs.writeFileSync(path.join(root,'tests/browser-large-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(fs.existsSync(largePath))fs.unlinkSync(largePath);});
