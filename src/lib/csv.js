// Simple CSV parser - handles quoted values and commas
export function parseCSV(text){
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
      cur += ch;
    }
    row.push(cur.trim());
    return row;
  });
}
