const assert = require('node:assert/strict');
const {selectDate, parseDate, normalizeDate, rangeConfirmed} = require('../extension/calendar-select.js');

function calendarFixture(initial, final) {
  let month = initial.getFullYear() * 12 + initial.getMonth();
  let open = false;
  const clicks = [];
  const field = {value:'', getAttribute:()=>null};
  function days() {
    const first = new Date(Math.floor(month/12), month%12, 1);
    const mondayOffset = (first.getDay()+6)%7;
    return Array.from({length:42},(_,i)=>{
      const date = new Date(first.getFullYear(),first.getMonth(),i-mondayOffset+1);
      return {getAttribute:()=>date.toLocaleDateString(),click(){
        assert.equal(date.getTime(),final.getTime());
        assert.equal(date.getMonth(),month%12,'select from displayed month');
        clicks.push('day'); field.value = [date.getDate(),date.getMonth()+1,date.getFullYear()].map((x,i)=>i<2?String(x).padStart(2,'0'):x).join('-');open=false;
      }};
    });
  }
  const calendar = {
    getClientRects:()=>open?[1]:[],
    querySelectorAll:()=>days(),
    querySelector(selector){
      const direction=selector.includes('keyboardArrowLeft')?-1:1;
      return {closest:()=>({disabled:false,click(){clicks.push(direction);month+=direction}})};
    }
  };
  const icon = {closest:()=>({click(){open=true}})};
  const wrapper = {querySelector:selector=>selector.includes('calendarToday')?icon:null};
  field.closest=()=>wrapper;
  return {field,document:{querySelectorAll:()=>open?[calendar]:[]},sleep:async()=>{},clicks};
}

(async()=>{
  assert.equal(parseDate('31-02-2026'),null);
  assert.equal(parseDate('29-02-2024').getMonth(),1);
  assert.equal(normalizeDate('2026-10-01T00:00:00.000Z'),'2026-10-01');
  assert.equal(normalizeDate('01-10-2026'),'2026-10-01');
  for(const [initial,value] of [[new Date(2026,10,11),'01-10-2026'],[new Date(2027,0,1),'31-12-2026'],[new Date(2026,11,1),'01-01-2027'],[new Date(2026,9,1),'31-10-2026'],[new Date(2024,2,1),'29-02-2024']]){
    const fixture=calendarFixture(initial,parseDate(value));
    await selectDate(fixture.field,value,fixture);
    assert.equal(fixture.field.value,value);
    assert.equal(fixture.clicks.at(-1),'day');
    console.log('PASS: calendar selection',initial.toLocaleDateString(),'->',value);
  }
  const field=value=>({value,getAttribute:()=>null,closest:()=>({querySelector:()=>null})});
  const from=field('01-10-2026'),to=field('31-10-2026');
  const event={path:'/company/a/purchase',from:'2026-10-01T00:00:00',to:'2026-10-31T00:00:00',count:8};
  const check=(events,path,apply)=>rangeConfirmed(from,to,from.value,to.value,events,path,apply);
  assert.equal(check([event],event.path,{disabled:true}),event);
  assert.equal(check([event],event.path,null),event);
  assert.equal(check([event],event.path,{disabled:false}),null);
  assert.equal(check([event],'/company/b/purchase',null),null);
  assert.equal(check([],event.path,null),null);
  from.getAttribute=()=> 'true';
  assert.equal(check([event],event.path,null),null);
  console.log('PASS: already-applied range accepted; pending, invalid, unconfirmed and wrong-company ranges rejected');

  const vm=require('node:vm'),fs=require('node:fs');
  const messages=[];let listener;
  const win={postMessage:(m)=>messages.push(m),addEventListener:(name,fn)=>listener=fn,
    fetch:async()=>({clone:()=>({json:async()=>({data:{GetInvoices:{DateRange:{DateFrom:'2026-10-01',DateTo:'2026-10-31'},FilteredCount:8,Items:[]}}})})})};
  const context={window:win,location:{origin:'https://app.symfonia.pl',pathname:event.path}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../extension/hook.js'),'utf8'),context);
  await win.fetch('/graphql',{body:JSON.stringify({operationName:'GetInvoices'})});
  await new Promise(resolve=>setImmediate(resolve));
  const count=messages.length;
  listener({source:win,origin:context.location.origin,data:{__ksefSnapshotRequest:true}});
  assert.equal(messages.length,count+1);
  assert.equal(messages.at(-1).data.path,event.path);
  context.location.pathname='/company/b/purchase';
  listener({source:win,origin:context.location.origin,data:{__ksefSnapshotRequest:true}});
  assert.equal(messages.length,count+1);
  console.log('PASS: initial-response replay works and is scoped to current company route');
})().catch(error=>{console.error(error);process.exitCode=1});
