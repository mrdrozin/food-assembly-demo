import {snapshot, latestAt} from './replay_state.mjs';
const staticReplay = document.documentElement.dataset.replaySource === 'static';
const $ = id => document.getElementById(id);
let data, t = 0, playbackStart = 0, playing = false, previousTick = 0, reviewed = false, allEvents = [];
const frames = new Map();
let frameEpoch = 0;
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = s => `${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${(Math.max(0,s)%60).toFixed(1).padStart(4,'0')}`;
const frameUrl = (camera, i) => staticReplay
  ? `./frames/${encodeURIComponent(camera)}/${i}.jpg`
  : `./api/frame/${encodeURIComponent(camera)}/${i}`;
const label = id => (data.employees || data.review?.employees)?.find(p => p.id === id)?.label || id || 'Unknown';
const ownerColor = id => ['operator_1','marker 1'].includes(id) ? '#91b9ff' : ['operator_2','marker 2'].includes(id) ? '#5ae3b4' : '#f0cc8a';
const logOwner = id => id ? `Employee #${id.replace('operator_', '')}` : 'Unknown';
const levelLabel = level => ({unit:'Output',segment:'Activity',minute:'Minute summary',take:'Recording summary'}[level] || level);
const linkedUnit = e => data.events.find(u=>u.id === e.count_event_id);
function outputOwner(e) {
  const unit = linkedUnit(e);
  return unit ? (reviewed ? unit.review?.employee || unit.employee : unit.employee) : (e.operator_id ? e.operator_id.replace('operator_', 'marker ') : null);
}
const eventOwner = e => e.level === 'unit' ? outputOwner(e) : e.operator_id;
const eventOwnerLabel = e => e.level === 'unit' ? label(outputOwner(e)) : logOwner(e.operator_id);
function title(e) {return `${levelLabel(e.level)} · ${eventOwnerLabel(e)}`;}
function attributionNote(e) {
  if(e.level !== 'unit') return '';
  const unit = linkedUnit(e), employee = outputOwner(e);
  if(!unit) return 'Attribution from CSV; this output is not linked to the counter.';
  const method = reviewed && unit.review?.employee ? 'visual review' : unit.attribution_method === 'zone_origin' ? 'product origin zone and ArUco' : 'identity unconfirmed';
  const sourceEmployee = e.operator_id ? e.operator_id.replace('operator_', 'marker ') : null;
  return `Demo attribution: ${label(employee)} · ${method}.` + (sourceEmployee !== employee ? ` Original CSV: ${logOwner(e.operator_id)}. Original text preserved.` : '');
}

function drawOutputTimes() {
  const outputs = allEvents.filter(e => e.level === 'unit');
  const mark = e => `<button data-output="${escape(e.id)}" style="left:${e.start_s/data.duration_s*100}%;--owner:${ownerColor(eventOwner(e))}" title="${clock(e.start_s)} · ${escape(eventOwnerLabel(e))}" aria-label="${clock(e.start_s)} · ${escape(eventOwnerLabel(e))}"></button>`;
  $('seek-markers').innerHTML = outputs.map(mark).join('');
  const owners = [...new Set(outputs.map(e=>eventOwner(e)))].sort((a,b)=>(a || 'z').localeCompare(b || 'z'));
  $('output-timecodes').innerHTML = owners.map(id=>`<div style="--owner:${ownerColor(id)}"><span>${escape(label(id))}</span>${outputs.filter(e=>eventOwner(e) === id).map(e=>`<button data-output="${escape(e.id)}" title="Jump to output">${clock(e.start_s)}</button>`).join('')}</div>`).join('');
}

