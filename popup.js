// popup.js — auto-detect domain, fast concurrent scanner with pause/resume/stop
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const progressBar = document.getElementById('progressBar');
const counterEl = document.getElementById('counter');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const uploadInput = document.getElementById('uploadWordlist');
const uploadFileName = document.getElementById('uploadFileName');
const resetWordlist = document.getElementById('resetWordlist');

const BUNDLED_WORDLIST = 'subdomains-top1million-5000.txt';
const STORAGE_KEY = 'customWordlist';

// scanner state
let activeDomain = '';
let wordlist = [];
let found = [];
let checked = 0;
let total = 0;

let stopRequested = false;
let paused = false;
let resumeResolvers = [];

// tuning
const DEFAULT_CONCURRENCY = 20;
const REQUEST_TIMEOUT_MS = 2500;

// ----------------- helpers -----------------
function setStatus(text){ statusEl.textContent = text; }
function updateCounter(){ counterEl.textContent = `Found: ${found.length} — Checked: ${checked}/${total}`; }
function addResult(sub){ 
  found.push(sub);
  const li = document.createElement('li');
  const span = document.createElement('span'); span.textContent = sub;
  const btn = document.createElement('button'); btn.className='copy-btn'; btn.textContent='Copy';
  btn.onclick = async ()=>{ try{ await navigator.clipboard.writeText(sub); btn.textContent='Copied'; setTimeout(()=>btn.textContent='Copy',1000);}catch{} };
  li.appendChild(span); li.appendChild(btn); resultsEl.appendChild(li);
}

// fetch with timeout
async function fetchWithTimeout(url, options={}, timeoutMs=REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(()=>ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {...options, signal: ctrl.signal});
    clearTimeout(id);
    return r;
  } catch(e){
    clearTimeout(id);
    return null;
  }
}
async function dohA(hostname, timeout=REQUEST_TIMEOUT_MS){
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
  try{
    const r = await fetchWithTimeout(url, { headers:{ 'Accept':'application/dns-json' } }, timeout);
    if(!r || !r.ok) return null;
    const j = await r.json();
    return j.Answer || null;
  }catch{return null;}
}

