import {MISSIONS,UPGRADES} from './config.js';
import {createGame,stepGame} from './sim.js';
import {render} from './render.js';
import {loadSave,persistSave,purchaseUpgrade,completeMission} from './progression.js';
import {Sound} from './audio.js';

const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d'),screen=$('screen'),hud=$('hud'),modalLayer=$('modal-layer'),wrap=$('game-wrap');
const fmt=n=>Math.floor(n||0).toLocaleString('en-US');
let save=loadSave(),scene='home',selected=Math.min(save.unlocked,5),game,paused=false,modal=null,settled=false,seed=Date.now(),toastTimer=0,frameTime=0,accumulator=0,uiTime=0;
const sound=new Sound({onError:error=>{console.warn('Game audio unavailable:',error);toast('Sound is unavailable on this device. You can keep playing.');}});sound.setEnabled(save.settings.sound);
const keys=new Set(),pointer={x:640,y:550,active:false,down:false},touch={x:0,y:0,beam:false};
let keyAim=0,keyboardAim=false,stickPointer=null,beamPointer=null,canvasPointer=null;
let viewportWidth=1280,frameFailed=false,focusBeforeModal=null,modalParent=null;
const icons={crystal:'<path d="m18 2 10 12-10 20L8 14Z M8 14h20M18 2v32"/>',beam:'<ellipse cx="18" cy="7" rx="10" ry="4"/><path d="M9 12 3 32m24-20 6 20M14 14l-2 18m10-18 2 18M18 15v17"/>',shield:'<path d="M18 2 31 8v10c0 8-13 16-13 16S5 26 5 18V8Z M18 9v16m-7-10 7-6 7 6"/>',engine:'<path d="m9 24 4-15 5-7 5 7 4 15-9-4Z M13 25v6m5-7v10m5-9v6"/><circle cx="18" cy="12" r="3"/>',processor:'<rect x="6" y="8" width="24" height="21" rx="3"/><path d="M11 2v6m7-6v6m7-6v6M10 15h16M10 22h16m-13 7v5m10-5v5"/>'};

// Opt-in local diagnostics: no telemetry, no work on the normal play path.
const profiling=Boolean(window.location.search?.includes('audit=1'));
const profileSamples=[],profilePacing=[];let profileFrames=0,profilePrevious=0,profileOutput=null;
function recordProfile(started,now){
  if(!profiling)return;
  profileSamples.push(performance.now()-started);if(profileSamples.length>240)profileSamples.shift();
  if(profilePrevious)profilePacing.push(now-profilePrevious);profilePrevious=now;if(profilePacing.length>240)profilePacing.shift();
  if(++profileFrames%60)return;
  if(!profileOutput){profileOutput=document.createElement('output');profileOutput.id='audit-metrics';profileOutput.className='audit-metrics';profileOutput.setAttribute('aria-label','Local performance diagnostics');document.body.append(profileOutput);}
  const sorted=profileSamples.slice().sort((a,b)=>a-b),pacing=profilePacing.slice().sort((a,b)=>a-b);
  const percentile=(values,p)=>Number((values[Math.floor((values.length-1)*p)]||0).toFixed(2));
  profileOutput.textContent=JSON.stringify({scene,paused,viewportWidth,backing:[canvas.width,canvas.height],samples:sorted.length,
    frameCpuP50Ms:percentile(sorted,.5),frameCpuP95Ms:percentile(sorted,.95),frameIntervalP50Ms:percentile(pacing,.5),frameIntervalP95Ms:percentile(pacing,.95),
    entities:game?.entities.length||0,projectiles:game?.projectiles.length||0,particles:game?.particles.length||0,voices:sound.voices.size});
}

