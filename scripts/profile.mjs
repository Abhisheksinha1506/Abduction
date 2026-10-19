import {performance} from 'node:perf_hooks';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const directory=process.argv[2]?path.resolve(process.argv[2]):fileURLToPath(new URL('../dist/',import.meta.url));
const {createGame,stepGame}=await import(pathToFileURL(path.join(directory,'sim.js')));
const {MISSIONS}=await import(pathToFileURL(path.join(directory,'config.js')));
if(!global.gc)throw new Error('Run this profiler with node --expose-gc.');
let ticks=0,totalTime=0;const histogram=new Uint32Array(2001),heaps=[],peaks={entities:0,projectiles:0,particles:0,texts:0,events:0};
function session(run,measure){
  const game=createGame({mission:MISSIONS[run%5],seed:100+run,upgrades:{armour:3,engine:3}});
  for(let frame=0;frame<7200&&game.status==='playing';frame++){
    const started=performance.now();stepGame(game,{moveX:Math.sin(frame/180),moveY:Math.cos(frame/150)*.25,beam:frame%400<300,aimX:game.ufo.x,aimY:610},1/60);
    if(measure){const duration=performance.now()-started;totalTime+=duration;histogram[Math.min(2000,Math.floor(duration*1000))]++;ticks++;
      for(const key in peaks)peaks[key]=Math.max(peaks[key],game[key].length);}
    game.events.length=0;
  }
}
for(let run=0;run<5;run++)session(run,false);
global.gc();heaps.push(process.memoryUsage().heapUsed);
for(let batch=0;batch<3;batch++){
  for(let run=batch*10;run<batch*10+10;run++)session(run,true);
  global.gc();heaps.push(process.memoryUsage().heapUsed);
}
function percentile(p){let count=0;for(let i=0;i<histogram.length;i++){count+=histogram[i];if(count>=ticks*p)return i/1000;}return 2;}
console.log(JSON.stringify({source:directory,node:process.version,scenario:'30 seeded missions; 5 warmups; explicit GC between 10-run batches',ticks,
  averageMs:totalTime/ticks,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),
  percentileOverflow:'Durations above 2ms share the final bucket',peaks,postGcHeapBytes:heaps},null,2));
