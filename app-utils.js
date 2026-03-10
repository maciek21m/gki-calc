const STORAGE_KEY = 'gki_records_v1';

function mgdlToMmoll(mgdl){
  return mgdl / 18;
}

function mmollToMgdl(mmoll){
  return mmoll * 18;
}

function calculateGKI(glucoseValue, glucoseUnit, ketones){
  let glucoseMmoll = parseFloat(glucoseValue);
  if(glucoseUnit === 'mgdL'){
    glucoseMmoll = mgdlToMmoll(parseFloat(glucoseValue));
  }
  const ket = parseFloat(ketones);
  if(isNaN(glucoseMmoll) || isNaN(ket) || ket <= 0) return null;
  // Formula: GKI = Glucose (mmol/L) / Ketones (mmol/L)
  const gki = glucoseMmoll / ket;
  return Number(gki.toFixed(2));
}

function saveRecord(record){
  const list = loadRecords();
  list.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function loadRecords(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return [];
    return JSON.parse(raw);
  }catch(e){
    console.error(e);
    return [];
  }
}

function overwriteRecords(list){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function exportCSV(records){
  // Use semicolon-separated values per request
  const sep = ';';
  const rows = [['date','time','timezone','glucose','glucose_unit','ketones','gki','note']];
  for(const r of records){
    const d = new Date(r.timestamp);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const tzStr = 'CET';

    rows.push([
      dateStr,
      timeStr,
      tzStr,
      r.glucose,
      r.glucose_unit,
      r.ketones,
      r.gki,
      r.note ? r.note.replace(/\n/g,' ') : ''
    ]);
  }
  return rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(sep)).join('\n');
}

export {calculateGKI,mgdlToMmoll,mmollToMgdl,saveRecord,loadRecords,overwriteRecords,exportCSV};
