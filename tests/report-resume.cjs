const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const background=fs.readFileSync(require.resolve('../extension/background.js'),'utf8');
const task={id:'company:purchase',companyId:'company',tenantId:'tenant',name:'Firma (test)',nip:'1234567890',kind:'purchase',from:'01-10-2026',to:'31-10-2026',report:true,formats:['PDF']};
const run={started:Date.parse('2026-11-11T12:00:00Z'),active:true,paused:false,tabId:8,idx:0,month:'2026-10',tasks:[task],results:{},log:[]};
function fixture(data={run:structuredClone(run)},files=[]){
  const listeners={},event=name=>({addListener(fn){listeners[name]=fn;}});
  const local={async get(key){if(key===null)return structuredClone(data);return {[key]:structuredClone(data[key])};},async set(value){Object.assign(data,structuredClone(value));},async remove(keys){for(const key of keys)delete data[key];}};
  const context=vm.createContext({importScripts(){},setTimeout,clearTimeout,notifyKsefRun:async()=>{},
    chrome:{storage:{local},action:{setBadgeText:async()=>{}},runtime:{onMessage:event('message')},
      tabs:{onUpdated:event('updated'),onRemoved:event('removed'),update:async()=>({})},
      downloads:{onCreated:event('created'),onDeterminingFilename:event('filename'),onChanged:event('changed'),
        async search(query){return files.filter(f=>query.id!=null?f.id===query.id:(!query.state||f.state===query.state));}}}});
  vm.runInContext(background,context);
  const send=(message)=>new Promise(resolve=>listeners.message(message,{tab:{id:8}},resolve));
  return {context,data,files,listeners,send};
}
const download=(f,id=10)=>({id,url:'blob:https://app.symfonia.pl/test',startTime:'2026-11-11T12:01:00Z',state:'complete',exists:true,
  filename:'C:/Users/Test/Downloads/'+f.context.fileNameFor('report',task,run,'.xlsx')});
