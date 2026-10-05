import { NES } from './nes-core.js';
import './style.css';
import { defaultSaveName, orderedSaves, moveSave } from './save-list.js';
const $ = (s) => document.querySelector(s);
let games=[], current=null, nes=null, running=false, raf=0, last=0, audio=null, node=null, gain=null, read=0, write=0;
const left=new Float32Array(32768),right=new Float32Array(32768);
const canvas=$('#screen'),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(256,240),words=new Uint32Array(pixels.data.buffer);
const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('nes-club',1);r.onupgradeneeded=()=>{r.result.createObjectStore('games',{keyPath:'id'});r.result.createObjectStore('saves',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}).catch(e=>{toast('本地存储无法打开：'+e.message);return null;});
function store(name,method,value){return new Promise((resolve,reject)=>{if(!db)return reject(new Error('本地存储不可用'));const tx=db.transaction(name,method==='get'||method==='getAll'?'readonly':'readwrite');const r=tx.objectStore(name)[method](value);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500);}
function size(n){return n<1048576?`${(n/1024).toFixed(0)} KB`:`${(n/1048576).toFixed(2)} MB`;}
async function refresh(){games=await store('games','getAll');renderLibrary();await renderSlots();}
function renderLibrary(){const root=$('#library');root.replaceChildren();$('#count').textContent=games.length;const filter=$('#search').value.toLowerCase();for(const g of games.filter(g=>g.name.toLowerCase().includes(filter))){const row=document.createElement('div');row.className='game'+(current?.id===g.id?' active':'');const icon=document.createElement('span');icon.className='cartridge';icon.textContent='▦';const info=document.createElement('div');info.className='game-info';const name=document.createElement('div');name.className='game-name';name.textContent=g.name;name.title=g.name;const meta=document.createElement('div');meta.className='game-meta';meta.textContent=`${size(g.data.byteLength)} · Mapper ${g.mapper}`;info.append(name,meta);const play=document.createElement('button');play.style.cssText='border:0;background:transparent;padding:0;display:flex;gap:10px;align-items:center;text-align:left;min-width:0;flex:1';play.append(icon,info);play.onclick=()=>launch(g);const del=document.createElement('button');del.className='delete';del.textContent='×';del.title='删除 '+g.name;del.onclick=async()=>{if(!confirm(`删除「${g.name}」及其所有存档？`))return;try{await store('games','delete',g.id);for(const s of await store('saves','getAll'))if(s.gameId===g.id)await store('saves','delete',s.id);if(current?.id===g.id){pause();nes=null;current=null;canvas.style.display='none';$('#placeholder').hidden=false;$('#game-title').textContent='等待插入卡带';enable(false);}await refresh();toast('卡带已删除');}catch(e){toast(e.message);}};row.append(play,del);root.append(row);}if(!root.childNodes.length){const empty=document.createElement('div');empty.className='empty-library';empty.textContent=games.length?'没有找到匹配的卡带':'▦\n还没有游戏卡带\n点击右上角导入你的游戏';empty.style.whiteSpace='pre-line';root.append(empty);}}
async function importFiles(files){let added=0,skipped=0,errors=[];for(const file of files){try{if(!file.name.toLowerCase().endsWith('.nes'))throw new Error('请选择 .nes 文件');if(file.size>32*1024*1024)throw new Error('文件超过 32 MB');const data=await file.arrayBuffer(),b=new Uint8Array(data);if(b.length<16||b[0]!==78||b[1]!==69||b[2]!==83||b[3]!==26)throw new Error('无效的 NES 文件头');if((b[7]&12)!==8&&data.byteLength<16+(b[6]&4?512:0)+b[4]*16384+b[5]*8192)throw new Error('ROM 文件不完整');const hash=await crypto.subtle.digest('SHA-256',data),id=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');if(await store('games','get',id)){skipped++;continue;}const probe=new NES({emulateSound:false});probe.loadROM(data);await store('games','put',{id,name:file.name.replace(/\.nes$/i,''),data,mapper:probe.rom.mapperType,created:Date.now()});added++;}catch(e){errors.push(`${file.name}: ${e.message.startsWith('Unsupported mapper:')?'暂不支持此芯片类型（Mapper '+e.message.split(':')[1].trim()+'）':e.message}`);}}await refresh();toast(`导入 ${added} 个游戏${skipped?`，跳过 ${skipped} 个重复文件`:''}${errors.length?`；${errors.join('；')}`:''}`);$('#files').value='';}
function enable(value){for(const id of ['pause','reset','export','restore','new-save'])$('#'+id).disabled=!value;}
async function initAudio(){if(!audio){audio=new AudioContext();gain=audio.createGain();gain.gain.value=Number($('#volume').value);gain.connect(audio.destination);node=audio.createScriptProcessor(2048,0,2);node.onaudioprocess=e=>{const l=e.outputBuffer.getChannelData(0),r=e.outputBuffer.getChannelData(1);for(let i=0;i<l.length;i++){if(running&&read!==write){l[i]=left[read];r[i]=right[read];read=(read+1)&32767;}else{l[i]=r[i]=0;}}};node.connect(gain);}await audio.resume();}
function launch(g){pause();initAudio().catch(e=>toast('音频不可用：'+e.message));try{const next=new NES({sampleRate:audio?.sampleRate||48000,onFrame:buffer=>{for(let i=0;i<buffer.length;i++)words[i]=0xff000000|buffer[i];ctx.putImageData(pixels,0,0);},onAudioSample:(l,r)=>{const next=(write+1)&32767;if(next===read)read=(read+1)&32767;left[write]=l;right[write]=r;write=next;}});next.loadROM(g.data);nes=next;current=g;canvas.style.display='block';$('#placeholder').hidden=true;$('#game-title').textContent=g.name;enable(true);renderLibrary();renderSlots();resume();}catch(e){toast('游戏无法运行：'+e.message);}}
function tick(time){if(!running)return;pollPads();if(!last)last=time;let count=0;while(time-last>=1000/60&&count<4){try{nes.frame();}catch(e){pause();toast('模拟器已暂停：'+e.message);return;}last+=1000/60;count++;}if(time-last>100)last=time;raf=requestAnimationFrame(tick);}
function resume(){if(!nes||running)return;initAudio().catch(e=>toast('音频不可用：'+e.message));read=write=0;running=true;last=0;$('#pause').textContent='Ⅱ 暂停';$('#status').textContent='运行中 · 60 FPS';$('#led').classList.add('on');raf=requestAnimationFrame(tick);}
function pause(){running=false;cancelAnimationFrame(raf);read=write=0;releaseAll();$('#pause').textContent='▶ 继续';$('#status').textContent=current?'已暂停':'待机';$('#led').classList.remove('on');}
const pressed=new Map();function press(source,p,b){if(!nes||!running||pressed.has(source))return;pressed.set(source,[p,b]);nes.buttonDown(p,b);}function release(source){const pair=pressed.get(source);if(!pair)return;pressed.delete(source);if(![...pressed.values()].some(v=>v[0]===pair[0]&&v[1]===pair[1]))nes?.buttonUp(...pair);}function releaseAll(){for(const key of [...pressed.keys()])release(key);}
const keys={KeyW:[1,4],KeyS:[1,5],KeyA:[1,6],KeyD:[1,7],KeyK:[1,0],KeyJ:[1,1],KeyI:[1,8],KeyU:[1,9],Enter:[1,3],ShiftRight:[1,2],ArrowUp:[2,4],ArrowDown:[2,5],ArrowLeft:[2,6],ArrowRight:[2,7],KeyG:[2,0],KeyF:[2,1],KeyH:[2,8],KeyY:[2,9],KeyT:[2,3],KeyR:[2,2]};
window.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||$('#guide').open)return;if(keys[e.code]&&current){e.preventDefault();press(e.code,...keys[e.code]);}});window.addEventListener('keyup',e=>release(e.code));window.addEventListener('blur',()=>{if(running)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();});
function pollPads(){const pads=Array.from(navigator.getGamepads?.()||[]).filter(Boolean).slice(0,2);const active=new Set();pads.forEach((pad,index)=>{const p=index+1;const map=[[0,0],[1,1],[2,8],[3,9],[8,2],[9,3],[12,4],[13,5],[14,6],[15,7]];for(const [pb,b] of map){const id=`pad${p}-${b}`;if(pad.buttons[pb]?.pressed){active.add(id);press(id,p,b);}else release(id);}for(const [axis,direction,b] of [[0,-1,6],[0,1,7],[1,-1,4],[1,1,5]]){const id=`axis${p}-${b}`;if((pad.axes[axis]||0)*direction>.5){active.add(id);press(id,p,b);}else release(id);}});for(const id of pressed.keys())if((id.startsWith('pad')||id.startsWith('axis'))&&!active.has(id))release(id);}
for(const button of document.querySelectorAll('[data-key]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);press(`touch${e.pointerId}`,Number($('#player').value),Number(button.dataset.key));};button.onpointerup=button.onpointercancel=button.onlostpointercapture=e=>release(`touch${e.pointerId}`);}
let slotRenderVersion=0, saveBusy=false, draggedSave=null;
async function gameSaves(gameId){return orderedSaves(await store('saves','getAll'),gameId);}
function saveButton(label, action, disabled=false){const button=document.createElement('button');button.textContent=label;button.disabled=disabled;button.onclick=()=>Promise.resolve(action()).catch(e=>toast('操作失败：'+e.message));return button;}
async function renderSlots(){
  const version=++slotRenderVersion, gameId=current?.id;
  const records=gameId?await gameSaves(gameId):[];
  if(current?.id!==gameId||version!==slotRenderVersion)return;
  const root=$('#slots');root.replaceChildren();
  $('#save-count').textContent=`${records.length} 个存档`;
  for(const id of ['newest-first','oldest-first'])$('#'+id).disabled=records.length<2;
  if(!records.length){const empty=document.createElement('p');empty.className='save-empty';empty.textContent=gameId?'还没有进度，点击“新建存档”保存当前冒险。':'选择游戏后即可保存和管理进度。';root.append(empty);return;}
  records.forEach((s,index)=>{
    const row=document.createElement('div');row.className='slot';row.dataset.saveId=s.id;row.draggable=true;
    const name=s.name||defaultSaveName(current.name,s.date);
    const handle=document.createElement('span');handle.className='save-handle';handle.textContent='⠿';handle.draggable=true;handle.title='拖动排序';handle.setAttribute('aria-label','拖动 '+name+' 排序');
    row.ondragstart=e=>{if(e.target.closest('button,input')){e.preventDefault();return;}draggedSave={id:s.id,gameId};e.dataTransfer.setData('text/plain',s.id);e.dataTransfer.effectAllowed='move';row.classList.add('save-dragging');};
    row.ondragend=()=>{draggedSave=null;document.querySelectorAll('.slot').forEach(r=>r.classList.remove('save-dragging','save-drop'));};
    row.ondragover=e=>{if(draggedSave?.gameId!==gameId)return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';row.classList.add('save-drop');};
    row.ondragleave=()=>row.classList.remove('save-drop');
    row.ondrop=e=>{if(draggedSave?.gameId!==gameId)return;e.preventDefault();e.stopPropagation();const source=draggedSave.id;draggedSave=null;row.classList.remove('save-drop');reorderSaves(gameId,list=>moveSave(list,source,s.id)).catch(e=>toast('排序失败：'+e.message));};
    // Pointer dragging also works on touch screens and embedded browsers.
    handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();handle.setPointerCapture(e.pointerId);handle._drag={x:e.clientX,y:e.clientY,moved:false,target:null};};
    handle.onpointermove=e=>{const drag=handle._drag;if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5&&!drag.moved)return;drag.moved=true;row.classList.add('save-dragging');const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.slot');document.querySelectorAll('.save-drop').forEach(r=>r.classList.remove('save-drop'));drag.target=target?.dataset.saveId;if(target&&target!==row)target.classList.add('save-drop');};
    const endPointer=e=>{const drag=handle._drag;handle._drag=null;document.querySelectorAll('.slot').forEach(r=>r.classList.remove('save-dragging','save-drop'));if(drag?.moved&&drag.target&&e.type!=='pointercancel')reorderSaves(gameId,list=>moveSave(list,s.id,drag.target)).catch(e=>toast('排序失败：'+e.message));};
    handle.onpointerup=handle.onpointercancel=endPointer;
    const info=document.createElement('div');info.className='slot-info';
    const title=document.createElement('div');title.className='save-name';title.textContent=name;title.title=name;
    const small=document.createElement('small');small.textContent=defaultSaveName('',s.date).trim();info.append(title,small);
    const actions=document.createElement('div');actions.className='save-actions';
    const rename=saveButton('改名',()=>{
      if(info.querySelector('input'))return;
      const input=document.createElement('input');input.className='save-name-input';input.value=name;input.maxLength=120;input.setAttribute('aria-label','存档名称');
      const edit=document.createElement('div');edit.className='save-edit';
      const cancel=()=>renderSlots();
      const commit=async()=>{const value=input.value.trim();if(!value){toast('存档名称不能为空');input.focus();return;}const latest=await store('saves','get',s.id);if(!latest||latest.deletedAt)return renderSlots();await store('saves','put',{...latest,name:value});await renderSlots();toast('存档已重命名');};
      edit.append(input,saveButton('确定',commit),saveButton('取消',cancel));info.replaceChildren(edit,small);input.focus();input.select();
      input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commit().catch(e=>toast('改名失败：'+e.message));}if(e.key==='Escape'){e.preventDefault();cancel();}};
    });
    const up=saveButton('↑',()=>reorderSaves(gameId,list=>{const i=list.findIndex(r=>r.id===s.id);return i>0?moveSave(list,s.id,list[i-1].id):list;}),index===0);up.setAttribute('aria-label','上移 '+name);
    const down=saveButton('↓',()=>reorderSaves(gameId,list=>{const i=list.findIndex(r=>r.id===s.id);return i>=0&&i<list.length-1?moveSave(list,s.id,list[i+1].id):list;}),index===records.length-1);down.setAttribute('aria-label','下移 '+name);
    actions.append(saveButton('读取',()=>loadState(s)),rename,up,down,saveButton('删除',async()=>{
      const latest=await store('saves','get',s.id);if(!latest)return;
      await store('saves','put',{...latest,deletedAt:Date.now()});await renderSlots();
      $('#save-undo').hidden=false;$('#save-undo').textContent=`已删除「${name}」 · 撤销`;
      $('#save-undo').onclick=async()=>{try{const deleted=await store('saves','get',s.id);if(deleted){delete deleted.deletedAt;await store('saves','put',deleted);}$('#save-undo').hidden=true;await renderSlots();toast('存档已恢复');}catch(e){toast('恢复失败：'+e.message);}};
      toast('存档已删除，可点击撤销恢复');
    }));
    row.append(handle,info,actions);root.append(row);
  });
}
async function reorderSaves(gameId,transform){
  if(saveBusy)return;saveBusy=true;
  try{const list=transform(await gameSaves(gameId));await new Promise((resolve,reject)=>{
    const tx=db.transaction('saves','readwrite');list.forEach((s,order)=>tx.objectStore('saves').put({...s,order}));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });await renderSlots();}finally{saveBusy=false;}
}
async function saveProgress(){
  if(!nes||!current||saveBusy)return;saveBusy=true;
  const game=current,date=Date.now(),state=nes.toJSON();
  try{const list=await gameSaves(game.id);const order=list.length?Math.min(...list.map(s=>s.order??-s.date))-1:0;
    await store('saves','put',{id:`${game.id}:${crypto.randomUUID()}`,gameId:game.id,name:defaultSaveName(game.name,date),date,order,state});await renderSlots();toast('游戏进度已保存');
  }catch(e){toast('保存失败：'+e.message);}finally{saveBusy=false;}
}
$('#new-save').onclick=saveProgress;
$('#newest-first').onclick=()=>reorderSaves(current.id,list=>list.sort((a,b)=>b.date-a.date)).catch(e=>toast('排序失败：'+e.message));
$('#oldest-first').onclick=()=>reorderSaves(current.id,list=>list.sort((a,b)=>a.date-b.date)).catch(e=>toast('排序失败：'+e.message));
function loadState(s){if(!nes||s.gameId!==current?.id)return toast('该存档不属于当前游戏');const backup=nes.toJSON();pause();try{nes.fromJSON(s.state);resume();toast('进度已恢复');}catch(e){nes.fromJSON(backup);toast('读取失败：'+e.message);}}
$('#import').onclick=$('#empty-import').onclick=()=>$('#files').click();$('#files').onchange=e=>importFiles(e.target.files);$('#search').oninput=renderLibrary;$('#pause').onclick=()=>running?pause():resume();$('#reset').onclick=()=>{if(!nes)return;if(!confirm('重新开始当前游戏？未保存的进度将丢失。'))return;launch(current);};$('#volume').oninput=e=>{if(gain)gain.gain.value=Number(e.target.value);};$('#crt').onclick=()=>{$('#screen-wrap').classList.toggle('crt');$('#crt').setAttribute('aria-pressed',$('#screen-wrap').classList.contains('crt'));};$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#screen-wrap').requestFullscreen();}catch(e){toast('无法进入全屏：'+e.message);}};$('#help').onclick=()=>{if(running)pause();$('#guide').showModal();};$('#close-help').onclick=()=>$('#guide').close();$('#player').onchange=e=>{releaseAll();$('#key-hint').textContent=e.target.value==='1'?'W/S/A/D = 上/下/左/右 · K/J/I/U = A/B/C/D · Enter 开始 · 右 Shift 选择':'方向键 移动 · G/F/H/Y = A/B/C/D · T 开始 · R 选择';};
$('#export').onclick=()=>{if(!nes)return;const payload={format:'nes-club-save',version:1,gameId:current.id,gameName:current.name,core:'jsnes-2.1.0',date:Date.now(),state:nes.toJSON()};const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${current.name}-存档.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('存档已导出');};$('#restore').onclick=()=>$('#save-file').click();$('#save-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('存档文件过大');const s=JSON.parse(await file.text());if(s.format!=='nes-club-save'||s.version!==1||s.core!=='jsnes-2.1.0'||!s.state?.cpu||!s.state?.ppu||!s.state?.mmap)throw new Error('无效或不兼容的存档');loadState(s);}catch(e){toast('导入失败：'+e.message);}finally{$('#save-file').value='';}};
window.addEventListener('dragover',e=>{if(draggedSave)return;e.preventDefault();document.body.classList.add('dragging');});window.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dragging');});window.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('dragging');if(draggedSave){draggedSave=null;return;}if(e.dataTransfer.files.length)importFiles(e.dataTransfer.files);});if(db)refresh().catch(e=>toast('读取游戏库失败：'+e.message));
