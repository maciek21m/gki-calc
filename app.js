import { calculateGKI, saveRecord, loadRecords, overwriteRecords, exportCSV, mgdlToMmoll, mmollToMgdl } from './app-utils.js';

// Development: ensure no stale service worker or caches on localhost
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => {
        try { r.unregister().then(()=>console.log('ServiceWorker unregistered by dev-guard')); } catch (e) { console.warn('Failed to unregister SW:', e); }
      });
    }).catch(()=>{});
  }
  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))).then(()=>console.log('Cleared caches on localhost'))).catch(()=>{});
  }
  console.log('Development mode: skipped SW registration and cleared caches');
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(()=>{
    console.log('ServiceWorker registered');
  }).catch((err)=>{
    console.warn('ServiceWorker registration failed:', err);
  });
}

// We'll expose safe utilities on window, but compute GKI locally to avoid stale modules or caching issues
function computeGKI_local(glucoseValue, glucoseUnit, ketonesValue){
  const gVal = parseFloat(glucoseValue);
  if (isNaN(gVal)) return null;
  let glucoseMmoll = gVal;
  if (glucoseUnit === 'mgdL') glucoseMmoll = gVal / 18;
  const ket = parseFloat(ketonesValue);
  if (isNaN(ket) || ket <= 0) return null;
  const gki = glucoseMmoll / ket; // glucose mmol/L divided by ketone mmol/L
  return Number(gki.toFixed(2));
}

// expose on window for debugging - ensure calculateGKI points to local correct implementation
window.AppUtils = window.AppUtils || {};
window.AppUtils.calculateGKI = computeGKI_local;
window.AppUtils.saveRecord = saveRecord;
window.AppUtils.loadRecords = loadRecords;
window.AppUtils.overwriteRecords = overwriteRecords;
window.AppUtils.exportCSV = exportCSV;
window.AppUtils.mgdlToMmoll = mgdlToMmoll;
window.AppUtils.mmollToMgdl = mmollToMgdl;

// DOM setup will run on DOMContentLoaded to ensure elements exist
let DOM = {};
function initDOM(){
  DOM.glucose = document.getElementById('glucose');
  DOM.glucoseUnit = document.getElementById('glucoseUnit');
  DOM.ketones = document.getElementById('ketones');
  DOM.timestamp = document.getElementById('timestamp');
  DOM.nowBtn = document.getElementById('nowBtn');
  DOM.note = document.getElementById('note');
  DOM.calcBtn = document.getElementById('calcBtn');
  DOM.justCalc = document.getElementById('justCalc');
  DOM.resultBox = document.getElementById('result');
  DOM.recordsList = document.getElementById('records');
  DOM.rangeSelect = document.getElementById('rangeSelect');
  DOM.customWeeks = document.getElementById('customWeeks');
  DOM.showGKI = document.getElementById('showGKI');
  DOM.exportCsv = document.getElementById('exportCsv');
  DOM.shareBtn = document.getElementById('shareBtn');
  DOM.clearAll = document.getElementById('clearAll');
  DOM.calcForm = document.getElementById('calcForm');

  if(DOM.calcForm){ DOM.calcForm.addEventListener('submit', (e)=>{ e.preventDefault(); }); }

  // replace references used by older code
  attachListeners();
}