async function takeTask(f){return await f.send({type:'getTask',url:f.context.taskUrl(task)});}
(async()=>{
  // End-to-end: complete XLS, PDF fails, resume after storage/worker restart.
  const f=fixture();assert.equal((await takeTask(f)).reportDownloaded,false);
  const waiting=f.send({type:'expectDownload',name:'report',timeout:1000});
  await new Promise(r=>setImmediate(r));
  const file=download(f);f.files.push(file);f.listeners.created(file);
  await f.listeners.changed({id:file.id,state:{current:'complete'}});
  assert.equal((await waiting).ok,true);
  await f.send({type:'taskDone',taskId:task.id,result:{ok:false,error:'PDF menu failed'}});
  assert.equal(f.data.run.paused,true);
  const restarted=fixture(f.data,f.files);
  await restarted.send({type:'resume',tabId:8});
  assert.equal((await takeTask(restarted)).reportDownloaded,true);
  // Checkpoint also survives a filename rename by the browser or user.
  f.files[0].filename='C:/Users/Test/Downloads/renamed.xlsx';
  assert.equal(await restarted.context.reportWasDownloaded(f.data.run,task),true);
  f.files[0].exists=false;
  assert.equal(await restarted.context.reportWasDownloaded(f.data.run,task),false);
  console.log('PASS: completed report survives a later PDF failure, Resume and worker restart; deleted file is retried');

  // Recover the already downloaded report from version 1.0.17, with no checkpoint.
  const legacy=fixture();legacy.files.push(download(legacy));
  assert.equal((await takeTask(legacy)).reportDownloaded,true);
  const checkpoint=legacy.context.reportCheckpointKey(run,task);
  assert.equal(legacy.data[checkpoint].downloadId,10);
  assert.equal(await legacy.context.reportWasDownloaded({...run,started:run.started+120000},task),false);
  for(const variant of [
    {state:'interrupted'}, {state:'in_progress'}, {exists:false},
    {startTime:'2026-11-11T11:59:00Z'}, {startTime:undefined},
    {filename:download(legacy).filename.replace('Zakupowe','Sprzedazowe')},
    {filename:download(legacy).filename.replace('1234567890','9999999999')},
    {filename:download(legacy).filename.replace('2026-10','2026-09')},
    {filename:download(legacy).filename+'.zip'},
    {url:'https://other.example/report.xlsx'}
  ]){
    const fresh=fixture();fresh.files.push({...download(fresh),...variant});
    assert.equal(await fresh.context.reportWasDownloaded(run,task),false,JSON.stringify(variant));
  }
  const duplicate=fixture();duplicate.files.push({...download(duplicate),filename:download(duplicate).filename.replace('.xlsx',' (1).xlsx').replace(/\//g,'\\')});
  assert.equal(await duplicate.context.reportWasDownloaded(run,task),true);
  console.log('PASS: legacy history recovery is limited to this run, company, month and list; interrupted downloads are retried');

  const interrupted=fixture();await takeTask(interrupted);
  const pending=interrupted.send({type:'expectDownload',name:'report',timeout:1000});await new Promise(r=>setImmediate(r));
  interrupted.listeners.created(download(interrupted));
  await interrupted.listeners.changed({id:10,state:{current:'interrupted'}});
  assert.equal((await pending).ok,false);
  assert.equal(interrupted.data[interrupted.context.reportCheckpointKey(run,task)],undefined);
  console.log('PASS: interrupted XLS never creates a completion checkpoint');

  const unavailable=fixture();unavailable.context.chrome.downloads.search=async()=>{throw Error('History unavailable');};
  assert.equal(await takeTask(unavailable),null);assert.equal(unavailable.data.run.paused,true);
  const freshRun=fixture({...structuredClone(f.data),'ksef-report:old':{downloadId:10},alertSound:false});
  await freshRun.context.startRun([{id:'company',tenantId:'tenant',name:'Firma',nip:'1234567890'}],
    {month:'2026-10',purchase:true,report:true,invoices:false,format:'PDF'},8);
  assert.ok(!Object.keys(freshRun.data).some(key=>key.startsWith('ksef-report:')));
  assert.equal(freshRun.data.alertSound,false);
  console.log('PASS: failed history lookup pauses safely; a new run clears only old report checkpoints');

  // Content script must skip only XLS while continuing invoice download steps.
  let exports=0,invoices=0;const messages=[];
  const content=fs.readFileSync(require.resolve('../extension/content.js'),'utf8').replace('  // The app is a single-page app:',`
    setRange=async()=>({count:1});
    exportXls=async()=>{globalThis.exports++};
    downloadPage=async()=>{globalThis.invoices++;return 1};
    globalThis.testRunTask=runTask;
    // The app is a single-page app:`);
  const context=vm.createContext({exports,invoices,window:{addEventListener(){},postMessage(){}},location:{origin:'https://app.symfonia.pl',pathname:'/test'},
    document:{querySelector:selector=>selector.startsWith('table')?{innerText:'Faktura testowa'}:null},chrome:{runtime:{sendMessage:async m=>messages.push(m)}},
    setTimeout(fn){fn();return 0;},setInterval(){}});
  vm.runInContext(content,context);
  const contentTask={...task,formats:['XML']};
  const skipped=await context.testRunTask({...contentTask,reportDownloaded:true});
  assert.equal(context.exports,0);assert.equal(context.invoices,1);assert.equal(skipped.reportOk,true);
  await context.testRunTask({...contentTask,reportDownloaded:false});
  assert.equal(context.exports,1);assert.equal(context.invoices,2);
  assert.ok(messages.some(m=>m.text?.includes('pomijam ponowny eksport')));
  console.log('PASS: Resume skips completed XLS and still downloads invoices; missing XLS is exported normally');
})().catch(error=>{console.error(error);process.exitCode=1});