function drawOverlay(cid, target, state) {
  const showBoxes = $('object-boxes').checked;
  const camera = data.cameras[cid];
  if (!camera) return;
  let html = '';
  if (cid === data.config.camera_id) {
    const output = camera.zones.find(z => z.area_id === data.config.output_area_id);
    if (output) html += `<polygon class="output-zone" points="${output.polygon_image.map(p=>p.join(',')).join(' ')}" fill="#5ae3b412" stroke="#5ae3b4" stroke-width="2"/><text x="70" y="36" fill="#5ae3b4" font-size="16" font-weight="600">OUTPUT</text>`;
    if (showBoxes) for (const a of data.config.assembly_regions) {
      const b = a.box;
      html += `<rect class="assembly-zone" x="${b[0]}" y="${b[1]}" width="${b[2]-b[0]}" height="${b[3]-b[1]}" rx="6" fill="none" stroke="#91b9ff" stroke-opacity=".7" stroke-dasharray="7 5" stroke-width="2"/>`;
    }
    const obs = latestAt(data.box_observations?.[cid] || [], t);
    if (showBoxes && obs && t - obs.t_s < .8) for (const object of obs.objects || []) {
      const b = object.box;
      if (!b || b.length !== 4 || !b.every(Number.isFinite)) continue;
      // Completed output locations already have their count/employee annotation below.
      const counted = state.units.some(e => Math.hypot((b[0]+b[2]-e.box[0]-e.box[2])/2,(b[1]+b[3]-e.box[1]-e.box[3])/2) < data.config.match_distance_px);
      if (counted && data.config.output_labels.includes(object.label)) continue;
      const txt = object.corrected_from ? object.label : `${object.label} · ${Math.round(object.score*100)}%`;
      const y = Math.max(0,b[1]-21), width = Math.min(250,Math.max(90,txt.length*7));
      html += `<g class="object-box" data-label="${escape(object.label)}"><rect x="${b[0]}" y="${b[1]}" width="${b[2]-b[0]}" height="${b[3]-b[1]}" rx="3" fill="none" stroke="#91b9ff" stroke-width="2"/><rect x="${b[0]}" y="${y}" width="${width}" height="21" rx="3" fill="#14253de8"/><text x="${b[0]+5}" y="${y+15}" fill="#dceaff" font-size="12">${escape(txt)}</text></g>`;
    }
    for (const e of state.units) {
      const b = e.box, owner = reviewed ? e.review?.employee || e.employee : e.employee;
      const txt = `#${e.id.split('-').at(-1)} · ${owner ? label(owner).replace('Employee','Emp.') + (reviewed && e.review ? ' · reviewed' : '') : 'identity unknown'}`;
      html += `<g class="finished-unit"><rect x="${b[0]}" y="${b[1]}" width="${b[2]-b[0]}" height="${b[3]-b[1]}" rx="4" fill="#5ae3b40b" stroke="#5ae3b4" stroke-width="3"/><rect x="${b[0]}" y="${Math.max(0,b[1]-22)}" width="180" height="22" rx="3" fill="#133429e8"/><text x="${b[0]+6}" y="${Math.max(16,b[1]-6)}" fill="#c3ffe8" font-size="13">${escape(txt)}</text></g>`;
    }
  } else if (showBoxes) {
    const obs = latestAt(data.observations[cid], t);
    if (obs && t - obs.t_s < .8) for (const p of obs.tracks || []) {
      if (!p.box) continue;
      const b = p.box;
      html += `<rect x="${b[0]}" y="${b[1]}" width="${b[2]-b[0]}" height="${b[3]-b[1]}" fill="none" stroke="#91b9ff" stroke-width="3"/><text x="${b[0]+5}" y="${Math.max(18,b[1]-8)}" fill="#b5cfff" font-size="24">${escape(p.person ? label(p.person) + ' · ArUco' : 'Employee · identity unknown')}</text>`;
    }
  }
  $(target).innerHTML = html;
}

// Keep the displayed image intact until the next image has decoded completely.
// Each camera loads one frame at a time and coalesces pending playback requests.
async function presentFrame(cid, imgId, labelId) {
  const state = frames.get(cid);
  if (state.loading || !state.next) return;
  const {frame:r, epoch} = state.next;
  state.next = null;
  state.loading = true;
  const image = new Image();
  try {
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(new Error('Frame unavailable'));
      image.src=frameUrl(cid,r.i);
    });
    await image.decode();
    // A manual seek invalidates in-flight frames; normal playback can present
    // a slightly delayed frame while preparing the latest requested one.
    if (epoch !== frameEpoch || r.t_s > t) return;
    const previous = $(imgId);
    image.id=imgId;
    image.alt=previous.alt;
    image.decoding='sync';
    image.dataset.frame=String(r.i);
    image.dataset.time=String(r.t_s);
    previous.replaceWith(image);
    state.shown=r;
    $(labelId).textContent=`frame ${r.i} · ${clock(r.t_s)}`;
  } catch(error) {
    if (epoch === frameEpoch) $(labelId).textContent=`frame ${r.i} unavailable · previous frame retained`;
  } finally {
    state.loading=false;
    if (state.next) void presentFrame(cid,imgId,labelId);
  }
}

function loadFrame(cid, imgId, labelId) {
  const r=latestAt(data.frames[cid],t);
  if (!r) {$(labelId).textContent='before the first frame';return;}
  if (!frames.has(cid)) frames.set(cid,{loading:false,next:null,desired:null,shown:null});
  const state=frames.get(cid);
  if (state.desired?.frame.i === r.i && state.desired.epoch === frameEpoch) return;
  state.desired={frame:r,epoch:frameEpoch};
  state.next=state.desired;
  void presentFrame(cid,imgId,labelId);
}

