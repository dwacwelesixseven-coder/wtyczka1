const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {makeKsefWav}=require('../extension/notification-audio.js');
const source=fs.readFileSync(require.resolve('../extension/run-alerts.js'),'utf8');
function fixture(prefs={}) {
  const data={...prefs},calls={desktop:[],sound:[],created:0},state={exists:false};
  const chrome={
    storage:{local:{get:async()=>({...data}),set:async values=>Object.assign(data,values)}},
    action:{setBadgeText:async()=>{}},
    notifications:{getPermissionLevel:async()=> 'granted',create:async(id,options)=>calls.desktop.push({id,...options}),onClicked:{addListener(){}}},
    runtime:{getURL:path=>'chrome-extension://test/'+path,getContexts:async()=>state.exists?[{}]:[],sendMessage:async message=>{calls.sound.push(message);return {ok:true}}},
    offscreen:{createDocument:async options=>{assert.deepEqual([...options.reasons],['AUDIO_PLAYBACK']);calls.created++;state.exists=true}},
  };
  const context={chrome,setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(source,context);
  return {context,calls,data,chrome};
}
(async()=>{
  const standard=fixture();
  assert.equal((await standard.context.notifyKsefRun('error','Test error')).ok,true);
  assert.equal(standard.calls.desktop[0].requireInteraction,true);
  assert.equal(standard.calls.sound[0].kind,'error');
  await standard.context.notifyKsefRun('complete','Done');
  assert.equal(standard.calls.sound[1].kind,'complete');
  assert.equal(standard.calls.created,1,'reuse audio document');
  console.log('PASS: error and completion trigger desktop and distinct audio alerts');
  const disabled=fixture({alertDesktop:false,alertSound:false});
  assert.equal((await disabled.context.notifyKsefRun('complete','Done')).ok,true);
  assert.equal(disabled.calls.desktop.length,0);assert.equal(disabled.calls.sound.length,0);
  console.log('PASS: sound and desktop opt-outs respected');
  const failed=fixture();failed.chrome.runtime.sendMessage=async()=>({ok:false,error:'Audio blocked'});
  const result=await failed.context.notifyKsefRun('error','Error');
  assert.equal(result.ok,false);assert.equal(failed.calls.desktop.length,1);
  console.log('PASS: audio failure does not prevent desktop alert or reject download controller');
  for(const kind of ['error','complete']) {
    const bytes=makeKsefWav(kind),buffer=Buffer.from(bytes),view=new DataView(bytes.buffer);
    assert.equal(buffer.subarray(0,4).toString(),'RIFF');assert.equal(buffer.subarray(8,12).toString(),'WAVE');
    assert.equal(view.getUint32(40,true),bytes.length-44);assert.equal(view.getUint32(24,true),22050);
    assert.ok(bytes.length>1000);
  }
  assert.notDeepEqual(makeKsefWav('error'),makeKsefWav('complete'));
  console.log('PASS: both generated sound files are valid and different PCM WAV data');

  let run={active:true,paused:false,idx:0,tasks:[],month:'2026-10',log:[]};
  const alerts=[];let messageListener;
  const event={addListener(){}};
  const context={importScripts(){},setTimeout,clearTimeout,
    notifyKsefRun:async(...args)=>alerts.push(args),
    chrome:{storage:{local:{get:async()=>({run:structuredClone(run)}),set:async value=>{if(value.run)run=structuredClone(value.run)}}},
      action:{setBadgeText:async()=>{}},
      runtime:{onMessage:{addListener:fn=>messageListener=fn}},
      downloads:{onCreated:event,onDeterminingFilename:event,onChanged:event},
      tabs:{onUpdated:event,onRemoved:event,update:async()=>({})}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8'),context);
  await context.goToCurrent();await context.goToCurrent();
  assert.equal(alerts.length,1);assert.equal(alerts[0][0],'complete');
  run={active:true,paused:false,idx:0,tasks:[{id:'a'}],month:'2026-10',log:[]};alerts.length=0;
  await context.pause('Paused','Concrete error');await context.pause('Paused again');
  assert.equal(alerts.length,1);assert.equal(alerts[0][0],'error');assert.equal(alerts[0][1],'Concrete error');
  run.paused=false;alerts.length=0;
  await new Promise(resolve=>messageListener({type:'stop'},{},resolve));
  assert.equal(alerts.length,0);
  console.log('PASS: one alert on completion or first pause; manual Stop sends no completion/error alert');
})().catch(error=>{console.error(error);process.exitCode=1});