function attachListeners(){
  if(!DOM.glucose) return;
  // setNow
  function formatDateInputValue(d){ const pad = n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function setNowLocal(){ const now=new Date(); if(DOM.timestamp) DOM.timestamp.value = formatDateInputValue(now); }
  if(DOM.nowBtn) DOM.nowBtn.addEventListener('click', setNowLocal);
  setNowLocal();

  // calculation and save handlers
  function showResultLocal(gki){
    if(!DOM.resultBox) return;
    if(gki===null){ DOM.resultBox.textContent = 'Enter valid values (ketones must be greater than 0)'; return; }
    let level='No Ketosis';
    if(gki<1) level='Extreme Ketosis'; else if(gki<3) level='Deep Ketosis'; else if(gki<6) level='Nutritional Ketosis'; else if(gki<9) level='Light Ketosis';
    DOM.resultBox.innerHTML = `<strong style="font-size:1.5rem">GKI: ${gki}</strong> <div style="margin-top:0.25rem;color:var(--muted)">${level}</div>`;
  }

  function readFormLocal(){ return { glucose: DOM.glucose.value, glucose_unit: DOM.glucoseUnit.value, ketones: DOM.ketones.value, timestamp: DOM.timestamp && DOM.timestamp.value ? new Date(DOM.timestamp.value).toISOString() : new Date().toISOString(), note: DOM.note ? DOM.note.value : '' }; }

  async function onCalculateLocal(save=false){ const form=readFormLocal(); const gki = computeGKI_local(form.glucose, form.glucose_unit, form.ketones); showResultLocal(gki); if(save && gki!==null){ const rec = { id:'r_'+Date.now(), glucose:form.glucose, glucose_unit:form.glucose_unit, ketones:form.ketones, gki, note:form.note, timestamp:form.timestamp }; saveRecord(rec); renderRecords(); updateChart(); showToast('Saved'); } }

  if(DOM.calcBtn) DOM.calcBtn.addEventListener('click', (e)=>{ e.preventDefault(); onCalculateLocal(true); });
  if(DOM.justCalc) DOM.justCalc.addEventListener('click', ()=>onCalculateLocal(false));

  const liveUpdate = debounce(()=>{ const f = readFormLocal(); const g = computeGKI_local(f.glucose, f.glucose_unit, f.ketones); showResultLocal(g); });
  DOM.glucose.addEventListener('input', liveUpdate);
  if(DOM.glucoseUnit) DOM.glucoseUnit.addEventListener('change', liveUpdate);
  DOM.ketones.addEventListener('input', liveUpdate);

  // wire other UI actions (export/share/clear) using DOM refs
  if(DOM.exportCsv){ DOM.exportCsv.addEventListener('click', ()=>{ const csv = exportCSV(loadRecords()); const blob = new Blob([csv],{type:'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='gki-records.csv'; a.click(); URL.revokeObjectURL(url); }); }
  if(DOM.shareBtn){ DOM.shareBtn.addEventListener('click', async ()=>{ const list=loadRecords(); if(list.length===0){ alert('No records to share'); return; } const latest = list[0]; const text = `GKI: ${latest.gki} (Glucose: ${latest.glucose} ${latest.glucose_unit}, Ketones: ${latest.ketones}) at ${new Date(latest.timestamp).toLocaleString()}\nNote: ${latest.note||''}`; if(navigator.share){ try{ await navigator.share({title:'GKI Result',text}); }catch(e){ alert('Share cancelled'); } } else { try{ await navigator.clipboard.writeText(text); alert('Copied to clipboard'); }catch(e){ alert('Unable to share'); } } }); }

  if(DOM.clearAll){ DOM.clearAll.addEventListener('click', ()=>{ if(confirm('Clear all records?')){ overwriteRecords([]); renderRecords(); updateChart(); } }); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDOM); else initDOM();

// Chart
let chart = null;
const chartCtx = document.getElementById('gkiChart').getContext('2d');

function buildChart(data){
  if(chart) chart.destroy();
  const datasets = [];

  datasets.push({
    label:'GKI',
    data:data.map(d=>({x:new Date(d.timestamp),y:d.gki})),
    borderColor:'#fff',
    backgroundColor:'rgba(255,255,255,0.05)',
    tension:0.2,
    yAxisID: 'y'
  });

  chart = new Chart(chartCtx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,
      scales:{
        x:{type:'time',time:{unit:'day'},ticks:{color:'#bbb'}},
        y:{position:'left',title:{display:true,text:'GKI'},ticks:{color:'#bbb'}}
      },
      plugins:{
        legend:{display:false}, // simpler chart: only one series, so no legend needed
        tooltip:{
          callbacks:{
            label: function(context){
              return `GKI: ${context.parsed.y}`;
            }
          }
        }
      }
    }
  });
}

function setNow(){
  const now = new Date();
  timestamp.value = formatDateInputValue(now);
}

nowBtn.addEventListener('click', setNow);
setNow();

function showToast(msg,duration=2500){
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className='toast'; t.textContent=msg; container.appendChild(t);
  setTimeout(()=>{ t.classList.add('visible'); },20);
  setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=>container.removeChild(t),300); },duration);
}

function showResult(gki){
  if(gki===null){
    resultBox.textContent = 'Enter valid values (ketones must be greater than 0)';
    return;
  }
  let level='No Ketosis';
  if(gki<1) level='Extreme Ketosis';
  else if(gki<3) level='Deep Ketosis';
  else if(gki<6) level='Nutritional Ketosis';
  else if(gki<9) level='Light Ketosis';
  else level='No Ketosis';

  resultBox.innerHTML = `<strong style="font-size:1.5rem">GKI: ${gki}</strong> <div style="margin-top:0.25rem;color:var(--muted)">${level}</div>`;
  showToast(`GKI ${gki} — ${level}`);
}

function readForm(){
  return {
    glucose: glucose.value,
    glucose_unit: glucoseUnit.value,
    ketones: ketones.value,
    timestamp: timestamp.value ? new Date(timestamp.value).toISOString() : new Date().toISOString(),
    note: note.value
  };
}

function onCalculate(save=false){
  const form = readForm();
  const gki = calculateGKI(form.glucose, form.glucose_unit, form.ketones);
  showResult(gki);
  if(save && gki!==null){
    const record = {
      id: 'r_'+Date.now(),
      glucose: form.glucose,
      glucose_unit: form.glucose_unit,
      ketones: form.ketones,
      gki: gki,
      note: form.note,
      timestamp: form.timestamp
    };
    saveRecord(record);
    renderRecords();
    updateChart();
  }
}

calcBtn.addEventListener('click', (e)=>{ e.preventDefault(); onCalculate(true); });
justCalc.addEventListener('click', ()=>onCalculate(false));

// Live calculation: recalculate on input changes and update result live
const liveUpdate = debounce(()=>{
  const form = readForm();
  const gki = calculateGKI(form.glucose, form.glucose_unit, form.ketones);
  showResult(gki);
});

glucose.addEventListener('input', liveUpdate);
glucoseUnit.addEventListener('change', liveUpdate);
ketones.addEventListener('input', liveUpdate);

function renderRecords(){
  const list = loadRecords();
  recordsList.innerHTML='';
  for(const r of list){
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.innerHTML = `<div><strong>${r.gki}</strong> — <span class="record-meta">${new Date(r.timestamp).toLocaleString()}</span></div><div class="record-meta">Glucose: ${r.glucose} ${r.glucose_unit} • Ketones: ${r.ketones} mmol/L</div><div>${r.note||''}</div>`;
    const right = document.createElement('div');
    right.className='record-actions';
    const edit = document.createElement('button'); edit.textContent='Edit';
    const del = document.createElement('button'); del.textContent='Delete'; del.className='danger';
    edit.addEventListener('click', ()=>editRecord(r.id));
    del.addEventListener('click', ()=>deleteRecord(r.id));
    right.appendChild(edit); right.appendChild(del);
    li.appendChild(left); li.appendChild(right);
    recordsList.appendChild(li);
  }
}

let onSaveWrapper = null;
function editRecord(id){
  const list = loadRecords();
  const rec = list.find(x=>x.id===id);
  if(!rec) return;
  // populate form for editing; on save replace record
  glucose.value = rec.glucose;
  glucoseUnit.value = rec.glucose_unit;
  ketones.value = rec.ketones;
  note.value = rec.note || '';
  // show timestamp
  const d = new Date(rec.timestamp);
  timestamp.value = formatDateInputValue(d);

  // change calculate button behaviour temporarily
  calcBtn.textContent = 'Save Changes';
  if(onSaveWrapper) calcBtn.removeEventListener('click', onSaveWrapper);
  onSaveWrapper = function(e){
    e.preventDefault();
    const form = readForm();
    const gki = calculateGKI(form.glucose, form.glucose_unit, form.ketones);
    if(gki===null){ alert('Invalid values'); return; }
    showResult(gki);
    rec.glucose = form.glucose;
    rec.glucose_unit = form.glucose_unit;
    rec.ketones = form.ketones;
    rec.gki = gki;
    rec.note = form.note;
    rec.timestamp = form.timestamp;
    overwriteRecords(list);
    renderRecords();
    updateChart();
    if(onSaveWrapper) calcBtn.removeEventListener('click', onSaveWrapper);
    calcBtn.addEventListener('click', (e)=>{ e.preventDefault(); onCalculate(true); });
    onSaveWrapper = null;
    showToast('Changes saved');
  };
  calcBtn.addEventListener('click', onSaveWrapper);
}

function deleteRecord(id){
  if(!confirm('Delete this record?')) return;
  const list = loadRecords().filter(x=>x.id!==id);
  overwriteRecords(list);
  renderRecords();
  updateChart();
}

// Chart
function buildChart(data){
  if(chart) chart.destroy();
  const datasets = [];
  if(showGKI.checked){
    datasets.push({
      label:'GKI',
      data:data.map(d=>({x:new Date(d.timestamp),y:d.gki})),
      borderColor:'#fff',
      backgroundColor:'rgba(255,255,255,0.05)',
      tension:0.2,
      yAxisID: 'y'
    });
  }


  chart = new Chart(chartCtx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,
      scales:{
        x:{type:'time',time:{unit:'day'},ticks:{color:'#bbb'}},
        y:{position:'left',title:{display:true,text:'GKI'},ticks:{color:'#bbb'}},
        },
      plugins:{
        legend:{labels:{color:'#ddd'}},
        tooltip:{
          callbacks:{
            label: function(context){
              const label = context.dataset.label || '';
              const y = context.parsed.y;
              if(label.includes('GKI')) return `${label}: ${y}`;
              if(label.includes('Glucose')) return `${label}: ${y} mg/dL`;
              if(label.includes('Ketone')) return `${label}: ${y} mmol/L`;
              return `${label}: ${y}`;
            }
          }
        }
      }
    }
  });
}