function drawChart(state) {
  const w = 830, h = 78, x0 = 35, y0 = 20, maximum = Math.max(1,data.summary.total);
  const x = s => x0 + s / data.duration_s * w;
  const y = n => y0 + h - n / maximum * h;
  let html = '';
  for (let i=0;i<=maximum;i++) html += `<line x1="${x0}" y1="${y(i)}" x2="${x0+w}" y2="${y(i)}" stroke="#293447" stroke-width="1"/><text x="14" y="${y(i)+3}" fill="#8796ae" font-size="9">${i}</text>`;
  let d = `M${x0},${y(0)}`, n = 0;
  for (const e of state.units) {d += ` H${x(e.t_s)} V${y(++n)}`;}
  d += ` H${x(t)}`;
  html += `<path d="${d} L${x(t)},${y(0)} L${x0},${y(0)} Z" fill="#5ae3b40b"/><path d="${d}" fill="none" stroke="#5ae3b4" stroke-width="2.5"/>`;
  html += `<line x1="${x(t)}" y1="${y0}" x2="${x(t)}" y2="${y0+h}" stroke="#8eacc5" stroke-dasharray="3 4"/><circle cx="${x(t)}" cy="${y(n)}" r="4" fill="#5ae3b4"/>`;
  for (const s of [0,30,60,90,120]) if (s <= data.duration_s) html += `<text x="${x(s)}" y="121" fill="#8796ae" font-size="9" text-anchor="middle">${clock(s).split('.')[0]}</text>`;
  $('chart').innerHTML = html;
}

function renderEvents() {
  const filter = $('filter').value;
  const events = allEvents.filter(e => filter === 'all' || e.level === filter);
  $('events').innerHTML = events.map(e=>`<div class="event ${e.t_s > t ? 'future' : ''}"><time>${clock(e.start_s)}<br>– ${clock(e.end_s)}</time><i class="event-icon" style="background:${ownerColor(eventOwner(e))}"></i><div><strong>${escape(title(e))}</strong><span class="description">${escape(e.text)}</span>${e.level === 'unit' ? `<span class="description attribution-note">${escape(attributionNote(e))}</span>` : ''}<span class="description">${escape(e.work_zone)} · ${escape(e.identity_source)} · CSV row ${e.source_row}</span></div><span class="tag auto">AUTO · CSV</span><div class="row-actions"><button data-seek="${escape(e.id)}">Jump to event ↗</button><button data-evidence="${escape(e.id)}">Frames</button></div></div>`).join('') || '<p class="small-note">No events.</p>';
}

let lastCountSignature = '';
function render() {
  const state = snapshot(data,t,reviewed);
  $('seek').value = t;
  $('clock').textContent = clock(t);
  $('time-label').textContent = `${clock(t)} / ${clock(data.duration_s)}`;
  $('total').textContent = state.units.length;
  $('attributed').textContent = state.units.length - state.unknown;
  $('attribution-unit').textContent = `of ${state.units.length}`;
  $('attribution-foot').textContent = reviewed ? 'With visual identity review' : 'From the assembly zone and ArUco';
  $('employees').innerHTML = state.people.map(p=>`<div class="employee"><div class="avatar">${escape(p.id.split(' ').at(-1))}</div><div><strong>${escape(p.label)}</strong><span class="sub">${p.reviewed ? `${p.reviewed} portions · identity visually reviewed` : `${p.automatic} portions · automatic attribution`}</span></div><span class="employee-count">${p.units}</span></div>`).join('') + `<div class="employee unknown"><div class="avatar">?</div><div><strong>Identity unconfirmed</strong><span class="sub">${reviewed ? 'Without visual confirmation' : 'Employee attribution requires evidence'}</span></div><span class="employee-count">${state.unknown}</span></div>`;
  $('identity-note').textContent = reviewed ? 'Portions are counted automatically. Employee attribution is visually reviewed using video and ArUco.' : 'Products are tracked from the assembly zone to output. The employee is identified by ArUco in the origin zone at transfer; ambiguous cases remain unattributed. Event history, timeline and frame labels use the same attribution. Original CSV text is preserved separately.';
  loadFrame(data.config.camera_id, 'table-image','table-frame');
  const floor = Object.keys(data.cameras).find(c=>c !== data.config.camera_id);
  if (floor) loadFrame(floor,'floor-image','floor-frame');
  drawOverlay(data.config.camera_id,'table-overlay',state);
  if (floor) drawOverlay(floor,'floor-overlay',state);
  drawChart(state);
  const signature = `${reviewed}-${allEvents.filter(e=>e.t_s<=t).length}-${$('filter').value}`;
  if (signature !== lastCountSignature) {lastCountSignature = signature; renderEvents();}
}

