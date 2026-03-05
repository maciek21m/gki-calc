if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

import { calculateGKI, saveRecord, loadRecords, overwriteRecords, exportCSV } from './app-utils.js';

// expose on window for debugging
window.AppUtils = { calculateGKI, saveRecord, loadRecords, overwriteRecords, exportCSV, mgdlToMmoll, mmollToMgdl };

// DOM Elements
const glucose = document.getElementById('glucose');
const glucoseUnit = document.getElementById('glucoseUnit');
const ketones = document.getElementById('ketones');
const timestamp = document.getElementById('timestamp');
const nowBtn = document.getElementById('nowBtn');
const note = document.getElementById('note');
const calcBtn = document.getElementById('calcBtn');
const justCalc = document.getElementById('justCalc');
const resultBox = document.getElementById('result');
const recordsList = document.getElementById('records');
const rangeSelect = document.getElementById('rangeSelect');
const customWeeks = document.getElementById('customWeeks');
const showGKI = document.getElementById('showGKI');
const showGlucose = document.getElementById('showGlucose');
const showKetone = document.getElementById('showKetone');
const exportCsv = document.getElementById('exportCsv');
const shareBtn = document.getElementById('shareBtn');
const clearAll = document.getElementById('clearAll');

// Chart
let chart = null;
const chartCtx = document.getElementById('gkiChart').getContext('2d');

function formatDateInputValue(d){
  // returns yyyy-mm-ddThh:mm
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  resultBox.innerHTML = `<strong>GKI: ${gki}</strong> — ${level}`;
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
  if(showGlucose.checked){
    datasets.push({
      label:'Glucose (mg/dL)',
      data:data.map(d=>({x:new Date(d.timestamp),y: d.glucose_unit === 'mgdL' ? parseFloat(d.glucose) : (parseFloat(d.glucose)*18) })),
      borderColor:'#888',
      backgroundColor:'rgba(255,255,255,0.02)',
      tension:0.2,
      yAxisID: 'y2'
    });
  }
  if(showKetone.checked){
    datasets.push({
      label:'Ketones (mmol/L)',
      data:data.map(d=>({x:new Date(d.timestamp),y:parseFloat(d.ketones) })),
      borderColor:'#aaa',
      backgroundColor:'rgba(255,255,255,0.02)',
      tension:0.2,
      yAxisID: 'y3'
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
        y2:{position:'right',grid:{display:false},title:{display:true,text:'Glucose (mg/dL)'},ticks:{color:'#bbb'}},
        y3:{position:'right',grid:{display:false},offset:true,title:{display:true,text:'Ketones (mmol/L)'},ticks:{color:'#bbb'}}
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

