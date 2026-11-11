const assert = require('node:assert/strict');
const { openMenu, selectedCount } = require('../extension/download-actions.js');
const waitFor = async fn => fn() || null;
const node = (extra = {}) => ({ getClientRects:()=>[1], getAttribute:()=>null, ...extra });

(async () => {
  for (const format of ['PDF', 'XML']) {
    let open = false, downloadClicks = 0, sendClicks = 0;
    const trigger = node({ tagName:'SPAN', click(){ open = true; downloadClicks++; } });
    const send = node({ click(){ sendClicks++; throw new Error('Wrong action clicked'); } });
    const item = node();
    const optionId = 'downloadInvoice' + format + 'MultipleAction';
    const doc = { querySelectorAll(selector) {
      if (selector === '[data-testid="downloadInvoiceMultipleAction"]') return [trigger];
      if (selector === '[data-testid="' + optionId + '"]') return open ? [item] : [];
      if (selector.includes('sendToKsef')) return [send];
      throw new Error('Unexpected generic selector: ' + selector);
    }};
    assert.equal(await openMenu(format,{document:doc,waitFor}),item);
    assert.equal(downloadClicks,1); assert.equal(sendClicks,0);
    assert.equal(await openMenu(format,{document:doc,waitFor}),item);
    assert.equal(downloadClicks,1,'do not toggle an already open menu closed');
    console.log('PASS: exact non-button download action opens',format,'without clicking send-to-KSeF');
  }
  let wrongClicks = 0;
  const hidden = node({getClientRects:()=>[],click(){wrongClicks++}});
  const disabled = node({getAttribute:()=> 'true',click(){wrongClicks++}});
  await assert.rejects(openMenu('PDF',{document:{querySelectorAll:s=>s.includes('downloadInvoiceMultipleAction')?[hidden,disabled]:[]},waitFor}),/Nie znalazłem/);
  assert.equal(wrongClicks,0);
  console.log('PASS: hidden or disabled download actions are not clicked');
  const row = node();
  const boxes = [node({checked:true,closest:()=>row}),node({checked:true,closest:()=>row})];
  const doc = {querySelectorAll:()=>boxes};
  assert.equal(selectedCount(doc),2);
  boxes[1].checked=false;
  assert.equal(selectedCount(doc),0);
  boxes[1].disabled=true;
  assert.equal(selectedCount(doc),1);
  assert.equal(selectedCount({querySelectorAll:()=>[]}),0);
  console.log('PASS: selection checked from visible enabled row checkboxes, independent of toolbar wording');
})().catch(error=>{console.error(error);process.exitCode=1});