function seek(time) {frameEpoch++;t=Math.max(playbackStart,Math.min(data.duration_s,time));previousTick=performance.now();render();}
function jumpToEvent(event) {
  setPlaying(false);
  seek(Math.max(playbackStart,event.start_s));
  $('seek-feedback').textContent=`${title(event)} · jumped to ${clock(t)}`;
  $('seek-feedback').hidden=false;
  $('seek').focus({preventScroll:true});
  document.querySelector('.video-section').scrollIntoView({block:'start',behavior:'auto'});
}
function setPlaying(value) {playing=value;$('play').textContent=value?'Ⅱ Pause':'▶ Play';previousTick=performance.now();}
function tick(now) {
  if (data && playing && now-previousTick >= 90) {
    t=Math.min(data.duration_s,t+(now-previousTick)/1000*Number($('speed').value));previousTick=now;
    if (t >= data.duration_s) setPlaying(false);
    render();
  }
  requestAnimationFrame(tick);
}

function showEvidence(e) {
  setPlaying(false);
  $('evidence-title').textContent = `${clock(e.start_s)} · ${title(e)}`;
  $('evidence-note').textContent = `${e.text} ${attributionNote(e)} Source: ${data.history_source.file}, row ${e.source_row}. Camera frames at the start of the interval provide recording context; they do not independently verify the log text.`;
  const items = Object.entries(data.frames).map(([camera_id, rows])=>({camera_id, row:latestAt(rows,e.start_s)})).filter(i=>i.row);
  $('evidence-images').innerHTML = items.map(i=>`<figure><img src="${frameUrl(i.camera_id,i.row.i)}" alt="${escape(i.camera_id)}, frame ${i.row.i}"><figcaption>${escape(i.camera_id)} · ${clock(i.row.t_s)}</figcaption></figure>`).join('');
  $('evidence-dialog').showModal();
}

async function init() {
  try {
    const response = await fetch(staticReplay ? './analysis.json' : './api/analysis');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data=await response.json();
    playbackStart=Math.max(0,...Object.values(data.frames).map(fs=>fs[0]?.t_s || 0));
    t=playbackStart;
    const initialTime=new URL(location.href).searchParams.get('t');
    if(initialTime==='end')t=data.duration_s;
    else if(initialTime !== null && Number.isFinite(Number(initialTime)))t=Math.max(playbackStart,Math.min(data.duration_s,Number(initialTime)));
    allEvents=data.history_events || [];
    $('history-source').textContent=`${data.history_source.file} · ${allEvents.length} entries`;
    $('take-info').textContent=data.take_id;
    $('seek').max=data.duration_s;
    drawOutputTimes();
    $('play').disabled=false;
    if (!data.review) {$('attribution').value='automatic';reviewed=false;}
    $('play').onclick=()=>{if(t>=data.duration_s)seek(playbackStart);setPlaying(!playing);};
    $('restart').onclick=()=>{setPlaying(false);seek(playbackStart);};
    $('seek').oninput=()=>seek(Number($('seek').value));
    $('speed').onchange=()=>{previousTick=performance.now();};
    $('jump').onclick=()=>{setPlaying(false);const e=data.events.find(e=>e.kind==='unit_produced');if(e)seek(e.t_s-3);};
    $('end').onclick=()=>{setPlaying(false);seek(data.duration_s);};
    $('attribution').onchange=()=>{reviewed=$('attribution').value==='reviewed';drawOutputTimes();render();};
    $('filter').onchange=()=>{lastCountSignature='';render();};
    $('object-boxes').onchange=()=>{
      $('view-mode-label').textContent=$('object-boxes').checked ? 'Object bounding boxes' : 'Standard view';
      render();
    };
    $('events').onclick=event=>{
      const button=event.target.closest('button');if(!button)return;
      const e=allEvents.find(e=>e.id===(button.dataset.seek||button.dataset.evidence));if(!e)return;
      if(button.dataset.evidence)showEvidence(e);else jumpToEvent(e);
    };
    for (const id of ['seek-markers','output-timecodes']) $(id).onclick=event=>{
      const button=event.target.closest('[data-output]');
      const e=allEvents.find(e=>e.id === button?.dataset.output);
      if(e){setPlaying(false);seek(e.start_s);}
    };
    $('close-dialog').onclick=()=>$('evidence-dialog').close();
    document.addEventListener('keydown',e=>{
      if(['INPUT','SELECT','BUTTON'].includes(e.target.tagName)||$('evidence-dialog').open)return;
      if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}
      if(e.code==='ArrowRight')seek(t+5);
      if(e.code==='ArrowLeft')seek(t-5);
    });
    render();
    requestAnimationFrame(tick);
  } catch(e) {$('error').hidden=false;$('error').textContent=`Unable to load recording: ${e.message}. Check that the demo files are available.`;}
}
init();
