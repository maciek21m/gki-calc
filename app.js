import { saveRecord, loadRecords, overwriteRecords, exportCSV, mgdlToMmoll, mmollToMgdl } from './app-utils.js';

// Development: aggressive clear of Service Workers and Caches to fix preview staleness
const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.includes('shakespeare.diy') || location.hostname.includes('ngit') || location.port !== '';
if (IS_DEV) {
  (async function clearStaleCaches() {
    let reloaded = sessionStorage.getItem('dev_sw_cleared');
    if (!reloaded) {
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
          console.log('[DEV] Unregistered stale service workers');
        } catch (e) {}
      }
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
          console.log('[DEV] Cleared browser caches');
        } catch (e) {}
      }
      sessionStorage.setItem('dev_sw_cleared', '1');
      location.reload();
    }
  })();
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
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
    importCsv: document.getElementById('importCsv'),
    importFile: document.getElementById('importFile'),
    shareBtn: document.getElementById('shareBtn'),
    clearAll: document.getElementById('clearAll'),
    calcForm: document.getElementById('calcForm'),
    chartCtx: document.getElementById('gkiChart') ? document.getElementById('gkiChart').getContext('2d') : null
  };

  if(!els.glucose) return; // silent fail if not on right page

  if(els.calcForm) els.calcForm.addEventListener('submit', (e)=>{ e.preventDefault(); });

  function formatDateTimeDisp(iso){
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    const pad = n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function formatDateDisp(iso){
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    const pad = n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
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

  // Chart.js annotation plugin (inline, lightweight) for ketosis zone backgrounds
  const ketozonePlugin = {
    id: 'ketozones',
    beforeDraw(chart) {
      const {ctx, chartArea: {left, right, top, bottom}, scales: {y}} = chart;
      if (!y) return;
      const zones = [
        { min: 0,  max: 1,  color: 'rgba(168,85,247,0.12)',  label: 'Extreme' },
        { min: 1,  max: 3,  color: 'rgba(59,130,246,0.12)',   label: 'Deep' },
        { min: 3,  max: 6,  color: 'rgba(34,197,94,0.12)',    label: 'Nutritional' },
        { min: 6,  max: 9,  color: 'rgba(234,179,8,0.12)',    label: 'Light' },
        { min: 9,  max: 999, color: 'rgba(170,170,170,0.06)', label: 'None' },
      ];
      ctx.save();
      for (const z of zones) {
        const yTop = y.getPixelForValue(z.max);
        const yBot = y.getPixelForValue(z.min);
        const clampTop = Math.max(yTop, top);
        const clampBot = Math.min(yBot, bottom);
        if (clampBot <= clampTop) continue;
        ctx.fillStyle = z.color;
        ctx.fillRect(left, clampTop, right - left, clampBot - clampTop);
        // Label
        ctx.fillStyle = z.color.replace(/[\d.]+\)$/, '0.5)');
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(z.label, right - 4, clampTop + 12);
      }
      ctx.restore();
    }
  };

  function buildChart(data){
    if(!els.chartCtx) return;
    if(!window.Chart) return;
    if(chart) chart.destroy();
    
    const datasets = [];
    if(els.showGKI && els.showGKI.checked){
      datasets.push({
        label:'GKI',
        data:data.map(d=>({x:new Date(d.timestamp),y:d.gki})),
        borderColor:'#fff',
        backgroundColor:'rgba(255,255,255,0.08)',
        tension:0.3,
        pointRadius: 4,
        pointBackgroundColor: '#fff',
        borderWidth: 2,
        fill: false,
      });
    }

    // Determine y-axis max from data (at least 10 to show all zones)
    const maxGki = data.length > 0 ? Math.max(...data.map(d => d.gki), 10) : 12;

    try {
      chart = new Chart(els.chartCtx,{
        type:'line',
        data:{datasets},
        options:{
          responsive:true,
          maintainAspectRatio:false,
          scales:{
            x:{
              type:'time',
              time:{
                unit:'day',
                tooltipFormat:'yyyy-MM-dd HH:mm',
                displayFormats:{ day:'yyyy-MM-dd', hour:'HH:mm', minute:'HH:mm' }
              },
              ticks:{color:'#bbb', font:{size:11}}
            },
            y:{
              position:'left',
              title:{display:true,text:'GKI',color:'#bbb'},
              ticks:{color:'#bbb', font:{size:11}},
              min: 0,
              max: Math.ceil(maxGki) + 1,
              grid:{color:'rgba(255,255,255,0.05)'}
            }
          },
          plugins:{
            legend:{display:false},
            tooltip:{
              callbacks:{
                title: function(items){ if(!items.length) return ''; const d=new Date(items[0].parsed.x); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; },
                label: function(c){ return `GKI: ${c.parsed.y}`; }
              }
            }
          }
        },
        plugins: [ketozonePlugin]
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
      left.innerHTML = `<div class="record-main"><div class="record-gki">${r.gki}</div><div class="record-meta">${formatDateDisp(r.timestamp)} ${new Date(r.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12:false})}</div></div><div class="record-data">Glucose: ${r.glucose} ${r.glucose_unit} • Ketones: ${r.ketones} mmol/L</div><div style="font-size:0.9rem; margin-top:4px">${r.note||''}</div>`;
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

  // CSV parser function (fallback & local implementation)
  function parseCSV_local(text){
    const lines = text.split(/\r?\n/).filter(l=>l.trim()!=='');
    return lines.map(line=>{
      const row = [];
      let cur = '';
      let inQuote = false;
      for(let i=0;i<line.length;i++){
        const ch = line[i];
        if(ch === '"'){
          if(inQuote && line[i+1] === '"') { cur += '"'; i++; continue; }
          inQuote = !inQuote; continue;
        }
        if(ch === ',' && !inQuote){ row.push(cur.trim()); cur=''; continue; }
        if(ch === ';' && !inQuote){ row.push(cur.trim()); cur=''; continue; }
        if(ch === '\t' && !inQuote){ row.push(cur.trim()); cur=''; continue; }
        cur += ch;
      }
      row.push(cur.trim());
      return row;
    });
  }
  // expose on window for other code
  window.parseCSV = parseCSV_local;

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

  // Import CSV handling
  if(els.importCsv && els.importFile){
    els.importCsv.addEventListener('click', ()=>{ console.log('[IMPORT] importCsv clicked'); els.importFile.click(); });
    els.importFile.addEventListener('change', async (e)=>{
      console.log('[IMPORT] file input change', e);
      const file = e.target.files && e.target.files[0];
      if(!file){ console.log('[IMPORT] no file selected'); return; }
      try{
        console.log('[IMPORT] reading file', file.name, file.size);
        const text = await file.text();
        console.log('[IMPORT] file text length', text.length);
        // Support common delimiters: detect comma or semicolon (or tab)
        // Enforce semicolon delimiter for both import and export as requested
        const delimiter = (text.indexOf(';') !== -1) ? ';' : (text.indexOf(',') !== -1 ? ',' : (text.indexOf('\t') !== -1 ? '\t' : ';'));
        const parsed = window.parseCSV ? window.parseCSV(text) : (text.split(/\r?\n/).map(l=>l.split(delimiter)));

        // Normalize header (lowercase, trim)
        // strip BOM if present
        if(parsed[0] && parsed[0][0] && parsed[0][0].startsWith('\uFEFF')){
          parsed[0][0] = parsed[0][0].replace('\uFEFF','');
        }
        const header = parsed[0].map(h=>h.toString().toLowerCase().trim());
        const idx = (name)=> header.indexOf(name);
        const date_i = idx('date');
        const time_i = idx('time');
        const tz_i = idx('timezone');
        const g_i = idx('glucose');
        const gu_i = idx('glucose_unit')!==-1 ? idx('glucose_unit') : idx('glucose unit');
        const k_i = idx('ketones');
        const gki_i = idx('gki');
        const note_i = idx('note');

        const rows = parsed.slice(1).filter(r=>r && r.length>0 && r.join('').trim() !== '').map(r=>r.map(c=>c==null? '': String(c)));
        const records = rows.map(r=>{
          // Handle new date/time/timezone format
          let timestamp = new Date().toISOString();
          if(date_i!==-1 && time_i!==-1){
            const datePart = r[date_i];
            const timePart = r[time_i];
            // try to assemble ISO string (assume timezone provided or default to CET)
            if(datePart && timePart){
              try{
                // Normalize date and time parts and construct a local Date
                const dateMatch = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(datePart);
                const timeMatch = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(timePart.trim());
                if(dateMatch && timeMatch){
                  const year = parseInt(dateMatch[1],10);
                  const month = parseInt(dateMatch[2],10);
                  const day = parseInt(dateMatch[3],10);
                  const hour = parseInt(timeMatch[1],10);
                  const minute = parseInt(timeMatch[2],10);
                  const second = parseInt(timeMatch[3]||'0',10);

                  // Create a local Date (not ISO string with timezone suffix) to avoid parsing differences
                  const localDate = new Date(year, month-1, day, hour, minute, second);
                  if (!isNaN(localDate.getTime())){
                    timestamp = localDate.toISOString();
                  } else {
                    throw new Error('Invalid localDate');
                  }
                } else {
                  // Fallback to generic parse
                  const tz = (tz_i!==-1 && r[tz_i]) ? r[tz_i] : 'CET';
                  timestamp = new Date(`${datePart}T${timePart}`).toISOString();
                }
              }catch(err){
                console.warn('Failed to parse date/time for row:', datePart, timePart, err);
                // leave timestamp as now if parsing fails
                timestamp = new Date().toISOString();
              }
            }
          } else if(idx('timestamp')!==-1){
            timestamp = r[idx('timestamp')] || timestamp;
          }

          const glucoseRaw = r[g_i] || '';
          const glucose_unit = (gu_i!==-1 && r[gu_i]) ? r[gu_i] : (glucoseRaw && glucoseRaw.toString().indexOf('.')!==-1 ? 'mmolL' : 'mgdL');
          const glucose = glucoseRaw;
          const ketones = r[k_i] || '';
          const gki_val = (gki_i!==-1 && r[gki_i] !== undefined && r[gki_i].trim() !== '') ? parseFloat(r[gki_i]) : null;

          // If gki is empty, compute it on import
          const gki = gki_val !== null ? gki_val : (glucose && ketones ? computeGKI_local(glucose, glucose_unit, ketones) : null);
          return {
            timestamp: timestamp,
            glucose: glucose,
            glucose_unit: glucose_unit || 'mgdL',
            ketones: ketones,
            gki: gki,
            note: note_i!==-1 ? (r[note_i]||'') : ''
          };
        }).filter(r=>r.gki !== null);

        // Merge and dedupe by timestamp+glucose+ketones (avoid exact duplicates)
        const existing = loadRecords();
        const combined = [...records, ...existing];
        const seen = new Set();
        const unique = [];
        for(const rec of combined){
          const key = `${rec.timestamp}||${rec.glucose}||${rec.ketones}`;
          if(seen.has(key)) continue;
          seen.add(key);
          unique.push({ ...rec, id:'r_'+Date.now()+Math.random().toString(36).slice(2) });
        }

        overwriteRecords(unique);
        renderRecords();
        updateChart();
        showToast('Imported CSV successfully');
      }catch(err){
        console.error(err); alert('Failed to import CSV');
      } finally{
        els.importFile.value = '';
      }
    });
  }
  
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
