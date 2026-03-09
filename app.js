import { saveRecord, loadRecords, overwriteRecords, exportCSV, mgdlToMmoll, mmollToMgdl } from './app-utils.js';

// Development: ensure no stale service worker or caches on localhost
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => {
        try { r.unregister().then(()=>console.log('ServiceWorker unregistered by dev-guard')); } catch (e) { }
      });
    }).catch(()=>{});
  }
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(()=>{
    console.log('ServiceWorker registered');
  }).catch((err)=>{
    console.warn('ServiceWorker registration failed:', err);
  });
}

function computeGKI_local(glucoseValue, glucoseUnit, ketonesValue){
  const gVal = parseFloat(glucoseValue);
  if (isNaN(gVal)) return null;
  let glucoseMmoll = gVal;
  if (glucoseUnit === 'mgdL') glucoseMmoll = gVal / 18;
  const ket = parseFloat(ketonesValue);
  if (isNaN(ket) || ket <= 0) return null;
  const gki = glucoseMmoll / ket;
  return Number(gki.toFixed(2));
}

// expose on window for debugging
window.AppUtils = window.AppUtils || {};
window.AppUtils.calculateGKI = computeGKI_local;
window.AppUtils.saveRecord = saveRecord;
window.AppUtils.loadRecords = loadRecords;

