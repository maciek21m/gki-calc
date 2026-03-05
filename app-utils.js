const STORAGE_KEY = 'gki_records_v1';

function mgdlToMmoll(mgdl){
  return mgdl / 18;
}

function mmollToMgdl(mmoll){
  return mmoll * 18;
}

function calculateGKI(glucoseValue, glucoseUnit, ketones){
  let glucoseMmoll = glucoseValue;
  if(glucoseUnit === 'mgdL'){
    glucoseMmoll = mgdlToMmoll(parseFloat(glucoseValue));
  }
  const ket = parseFloat(ketones);
  if(isNaN(glucoseMmoll) || isNaN(ket) || ket === 0) return null;
  const gki = glucoseMmoll * ket;
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
  const rows = [['timestamp','iso','glucose','glucose_unit','ketones','gki','note']];
  for(const r of records){
    rows.push([r.timestamp, new Date(r.timestamp).toISOString(), r.glucose, r.glucose_unit, r.ketones, r.gki, r.note ? r.note.replace(/\n/g,' ') : '']);
  }
  return rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""') }"`).join(',')).join('\n');
}

export {calculateGKI,mgdlToMmoll,mmollToMgdl,saveRecord,loadRecords,overwriteRecords,exportCSV};