function storeSave(){const ok=persistSave(save);if(!ok)toast('Storage unavailable. Progress lasts for this visit.');updateHeader();return ok;}
function updateHeader(){$('balance').innerHTML=`<span>◈</span> <b>${fmt(save.credits)}</b>`;$('sound-button').textContent=save.settings.sound?'♪':'♩';$('sound-button').ariaLabel=save.settings.sound?'Mute sound':'Enable sound';$('sound-button').title=save.settings.sound?'Sound on':'Sound off';}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3200);}
function resetInput(){
  keys.clear();pointer.down=false;touch.x=touch.y=0;touch.beam=false;
  const captures=[[$('touch-stick'),stickPointer],[$('touch-beam'),beamPointer],[canvas,canvasPointer]];
  stickPointer=beamPointer=canvasPointer=null;
  for(const [element,id] of captures)if(id!==null&&element.hasPointerCapture?.(id))element.releasePointerCapture(id);
  $('touch-stick').firstElementChild.style.transform='';
}
function isolateModal(active){
  screen.inert=active;hud.inert=active;
  for(const element of document.querySelectorAll('.topbar,.underbar,.below-game,.page-footer'))element.inert=active;
}
function focusModal(){
  const expected=modal;
  requestAnimationFrame(()=>{if(modal===expected)modalLayer.querySelector('button,select,input')?.focus();});
}
function makeBackdrop(){game=createGame({mission:MISSIONS[0],upgrades:save.upgrades,seed:417});game.ufo.x=Math.min(610,2400-viewportWidth)+viewportWidth*.72;game.ufo.y=270;game.ufo.beamAngle=.13;game.ufo.beamOn=true;game.camera=Math.min(610,2400-viewportWidth);}
function setScene(next){scene=next;paused=false;settled=false;modal=null;modalLayer.classList.add('hidden');isolateModal(false);modalParent=null;resetInput();sound.stopTransient();hud.classList.toggle('hidden',next!=='playing');screen.classList.toggle('hidden',next==='playing');wrap.classList.toggle('playing',next==='playing');$('footer-status').textContent=next==='playing'?'SHIFT IN PROGRESS. MAKE IT COUNT.':'SHIP ONLINE. EARTH UNSUSPECTING.';}
function showHome(){setScene('home');makeBackdrop();screen.innerHTML=`<div class="home"><div class="eyebrow"><span class="status-dot"></span> EARTH IS OPEN FOR BUSINESS</div><h1>ABDUCTION<span>MIDNIGHT HARVEST</span></h1><div class="edition">A SMALL SHIP. A BIG APPETITE.</div><p>Clock in. Beam up. Cash out.<br>Take the night shift on a planet that really,<br>really doesn’t want you here.</p><div class="home-actions"><button class="primary" data-action="missions">${save.completed.length?'Continue campaign':'Let’s make contact'} <span class="arrow">↗</span></button><button class="text-button" data-action="how">How to play <span>↗</span></button></div><div class="home-meta"><span><i>◆</i> 5 MISSIONS</span><span><i>◆</i> ONE VERY USEFUL BEAM</span><span><i>◆</i> ZERO PERMISSION</span></div></div><div class="signal-label"><span class="status-dot"></span> SIGNAL ESTABLISHED</div><div class="location-tag">SOMEWHERE ON EARTH<span>03:47 AM / THE LOCALS ARE ASLEEP. MOSTLY.</span></div>`;}
function missionArt(m){return `<div class="mission-art theme-${m.theme}"><i class="moon"></i><i class="building"></i><span class="sector-number">0${m.id}</span></div>`;}
function showMissions(){setScene('missions');screen.innerHTML=`<div class="menu-panel"><div class="menu-head"><div><span class="eyebrow">YOUR NEXT BAD IDEA</span><h2>Choose a landing zone.</h2></div><div class="menu-tabs"><button class="secondary" data-action="hangar">Upgrade ship <span>↗</span></button><button class="back-button" data-action="home">← Back</button></div></div><div class="mission-grid">${MISSIONS.map(m=>`<button class="mission-card ${selected===m.id?'selected':''}" data-action="select" data-id="${m.id}" ${m.id>save.unlocked?'disabled':''} aria-label="Mission ${m.id}: ${m.title}${m.id>save.unlocked?', locked':''}">${missionArt(m)}<div class="mission-card-content"><span class="eyebrow">${m.boss?'FINAL ENCOUNTER':`${m.duration} SECOND SHIFT`}</span><h3>${m.title}</h3><span class="card-status">${m.id>save.unlocked?'⌑ LOCKED':save.completed.includes(m.id)?'✓ SHIFT COMPLETED':'↗ READY FOR CONTACT'}</span></div></button>`).join('')}</div><div class="mission-detail" id="mission-detail"></div></div>`;updateMissionDetail();}
function updateMissionDetail(){const m=MISSIONS[selected-1];$('mission-detail').innerHTML=`<div><p>${m.brief}</p><div class="optional-goals">${m.goals.map(g=>`<span>${save.best[m.id]?.objectives?.includes(g.key)?'✓':'◇'} ${g.label} <b>+350</b></span>`).join('')}</div></div><button class="primary" data-action="brief">Launch shift <span class="arrow">↗</span></button>`;}
function showBrief(){setScene('brief');const m=MISSIONS[selected-1];screen.innerHTML=`<div class="menu-panel"><button class="back-button" data-action="missions">← Landing zones</button><div class="brief-content"><span class="eyebrow">${m.subtitle}</span><h2>${m.title}</h2><p>${m.brief}</p><div class="brief-instruction">${m.boss?'<b>RETURN TO SENDER</b><br>Wait for the core to glow. Drop rocks or spent charges onto it.':'<b>SURVIVE THE SHIFT OR CLEAR THE AREA</b><br>Hold the beam to collect specimens. Rocks stay beneath your ship.<br>Release above an attacker to turn cargo into a weapon.'}</div><div class="brief-actions"><button class="primary" data-action="start">${m.boss?'Meet ATLAS':'Start the night shift'} <span class="arrow">↗</span></button><button class="secondary" data-action="settings">${save.settings.difficulty==='easy'?'Relaxed':save.settings.difficulty==='hard'?'Overtime':'Standard'} difficulty</button></div><p class="save-message">Progress saves after every shift and upgrade. Your next mission unlocks on a win.</p></div></div>`;}
function showHangar(){setScene('hangar');screen.innerHTML=`<div class="menu-panel"><div class="menu-head"><div><span class="eyebrow">EMPLOYEE BENEFITS</span><h2>A better class of flying saucer.</h2></div><button class="back-button" data-action="missions">← Landing zones</button></div><div class="upgrade-grid">${UPGRADES.map(u=>{const level=save.upgrades[u.id],price=u.prices[level];return `<article class="upgrade-card"><div class="upgrade-icon"><svg viewBox="0 0 36 36" aria-hidden="true">${icons[u.icon]}</svg></div><h3>${u.name}</h3><p>${u.description}</p><div class="upgrade-levels" aria-label="Level ${level} of ${u.prices.length}">${u.prices.map((_,i)=>`<i class="${i<level?'filled':''}"></i>`).join('')}</div><button data-action="buy" data-id="${u.id}" ${price===undefined||save.credits<price?'disabled':''}>${price===undefined?'FULLY UPGRADED':`◈ ${fmt(price)} · UPGRADE`}</button></article>`;}).join('')}</div><p class="hangar-note">New hardware takes effect on your next shift. Replay missions to earn more credits and collect optional bonuses.</p></div>`;}
function openModal(kind){if(!modal)focusBeforeModal=document.activeElement;modalParent=modal==='pause'&&kind!=='pause'?'pause':null;resetInput();sound.stopTransient();if(scene==='playing')paused=true;modal=kind;isolateModal(true);modalLayer.classList.remove('hidden');if(kind==='pause'){modalLayer.innerHTML=`<div class="modal"><span class="eyebrow">TAKE FIVE, SPACE CADET</span><h2>Shift paused.</h2><div class="button-stack"><button class="primary" data-action="resume">Back to the harvest <span>↗</span></button><button class="secondary" data-action="how">Flight manual</button><button class="secondary" data-action="settings">Settings</button><button class="text-button" data-action="restart-confirm">Restart this shift</button><button class="text-button" data-action="exit-confirm">Return to landing zones</button></div></div>`;}else if(kind==='how'){modalLayer.innerHTML=`<div class="modal"><span class="eyebrow">EMPLOYEE ORIENTATION</span><h2>Make yourself at home.</h2><dl class="controls-list"><dt><kbd>W A S D</kbd> / <kbd>ARROWS</kbd></dt><dd>Fly in any direction</dd><dt><kbd>MOUSE</kbd></dt><dd>Aim below the ship</dd><dt><kbd>CLICK</kbd> / <kbd>SPACE</kbd></dt><dd>Hold to lift and collect</dd><dt><kbd>RELEASE</kbd></dt><dd>Drop everything you carry</dd><dt><kbd>Q</kbd> / <kbd>E</kbd></dt><dd>Aim without a mouse</dd><dt><kbd>ESC</kbd> / <kbd>P</kbd></dt><dd>Pause the shift</dd></dl><p>People and cows become cargo credits. Rocks, vehicles, and charges stay under your ship: carry them as cover, then drop them onto enemies. Lift an attacker to cancel its shot.</p><p>Watch the beam load. Heavy cargo can block specimens. Buildings block shots. Aircraft always announce their flight path.</p><p>On touchscreens, use the left thumb pad to fly and hold BEAM to lift directly below you.</p><button class="primary" data-action="close">Got it. Let’s fly. <span>↗</span></button></div>`;}else if(kind==='settings'){modalLayer.innerHTML=`<div class="modal"><span class="eyebrow">FLIGHT PREFERENCES</span><h2>Your kind of chaos.</h2><label class="setting-row"><span>Difficulty<small>Applies to your next shift</small></span><select id="difficulty-select"><option value="easy" ${save.settings.difficulty==='easy'?'selected':''}>Relaxed</option><option value="normal" ${save.settings.difficulty==='normal'?'selected':''}>Standard</option><option value="hard" ${save.settings.difficulty==='hard'?'selected':''}>Overtime</option></select></label><label class="setting-row"><span>Sound effects</span><input id="sound-check" type="checkbox" ${save.settings.sound?'checked':''}></label><label class="setting-row"><span>Reduced motion<small>Less shake and visual movement</small></span><input id="motion-check" type="checkbox" ${save.settings.reducedMotion?'checked':''}></label><p class="save-message">Saved on this browser. No account needed. Progress stays on this device.</p><button class="primary" data-action="close">All set <span>✓</span></button></div>`;}focusModal();}
function closeModal(){
  if(!modal)return;
  if(modal==='confirm'||modalParent==='pause'){openModal('pause');return;}
  const was=modal;modal=null;modalParent=null;isolateModal(false);modalLayer.classList.add('hidden');
  if(scene==='playing'){paused=false;resetInput();canvas.focus({preventScroll:true});}
  else if(scene==='brief'&&was==='settings')showBrief();
  else if(focusBeforeModal?.isConnected)focusBeforeModal.focus({preventScroll:true});
}
function confirmRunAction(action){modalLayer.innerHTML=`<div class="modal"><span class="eyebrow">LEAVING SO SOON?</span><h2>${action==='restart'?'Start this shift over?':'Clock out early?'}</h2><p>This shift’s unbanked earnings will be lost. Your saved credits and upgrades are safe.</p><div class="button-stack"><button class="primary" data-action="${action}">${action==='restart'?'Restart shift':'Return to landing zones'}</button><button class="secondary" data-action="pause">Keep this shift</button></div></div>`;modal='confirm';modalParent=null;focusModal();}
function startGame(){setScene('playing');sound.unlock();game=createGame({mission:MISSIONS[selected-1],upgrades:{...save.upgrades},difficulty:save.settings.difficulty,seed:++seed});game.viewportWidth=viewportWidth;pointer.active=false;keyAim=0;keyboardAim=false;accumulator=0;settled=false;$('hud-sector').textContent=game.mission.subtitle;$('hud-title').textContent=game.mission.title;updateHUD();canvas.focus();}
function showResults(){if(settled)return;settled=true;resetInput();sound.setBeam(false);const won=game.status==='won',result=completeMission(save,game);save=result.save;const stored=storeSave();scene='results';paused=false;hud.classList.add('hidden');screen.classList.remove('hidden');wrap.classList.remove('playing');const m=game.mission,completed=won&&m.id===5;const messages=completed?'ATLAS is down. Earth has filed a formal complaint. Your employer has framed it. Replay any shift and finish the optional contracts.':won?'Another successful night of questionable business. Your earnings are banked. Give your ship an upgrade before the next shift.':'The locals got the last word this time. Half your collection earnings are banked. Upgrade your ship or give this shift another go.';screen.innerHTML=`<div class="results"><div><span class="eyebrow">${completed?'CAMPAIGN COMPLETE':won?'SHIFT COMPLETE':'SHIP RECOVERED'}</span><h2>${completed?'Employee of<br>the galaxy.':won?'A very<br>productive night.':'A small<br>workplace incident.'}</h2><p>${messages}</p><div class="result-totals"><div><strong>${fmt(game.stats.captured)}</strong><span>SPECIMENS</span></div><div><strong>×${Math.max(1,game.stats.maxCombo||1)}</strong><span>BEST MULTIPLIER</span></div></div><div>${m.goals.map(g=>{const done=won&&(game.stats[g.key]||0)>=g.target;return `<div class="goal-result ${done?'done':''}"><span>${done?'✓':'◇'}</span>${g.label} (${Math.min(game.stats[g.key]||0,g.target)}/${g.target})</div>`;}).join('')}</div></div><div><div class="payout-card"><h3>THE NIGHT’S TAKINGS</h3><div class="payout-row"><span>Collection ${won?'':'(50% recovered)'}</span><strong>◈ ${fmt(result.payout.collection)}</strong></div><div class="payout-row"><span>Mission ${result.firstClear?'& first clear':''}</span><strong>◈ ${fmt(result.payout.mission)}</strong></div><div class="payout-row"><span>New optional contracts</span><strong>◈ ${fmt(result.payout.objectives)}</strong></div><div class="payout-row"><span>Performance bonus</span><strong>◈ ${fmt(result.payout.performance)}</strong></div><div class="payout-row total"><span>Total earned</span><strong>◈ ${fmt(result.payout.total)}</strong></div></div><div class="results-actions"><button class="primary" data-action="${won?'hangar':'start'}">${won?'Upgrade ship':'Try again'} <span>↗</span></button><button class="secondary" data-action="missions">Landing zones</button></div>${result.newUnlock?`<p class="save-message">✓ Sector 0${result.newUnlock} unlocked. ${stored?'Your progress is saved.':'Progress is held for this visit.'}</p>`:`<p class="save-message">${stored?'Your earnings and progress are saved.':'Storage unavailable. Earnings are held for this visit.'}</p>`}</div></div>`;$('footer-status').textContent=completed?'ALL SHIFTS COMPLETE. NICE WORK, SPACE CADET.':'SHIFT CLOSED. EARNINGS BANKED.';if(result.newUnlock)selected=result.newUnlock;}
function updateHUD(){if(!game)return;const u=game.ufo;const seconds=Math.ceil(Math.max(0,game.remaining));$('hud-time').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;$('shield-text').textContent=`${Math.ceil(u.hp)} / ${u.maxHp}`;$('shield-meter').style.width=`${100*Math.max(0,u.hp)/u.maxHp}%`;$('shield-meter').style.background=u.hp/u.maxHp<.3?'#f99c81':'#c3f59b';$('load-text').textContent=`${Math.round(u.load)} / ${u.capacity}`;$('load-meter').style.width=`${Math.min(100,100*u.load/u.capacity)}%`;$('capture-count').textContent=String(game.stats.captured).padStart(2,'0');$('combo').textContent=`×${Math.max(1,game.stats.combo||1)}`;$('beam-feedback').textContent=game.beamFeedback||(u.beamOn?'TRACTOR BEAM ACTIVE':'HOLD TO COLLECT');const t=game.time;let tip='';if(game.mission.id===1){if(t<7)tip='WASD or arrows to fly · Mouse to aim · Hold click or SPACE to collect';else if(t<14)tip='Get close to the ground. Line up a specimen beneath your beam.';else if(t<22&&game.stats.captured<2)tip='Hold your beam steady until a specimen reaches the saucer.';else if(t>22&&t<30)tip='Rocks stay in your beam. Release above defenders to drop a weapon.';}if(game.mission.boss&&t<13)tip='Catch spent charges or lift rocks. Drop them onto the glowing core.';if(game.director.warning)tip='⚠ AIRCRAFT INCOMING — watch the marked flight path';$('tutorial-tip').textContent=tip;}