function getFilteredRecords(){
  let list = loadRecords();
  const range = rangeSelect.value;
  if(range === 'all') return list.reverse();
  let cutoff = new Date();
  if(range === '7') cutoff.setDate(cutoff.getDate()-7);
  else if(range === '30') cutoff.setDate(cutoff.getDate()-30);
  else if(range === 'custom'){
    const weeks = parseInt(customWeeks.value) || 1;
    cutoff.setDate(cutoff.getDate() - weeks*7);
  }
  return list.filter(r=>new Date(r.timestamp) >= cutoff).reverse();
}

function updateChart(){
  const data = getFilteredRecords();
  // For GKI we already calculate; ensure numeric
  buildChart(data);
}

rangeSelect.addEventListener('change', ()=>{
  customWeeks.style.display = rangeSelect.value === 'custom' ? 'inline-block' : 'none';
  updateChart();
});
customWeeks.addEventListener('input', updateChart);
showGKI.addEventListener('change', updateChart);
showGlucose.addEventListener('change', updateChart);
showKetone.addEventListener('change', updateChart);

exportCsv.addEventListener('click', ()=>{
  const csv = exportCSV(loadRecords());
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'gki-records.csv';
  a.click();
  URL.revokeObjectURL(url);
});

shareBtn.addEventListener('click', async ()=>{
  const list = loadRecords();
  if(list.length===0){ alert('No records to share'); return; }
  const latest = list[0];
  const text = `GKI: ${latest.gki} (Glucose: ${latest.glucose} ${latest.glucose_unit}, Ketones: ${latest.ketones}) at ${new Date(latest.timestamp).toLocaleString()}\nNote: ${latest.note||''}`;
  if(navigator.share){
    try{ await navigator.share({title:'GKI Result',text}); }catch(e){ alert('Share cancelled'); }
  }else{
    // fallback - copy to clipboard
    try{ await navigator.clipboard.writeText(text); alert('Copied to clipboard'); }catch(e){ alert('Unable to share'); }
  }
});

clearAll.addEventListener('click', ()=>{ if(confirm('Clear all records?')){ overwriteRecords([]); renderRecords(); updateChart(); } });

// initial render
renderRecords();
updateChart();

// expose functions for console
window.gkiApp = { renderRecords, updateChart, loadRecords, overwriteRecords };

