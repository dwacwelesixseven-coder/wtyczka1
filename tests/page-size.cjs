const assert = require('node:assert/strict');
const {ensure50} = require('../extension/page-size.js');
const waitFor = async fn => fn() || null;
function fixture(value='10') {
  let opened=false, clicks=0, reloads=0;
  const visible=()=>[1];
  const control={textContent:value,getClientRects:visible,getAttribute:name=>name==='aria-controls'?'page-size-list':null,
    click(){opened=true;clicks++},scrollIntoView(){}};
  const target={click(){control.textContent='50';opened=false;clicks++}};
  const option={textContent:'50',getClientRects:visible,querySelector:()=>target};
  const list={getClientRects:()=>opened?[1]:[],querySelectorAll:()=>[option]};
  const label={textContent:'Pokaż na stronie:',getClientRects:visible,parentElement:{querySelectorAll:()=>[control]}};
  const doc={querySelectorAll:()=>[label],getElementById:id=>{assert.equal(id,'page-size-list');return list}};
  return {document:doc,waitFor,waitForReload:async mark=>{assert.equal(typeof mark,'number');reloads++;return true},
    stats:()=>({clicks,reloads}),control};
}
(async()=>{
  const changed=fixture();
  assert.equal(await ensure50(changed),true);
  assert.equal(changed.control.textContent,'50');
  assert.deepEqual(changed.stats(),{clicks:2,reloads:1});
  console.log('PASS: selects nested 50 option in linked page-size dropdown and waits for server reload');
  const unchanged=fixture('50');
  assert.equal(await ensure50(unchanged),false);
  assert.deepEqual(unchanged.stats(),{clicks:0,reloads:0});
  console.log('PASS: existing page size 50 is left unchanged');
  const failed=fixture();failed.waitForReload=async()=>false;
  await assert.rejects(ensure50(failed),/Lista nie odświeżyła/);
  console.log('PASS: invoice selection cannot continue if page-size reload is unconfirmed');
  const missing={document:{querySelectorAll:()=>[]},waitFor,allowMissing:true};
  assert.equal(await ensure50(missing),false);
  await assert.rejects(ensure50({...missing,allowMissing:false}),/Nie znalazłem pola/);
  console.log('PASS: absent pagination is accepted only for a confirmed list of at most 50');
})().catch(error=>{console.error(error);process.exitCode=1});
