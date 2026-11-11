const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {findExportButton}=require('../extension/report-export.js');
const button=(extra={})=>({textContent:'Eksportuj',getClientRects:()=>[1],getAttribute:()=>null,...extra});
const dialog=(text,buttons,shown=true)=>({textContent:text,getClientRects:()=>shown?[1]:[],querySelectorAll:()=>buttons});
const modalDoc=dialogs=>({querySelectorAll:selector=>selector==='button,[role="button"]'
  ? dialogs.filter(element=>element.getClientRects().length).flatMap(element=>element.querySelectorAll()) : dialogs});
(async()=>{
  const right=button({textContent:'  Eksportuj\n '});
  const hidden=dialog('Eksport raportu do pliku XLS',[button()],false);
  const unrelated=dialog('Eksport innych danych',[button()]);
  const report=dialog('Eksport raportu do pliku XLS Czy chcesz wykonać raport?',[button({textContent:'Anuluj'}),right]);
  assert.equal(findExportButton(modalDoc([hidden,unrelated,report])),right);
  assert.equal(findExportButton(modalDoc([report,hidden,unrelated])),right);
  console.log('PASS: visible XLS dialog found regardless of hidden/unrelated modal ordering');
  // Native textContent does not insert whitespace between the title DIV and
  // the description DIV. This is the real-dialog case rejected by 1.0.15.
  const joined=dialog('Eksport raportu do pliku XLSCzy chcesz wykonać raport z rekordów znajdujących się na przefiltrowanej liście?AnulujEksportuj',[right]);
  right.parentElement=joined;
  assert.equal(findExportButton(modalDoc([joined])),right);
  const joinedUnmarkedDoc={querySelectorAll:selector=>selector==='button,[role="button"]'?[right]:[]};
  assert.equal(findExportButton(joinedUnmarkedDoc),right);
  console.log('PASS: concatenated XLSCzy title/body works with both modal and direct-button detection');
  assert.equal(findExportButton(modalDoc([unrelated])),null);
  assert.equal(findExportButton(modalDoc([dialog('Eksport raportu do pliku XLS',[button({disabled:true})])])),null);
  assert.equal(findExportButton(modalDoc([dialog('Eksport raportu do pliku XLS',[button({getClientRects:()=>[]})])])),null);
  console.log('PASS: unrelated, hidden or disabled Export buttons are rejected');
  const unmarkedButton=button();
  const unmarkedContainer={textContent:'Eksport raportu do pliku XLS Czy chcesz wykonać raport? Anuluj Eksportuj',parentElement:null};
  unmarkedButton.parentElement={textContent:'Anuluj Eksportuj',parentElement:unmarkedContainer};
  const unmarkedDoc={querySelectorAll:selector=>selector==='button,[role="button"]'?[unmarkedButton]:[]};
  assert.equal(findExportButton(unmarkedDoc),unmarkedButton);
  console.log('PASS: export button found in unmarked dialog with no modal selectors');
  const contentsButton=button();
  const contentsContainer=dialog('Eksport raportu do pliku XLS',[contentsButton],false);
  contentsButton.parentElement=contentsContainer;
  const contentsDoc={querySelectorAll:selector=>selector==='button,[role="button"]'?[contentsButton]:[contentsContainer]};
  assert.equal(findExportButton(contentsDoc),contentsButton);
  console.log('PASS: visible button found when modal wrapper has no rectangle (display:contents)');
  unmarkedContainer.textContent='Eksport innych danych';
  assert.equal(findExportButton(unmarkedDoc),null);
  console.log('PASS: direct-button fallback still requires nearby XLS report title');
  let clicks=0,expected=0;
  const source=fs.readFileSync(require.resolve('../extension/content.js'),'utf8')
    .replace('  // The app is a single-page app:', '  globalThis.testExportXls = exportXls;\n  // The app is a single-page app:');
  const ready=button({click(){clicks++}});
  const workflowModal=dialog('Eksport raportu do pliku XLSCzy chcesz wykonać raport?AnulujEksportuj',[ready]);
  ready.parentElement=workflowModal;
  const workflowDoc={
    querySelector(){throw Error('Already open modal must be reused without opening list menu')},
    querySelectorAll:selector=>selector==='button,[role="button"]'?[ready]:[workflowModal]
  };
  const context={window:{addEventListener(){},postMessage(){}},location:{origin:'https://app.symfonia.pl',pathname:'/test'},
    document:workflowDoc,
    chrome:{runtime:{sendMessage:async msg=>{if(msg.type==='expectDownload'){expected++;return {ok:true}}return true}}},
    KsefReport:{findExportButton:()=>findExportButton(workflowDoc)},setTimeout:fn=>{fn();return 0},setInterval(){}};
  vm.createContext(context);vm.runInContext(source,context);
  await context.testExportXls('report','task');
  assert.equal(clicks,1);assert.equal(expected,1);
  console.log('PASS: existing export dialog is reused and confirmation clicked exactly once');
})().catch(error=>{console.error(error);process.exitCode=1});