function debounce(fn, ms=300){
  let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

let chart = null;

function initDOM(){
  const els = {
    glucose: document.getElementById('glucose'),
    glucoseUnit: document.getElementById('glucoseUnit'),
    ketones: document.getElementById('ketones'),
    timestamp: document.getElementById('timestamp'),
    nowBtn: document.getElementById('nowBtn'),
    note: document.getElementById('note'),
    calcBtn: document.getElementById('calcBtn'),
    justCalc: document.getElementById('justCalc'),
    resultBox: document.getElementById('result'),
    recordsList: document.getElementById('records'),
    rangeSelect: document.getElementById('rangeSelect'),
    customWeeks: document.getElementById('customWeeks'),
    showGKI: document.getElementById('showGKI'),
    exportCsv: document.getElementById('exportCsv'),
    shareBtn: document.getElementById('shareBtn'),
    clearAll: document.getElementById('clearAll'),
    calcForm: document.getElementById('calcForm'),
    chartCtx: document.getElementById('gkiChart') ? document.getElementById('gkiChart').getContext('2d') : null
  };

  if(!els.glucose) return; // silent fail if not on right page

  if(els.calcForm) els.calcForm.addEventListener('submit', (e)=>{ e.preventDefault(); });

  function formatDateInputValue(d){ const pad = n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function setNowLocal(){ if(els.timestamp) els.timestamp.value = formatDateInputValue(new Date()); }
  if(els.nowBtn) els.nowBtn.addEventListener('click', setNowLocal);
  setNowLocal();

  function showToast(msg,duration=2500){
    let container = document.getElementById('toast-container');
    if(!container) return;
    const t = document.createElement('div');
    t.className='toast'; t.textContent=msg; container.appendChild(t);
    setTimeout(()=>{ t.classList.add('visible'); },20);
    setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=>container.removeChild(t),300); },duration);
  }

  function showResultLocal(gki){
    if(!els.resultBox) return;
    if(gki===null){ els.resultBox.textContent = 'Enter valid values (ketones must be > 0)'; return; }
    let level='No Ketosis';
    if(gki<1) level='Extreme Ketosis'; else if(gki<3) level='Deep Ketosis'; else if(gki<6) level='Nutritional Ketosis'; else if(gki<9) level='Light Ketosis';
    
    let levelColor = '#aaa';
    if(gki<1) levelColor = '#a855f7'; // extreme
    else if(gki<3) levelColor = '#3b82f6'; // deep
    else if(gki<6) levelColor = '#22c55e'; // nutritional
    else if(gki<9) levelColor = '#eab308'; // light
    
    // Explicit accessible formatting
    els.resultBox.innerHTML = `
      <div style="font-size:2.5rem; font-weight:800; color:#fff; letter-spacing:-0.03em" aria-live="polite">GKI: ${gki}</div>
      <div style="margin-top:0.5rem; font-size:1.15rem; font-weight:500; color:${levelColor}">${level}</div>
    `;
    setTimeout(() => showToast(`GKI: ${gki}`), 10);
  }

  function readFormLocal(){ return { glucose: els.glucose.value, glucose_unit: els.glucoseUnit.value, ketones: els.ketones.value, timestamp: els.timestamp.value ? new Date(els.timestamp.value).toISOString() : new Date().toISOString(), note: els.note ? els.note.value : '' }; }

  function buildChart(data){
    if(!els.chartCtx) return;
    if(!window.Chart) return; // avoid crash if Chart script failed to load
    if(chart) chart.destroy();
    
    const datasets = [];
    if(els.showGKI && els.showGKI.checked){
      datasets.push({
        label:'GKI',
        data:data.map(d=>({x:new Date(d.timestamp),y:d.gki})),
        borderColor:'#fff',
        backgroundColor:'rgba(255,255,255,0.05)',
        tension:0.2,
      });
    }

    try {
      chart = new Chart(els.chartCtx,{
        type:'line',
        data:{datasets},
        options:{
          responsive:true,
          scales:{
            x:{type:'time',time:{unit:'day'},ticks:{color:'#bbb'}},
            y:{position:'left',title:{display:true,text:'GKI'},ticks:{color:'#bbb'}}
          },
          plugins:{
            legend:{display:false},
            tooltip:{ callbacks:{ label: function(c){ return `GKI: ${c.parsed.y}`; } } }
          }
        }
      });
    } catch(e) {
      console.error('Chart.js failed to initialize', e);
    }
  }

  function getFilteredRecords(){
    let list = loadRecords();
    const range = els.rangeSelect ? els.rangeSelect.value : 'all';
    if(range === 'all') return list.reverse();
    let cutoff = new Date();
    if(range === '7') cutoff.setDate(cutoff.getDate()-7);
    else if(range === '30') cutoff.setDate(cutoff.getDate()-30);
    else if(range === 'custom' && els.customWeeks){
      const weeks = parseInt(els.customWeeks.value) || 1;
      cutoff.setDate(cutoff.getDate() - weeks*7);
    }
    return list.filter(r=>new Date(r.timestamp) >= cutoff).reverse();
  }

  function updateChart(){
    buildChart(getFilteredRecords());
  }

  function renderRecords(){
    if(!els.recordsList) return;
    const list = loadRecords();
    els.recordsList.innerHTML='';
    for(const r of list){
      const li = document.createElement('li');
      const left = document.createElement('div');
      left.innerHTML = `<div><strong>${r.gki}</strong> — <span class="record-meta">${new Date(r.timestamp).toLocaleString()}</span></div><div class="record-meta" style="color:#aaa">Glucose: ${r.glucose} ${r.glucose_unit} • Ketones: ${r.ketones} mmol/L</div><div style="font-size:0.9rem; margin-top:4px">${r.note||''}</div>`;
      const right = document.createElement('div');
      right.className='record-actions';
      const editBtn = document.createElement('button'); editBtn.textContent='Edit';
      const delBtn = document.createElement('button'); delBtn.textContent='Delete'; delBtn.className='danger';
      editBtn.addEventListener('click', ()=>editRecord(r.id));
      delBtn.addEventListener('click', ()=>deleteRecord(r.id));
      right.appendChild(editBtn); right.appendChild(delBtn);
      li.appendChild(left); li.appendChild(right);
      els.recordsList.appendChild(li);
    }
  }

  let onSaveWrapper = null;
  function editRecord(id){
    const list = loadRecords();
    const rec = list.find(x=>x.id===id);
    if(!rec) return;
    els.glucose.value = rec.glucose;
    els.glucoseUnit.value = rec.glucose_unit;
    els.ketones.value = rec.ketones;
    els.note.value = rec.note || '';
    els.timestamp.value = formatDateInputValue(new Date(rec.timestamp));

    if(els.calcBtn) {
      els.calcBtn.textContent = 'Save Changes';
      if(onSaveWrapper) els.calcBtn.removeEventListener('click', onSaveWrapper);
      onSaveWrapper = function(e){
        e.preventDefault();
        const f = readFormLocal();
        const gki = computeGKI_local(f.glucose, f.glucose_unit, f.ketones);
        if(gki===null){ alert('Invalid values'); return; }
        showResultLocal(gki);
        rec.glucose = f.glucose; rec.glucose_unit = f.glucose_unit; rec.ketones = f.ketones; rec.gki = gki; rec.note = f.note; rec.timestamp = f.timestamp;
        overwriteRecords(list);
        renderRecords(); updateChart();
        els.calcBtn.removeEventListener('click', onSaveWrapper);
        els.calcBtn.addEventListener('click', defaultSaveHandler);
        els.calcBtn.textContent = 'Calculate & Save';
        onSaveWrapper = null;
        showToast('Changes saved');
      };
      els.calcBtn.addEventListener('click', onSaveWrapper);
    }
  }

  function deleteRecord(id){
    if(!confirm('Delete this record?')) return;
    overwriteRecords(loadRecords().filter(x=>x.id!==id));
    renderRecords(); updateChart();
  }

  const defaultSaveHandler = (e)=>{
    if(e) e.preventDefault();
    const f=readFormLocal(); const gki = computeGKI_local(f.glucose, f.glucose_unit, f.ketones);
    showResultLocal(gki);
    if(gki!==null){
      saveRecord({ id:'r_'+Date.now(), glucose:f.glucose, glucose_unit:f.glucose_unit, ketones:f.ketones, gki, note:f.note, timestamp:f.timestamp });
      renderRecords(); updateChart(); showToast('Saved');
    }
  };

  if(els.calcBtn) els.calcBtn.addEventListener('click', defaultSaveHandler);
  if(els.justCalc) els.justCalc.addEventListener('click', ()=>{
     const f = readFormLocal();
     showResultLocal(computeGKI_local(f.glucose, f.glucose_unit, f.ketones));
  });

  const liveUpdate = debounce(()=>{
    const f = readFormLocal();
    showResultLocal(computeGKI_local(f.glucose, f.glucose_unit, f.ketones));
  });
  els.glucose.addEventListener('input', liveUpdate);
  if(els.glucoseUnit) els.glucoseUnit.addEventListener('change', liveUpdate);
  els.ketones.addEventListener('input', liveUpdate);

  if(els.rangeSelect) els.rangeSelect.addEventListener('change', ()=>{
    if(els.customWeeks) els.customWeeks.style.display = els.rangeSelect.value === 'custom' ? 'inline-block' : 'none';
    updateChart();
  });
  if(els.customWeeks) els.customWeeks.addEventListener('input', updateChart);
  if(els.showGKI) els.showGKI.addEventListener('change', updateChart);

  if(els.exportCsv) els.exportCsv.addEventListener('click', ()=>{ 
    const blob = new Blob([exportCSV(loadRecords())],{type:'text/csv'}); 
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='gki-records.csv'; a.click(); URL.revokeObjectURL(url); 
  });
  
  if(els.shareBtn) els.shareBtn.addEventListener('click', async ()=>{ 
    const list=loadRecords(); if(list.length===0){ alert('No records'); return; } 
    const r=list[0]; const text=`GKI: ${r.gki} (Glucose: ${r.glucose} ${r.glucose_unit}, Ketones: ${r.ketones}) on ${new Date(r.timestamp).toLocaleDateString()}`; 
    if(navigator.share){ try{await navigator.share({title:'GKI Result',text});}catch(e){} } else { await navigator.clipboard.writeText(text); showToast('Copied to clipboard'); } 
  });

  if(els.clearAll) els.clearAll.addEventListener('click', ()=>{ if(confirm('Clear all history?')){ overwriteRecords([]); renderRecords(); updateChart(); } });

  renderRecords();
  updateChart();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDOM); else initDOM();
