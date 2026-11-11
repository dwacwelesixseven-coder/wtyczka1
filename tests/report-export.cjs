const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {findExportButton}=require('../extension/report-export.js');
const button=(extra={})=>({textContent:'Eksportuj',getClientRects:()=>[1],getAttribute:()=>null,...extra});
const dialog=(text,buttons,shown=true)=>({textContent:text,getClientRects:()=>shown?[1]:[],querySelectorAll:()=>buttons});
(async()=>{
  const right=button({textContent:'  Eksportuj\n '});
  const hidden=dialog('Eksport raportu do pliku XLS',[button()],false);
  const unrelated=dialog('Eksport innych danych',[button()]);
  const report=dialog('Eksport raportu do pliku XLS Czy chcesz wykonać raport?',[button({textContent:'Anuluj'}),right]);
  assert.equal(findExportButton({querySelectorAll:()=>[hidden,unrelated,report]}),right);
  assert.equal(findExportButton({querySelectorAll:()=>[report,hidden,unrelated]}),right);
  console.log('PASS: visible XLS dialog found regardless of hidden/unrelated modal ordering');
  assert.equal(findExportButton({querySelectorAll:()=>[unrelated]}),null);
  assert.equal(findExportButton({querySelectorAll:()=>[dialog('Eksport raportu do pliku XLS',[button({disabled:true})])]}),null);
  assert.equal(findExportButton({querySelectorAll:()=>[dialog('Eksport raportu do pliku XLS',[button({getClientRects:()=>[]})])]}),null);
  console.log('PASS: unrelated, hidden or disabled Export buttons are rejected');
  let clicks=0,expected=0;
  const source=fs.readFileSync(require.resolve('../extension/content.js'),'utf8')
    .replace('  // The app is a single-page app:', '  globalThis.testExportXls = exportXls;\n  // The app is a single-page app:');
  const ready=button({click(){clicks++}});
  const context={window:{addEventListener(){},postMessage(){}},location:{origin:'https://app.symfonia.pl',pathname:'/test'},
    document:{querySelector(){throw Error('Already open modal must be reused without opening list menu')},querySelectorAll:()=>[]},
    chrome:{runtime:{sendMessage:async msg=>{if(msg.type==='expectDownload'){expected++;return {ok:true}}return true}}},
    KsefReport:{findExportButton:()=>ready},setTimeout:fn=>{fn();return 0},setInterval(){}};
  vm.createContext(context);vm.runInContext(source,context);
  await context.testExportXls('report','task');
  assert.equal(clicks,1);assert.equal(expected,1);
  console.log('PASS: existing export dialog is reused and confirmation clicked exactly once');
})().catch(error=>{console.error(error);process.exitCode=1});