// load bundled file
async function loadBundled(){
  try{
    const url = chrome.runtime.getURL(BUNDLED_WORDLIST);
    const r = await fetch(url);
    if(!r.ok) return [];
    const t = await r.text();
    return t.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  }catch(e){ console.error(e); return []; }
}
function normalizeArr(v){ if(!v) return []; if(Array.isArray(v)) return v.map(s=>String(s).trim()).filter(Boolean); return String(v).split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
function saveCustom(arr){ chrome.storage.local.set({[STORAGE_KEY]: arr}); }
async function loadActiveList(){
  return new Promise(resolve=>{
    chrome.storage.local.get([STORAGE_KEY], async data=>{
      if(data && data[STORAGE_KEY]) resolve(normalizeArr(data[STORAGE_KEY]));
      else resolve(await loadBundled());
    });
  });
}

// pause helpers
function waitWhilePaused(){ if(!paused) return Promise.resolve(); return new Promise(res=>resumeResolvers.push(res)); }
function resumeAll(){ resumeResolvers.forEach(r=>r()); resumeResolvers=[]; }

// UI locking when scanning
function lockUI(scanning){
  startBtn.disabled = scanning;
  pauseBtn.disabled = !scanning;
  stopBtn.disabled = !scanning;
  uploadInput.disabled = scanning;
  resetWordlist.disabled = scanning;
  if(!scanning){ pauseBtn.textContent='Pause'; }
}

// ----------------- Worker pool scanner -----------------
async function runScan(concurrency=DEFAULT_CONCURRENCY, perRequestTimeout=REQUEST_TIMEOUT_MS){
  // reset UI state
  resultsEl.innerHTML=''; found=[]; checked=0; total = wordlist.length;
  stopRequested = false; paused = false; resumeResolvers = [];
  updateCounter(); progressBar.style.width = '0%'; downloadBtn.classList.add('hidden');
  lockUI(true); setStatus(`Scanning ${activeDomain}...`);

  let index = 0;
  const clamp = Math.max(1, Math.min(120, concurrency));

  async function worker(id){
    while(true){
      if(stopRequested) return;
      if(paused){ await waitWhilePaused(); if(stopRequested) return; await new Promise(r=>setTimeout(r, id*8)); }
      const i = index++;
      if(i >= total) return;
      const label = wordlist[i];
      const target = `${label}.${activeDomain}`;
      // DoH check
      const ans = await dohA(target, perRequestTimeout);
      checked++;
      if(ans && Array.isArray(ans) && ans.length>0){
        addResult(target);
      }
      // update counters periodically
      if(i % 5 === 0 || i === total - 1) {
        updateCounter();
        progressBar.style.width = `${Math.round((checked/total)*100)}%`;
      }
      // tiny yield
      await new Promise(r=>setTimeout(r,0));
    }
  }

  const workers = [];
  for(let w=0; w<clamp; w++) workers.push(worker(w));
  await Promise.all(workers);

  // finalize
  updateCounter();
  progressBar.style.width = `100%`;
  chrome.storage.local.set({ lastResults: found, lastScanned: activeDomain });
  if(found.length > 0) downloadBtn.classList.remove('hidden');
  if(stopRequested) setStatus(`Stopped — ${found.length} found.`);
  else setStatus(found.length ? `Done — ${found.length} found.` : 'Done — no subdomains found.');
  lockUI(false);
}

// ----------------- Event handlers -----------------
startBtn.onclick = async () => {
  if(startBtn.disabled) return;
  // load active domain if not set
  if(!activeDomain){ setStatus('No active site tab detected. Open a website tab and reopen popup.'); return; }
  wordlist = await loadActiveList();
  if(!wordlist || !wordlist.length){ setStatus('Wordlist empty. Upload or provide bundled list.'); return; }
  runScan();
};

pauseBtn.onclick = () => {
  if(pauseBtn.disabled) return;
  paused = !paused;
  if(paused){ pauseBtn.textContent = 'Resume'; setStatus(`Paused — Found: ${found.length} — Checked: ${checked}/${total}`); }
  else { pauseBtn.textContent = 'Pause'; resumeAll(); setStatus('Resuming...'); }
};

stopBtn.onclick = () => {
  if(stopBtn.disabled) return;
  stopRequested = true;
  // if paused, resume so workers can detect stop and exit
  if(paused){ paused = false; resumeAll(); }
  setStatus('Stopping... (finishing in-flight checks)');
};

downloadBtn.onclick = () => {
  if(!found.length) return alert('No results to download.');
  const filename = `subdomains_${(new Date()).toISOString().replace(/[:.]/g,'-')}.txt`;
  const blob = new Blob([found.join('\n')], { type:'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

// upload flow
uploadInput.onchange = async (evt) => {
  const f = evt.target.files && evt.target.files[0];
  if(!f) return;
  uploadFileName.textContent = f.name;
  if(!f.name.toLowerCase().endsWith('.txt')) {
    alert('Please upload a .txt file (one word per line).');
    uploadInput.value = ''; uploadFileName.textContent = 'No file selected'; return;
  }
  setStatus('Reading uploaded wordlist...');
  try {
    const txt = await f.text();
    const arr = normalizeUploaded(txt);
    saveCustom(arr);
    wordlist = arr;
    setStatus(`Uploaded and saved: ${f.name} (${arr.length} words)`);
  } catch (e) {
    console.error(e); setStatus('Upload failed.');
    uploadFileName.textContent = 'No file selected';
  } finally { uploadInput.value = ''; }
};

resetWordlist.onclick = () => {
  if(!confirm('Remove uploaded wordlist and revert to bundled list?')) return;
  chrome.storage.local.remove([STORAGE_KEY], async ()=>{
    wordlist = await loadBundled();
    uploadFileName.textContent = 'No file selected';
    setStatus(`Reverted to bundled list (${wordlist.length} words).`);
  });
};

// helpers used above
function normalizeUploaded(txt){ return String(txt).split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }

// initialize: detect active tab domain and preload wordlist preview
(async function init(){
  downloadBtn.classList.add('hidden'); pauseBtn.disabled=true; stopBtn.disabled=true;
  // detect domain
  try{
    const tabs = await chrome.tabs.query({ active:true, currentWindow:true });
    if(tabs && tabs[0] && tabs[0].url){
      const hostname = new URL(tabs[0].url).hostname;
      activeDomain = hostname.replace(/^www\./,'');
      setStatus(`Ready — Detected: ${activeDomain}`);
    } else {
      setStatus('Ready — open a website tab to scan');
    }
  }catch(e){
    console.error(e); setStatus('Ready');
  }

  // show if custom list saved
  chrome.storage.local.get([STORAGE_KEY], async (data)=>{
    if(data && data[STORAGE_KEY]) {
      const arr = normalizeUploaded(Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY].join('\n') : String(data[STORAGE_KEY]));
      uploadFileName.textContent = `Saved: ${arr.length} words`;
    } else {
      const bundled = await loadBundled();
      uploadFileName.textContent = `Bundled: ${bundled.length} words`;
    }
  });
})();