document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;sound.unlock();const action=button.dataset.action;switch(action){case'home':showHome();break;case'missions':showMissions();break;case'select':selected=Number(button.dataset.id);showMissions();break;case'brief':showBrief();break;case'how':openModal('how');break;case'settings':openModal('settings');break;case'hangar':showHangar();break;case'start':case'restart':startGame();break;case'buy':{const r=purchaseUpgrade(save,button.dataset.id);if(r.ok){save=r.save;storeSave();showHangar();sound.play('buy');toast('Upgrade installed. Ready for your next shift.');}else toast(r.reason);break;}case'pause':openModal('pause');break;case'resume':case'close':closeModal();break;case'restart-confirm':confirmRunAction('restart');break;case'exit-confirm':confirmRunAction('exit');break;case'exit':showMissions();break;case'reload':window.location.reload();break;}sound.play('ui');});
document.addEventListener('change',e=>{if(e.target.id==='difficulty-select')save.settings.difficulty=e.target.value;else if(e.target.id==='sound-check'){save.settings.sound=e.target.checked;sound.setEnabled(e.target.checked);sound.unlock();}else if(e.target.id==='motion-check')save.settings.reducedMotion=e.target.checked;else return;storeSave();});
$('sound-button').addEventListener('click',()=>{save.settings.sound=!save.settings.sound;sound.setEnabled(save.settings.sound);sound.unlock();storeSave();});
$('settings-button').addEventListener('click',()=>openModal('settings'));
$('pause-button').addEventListener('click',()=>openModal('pause'));
$('brand').addEventListener('click',e=>{e.preventDefault();if(scene==='playing'){openModal('pause');confirmRunAction('exit');}else showHome();});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(wrap.requestFullscreen)await wrap.requestFullscreen();else toast('Use your browser’s fullscreen control.');}catch{toast('Fullscreen is unavailable in this browser.');}});
function pointerPosition(e){
  const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
  pointer.x=(e.clientX-r.left)*viewportWidth/r.width;pointer.y=(e.clientY-r.top)*720/r.height;pointer.active=true;keyboardAim=false;
}
canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')pointerPosition(e);});
canvas.addEventListener('pointerdown',e=>{
  if(scene!=='playing'||paused||e.button!==0||canvasPointer!==null)return;
  e.preventDefault();sound.unlock();pointerPosition(e);pointer.down=true;canvasPointer=e.pointerId;canvas.setPointerCapture?.(e.pointerId);
});
function releaseCanvas(e){if(e.pointerId!==canvasPointer)return;pointer.down=false;canvasPointer=null;}
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,releaseCanvas);
window.addEventListener('pointerup',releaseCanvas);

canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(modal&&k==='tab'){
    const focusables=[...modalLayer.querySelectorAll('button:not([disabled]),select,input,[tabindex="0"]')];
    const first=focusables[0],last=focusables.at(-1),active=document.activeElement;
    if(first&&((e.shiftKey&&(active===first||!modalLayer.contains(active)))||(!e.shiftKey&&(active===last||!modalLayer.contains(active))))){e.preventDefault();(e.shiftKey?last:first).focus();}
    return;
  }
  if(k==='escape'&&(modal||scene==='playing')){
    e.preventDefault();if(!e.repeat){if(modal)closeModal();else openModal('pause');}return;
  }
  if(e.target.matches('button,a,input,select,textarea,[contenteditable="true"]')||e.ctrlKey||e.metaKey||e.altKey)return;
  if(k==='p'&&!e.repeat){if(modal)closeModal();else if(scene==='playing')openModal('pause');return;}
  if(scene==='playing'&&!paused){
    if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
    keys.add(k);if((k==='q'||k==='e')&&!keyboardAim){keyAim=game.ufo.beamAngle;keyboardAim=true;}if(k===' ')sound.unlock();
  }
});

window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function autoPause(){resetInput();if(scene==='playing'&&!paused)openModal('pause');}
window.addEventListener('blur',autoPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});
$('touch-stick').addEventListener('pointerdown',e=>{if(scene!=='playing'||paused||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);moveStick(e);sound.unlock();});
function moveStick(e){if(stickPointer!==e.pointerId)return;const r=$('touch-stick').getBoundingClientRect(),dx=(e.clientX-r.left-r.width/2)/32,dy=(e.clientY-r.top-r.height/2)/32,len=Math.max(1,Math.hypot(dx,dy));touch.x=dx/len;touch.y=dy/len;$('touch-stick').firstElementChild.style.transform=`translate(${touch.x*25}px,${touch.y*25}px)`;}
$('touch-stick').addEventListener('pointermove',moveStick);for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('touch-stick').addEventListener(ev,e=>{if(e.pointerId!==stickPointer)return;stickPointer=null;touch.x=touch.y=0;$('touch-stick').firstElementChild.style.transform='';});
$('touch-beam').addEventListener('pointerdown',e=>{if(scene!=='playing'||paused||beamPointer!==null)return;e.preventDefault();beamPointer=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);touch.beam=true;pointer.active=false;keyboardAim=false;sound.unlock();});for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('touch-beam').addEventListener(ev,e=>{if(e.pointerId!==beamPointer)return;touch.beam=false;beamPointer=null;});
function frameUnsafe(now){const started=profiling?performance.now():0;const elapsed=Math.min((now-frameTime)/1000||0,.1);frameTime=now;uiTime+=elapsed;if(scene==='playing'&&!paused){accumulator+=elapsed;while(accumulator>=1/60){let mx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touch.x,my=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touch.y;keyAim=Math.max(-.698,Math.min(.698,keyAim+((keys.has('e')?1:0)-(keys.has('q')?1:0))/60));const aimX=keyboardAim?game.ufo.x+Math.sin(keyAim)*400:pointer.active?pointer.x+game.camera:game.ufo.x,aimY=keyboardAim?game.ufo.y+Math.cos(keyAim)*400:pointer.active?pointer.y:game.ufo.y+400;stepGame(game,{moveX:Math.max(-1,Math.min(1,mx)),moveY:Math.max(-1,Math.min(1,my)),aimX,aimY,beam:pointer.down||keys.has(' ')||touch.beam},1/60);for(const event of game.events.splice(0))sound.play(event.type);accumulator-=1/60;if(game.status!=='playing'){showResults();break;}}sound.setBeam(scene==='playing'&&game.ufo.beamOn);if(uiTime>.09){updateHUD();uiTime=0;}}if(game){ctx.setTransform(canvas.width/viewportWidth,0,0,canvas.height/720,0,0);render(ctx,game,{width:viewportWidth,height:720,time:scene==='home'?now/1000:game.time,reducedMotion:save.settings.reducedMotion,menu:scene!=='playing'});}recordProfile(started,now);requestAnimationFrame(frame);}
function frame(now){if(frameFailed)return;try{frameUnsafe(now);}catch(error){reportFatal(error);}}
function reportFatal(error){
  if(frameFailed)return;frameFailed=true;console.error('Game runtime failure:',error);
  resetInput();sound.stopTransient();isolateModal(false);modal=null;modalLayer.classList.add('hidden');
  hud.classList.add('hidden');screen.classList.remove('hidden');scene='error';
  screen.innerHTML='<div class="menu-panel brief-content"><span class="eyebrow">FLIGHT SYSTEM UNAVAILABLE</span><h2>Unable to continue this shift.</h2><p>Your banked progress is safe. Reload to restart. If this repeats, keep the browser console error for troubleshooting.</p><button class="primary" data-action="reload">Reload game</button></div>';
}
function resizeCanvas(){
  const r=wrap.getBoundingClientRect(),width=Math.max(1,wrap.clientWidth||r.width),height=Math.max(1,wrap.clientHeight||r.height);
  viewportWidth=Math.max(480,Math.min(2400,Math.round(720*width/height)));
  const cssWidth=Math.min(width,height*viewportWidth/720),cssHeight=cssWidth*720/viewportWidth;
  const scale=Math.min(2,Math.max(1,cssHeight*(window.devicePixelRatio||1)/720));
  const backingWidth=Math.round(viewportWidth*scale),backingHeight=Math.round(720*scale);
  if(canvas.width!==backingWidth)canvas.width=backingWidth;if(canvas.height!==backingHeight)canvas.height=backingHeight;
  canvas.style.width=`${cssWidth}px`;canvas.style.height=`${cssHeight}px`;
  if(game){game.viewportWidth=viewportWidth;game.camera=Math.max(0,Math.min(game.camera,2400-viewportWidth));
    if(scene==='home'){game.camera=Math.min(610,2400-viewportWidth);game.ufo.x=game.camera+viewportWidth*.72;}}
}
if(typeof ResizeObserver==='function')new ResizeObserver(resizeCanvas).observe(wrap);
window.addEventListener('resize',resizeCanvas);
canvas.addEventListener('contextlost',e=>{e.preventDefault();autoPause();toast('Graphics paused. Waiting for the display to recover.');});
canvas.addEventListener('contextrestored',()=>{resizeCanvas();toast('Display restored. Resume when ready.');});
window.addEventListener('pagehide',()=>sound.dispose());

if(ctx){updateHeader();showHome();resizeCanvas();requestAnimationFrame(frame);}else reportFatal(new Error('Canvas 2D is unavailable in this browser.'));
