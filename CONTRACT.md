# Abduction: Midnight Harvest

Buildless original browser game; vanilla ES modules, Canvas 2D. No copied assets. Dist is the shipped game. World x 0..2400, y 0..720; ground y=610. Canvas virtual viewport is 1280x720, with a horizontal camera (0..1120). Root owns app.js, index.html, styles.css, config.js, progression.js, audio.js. Simulation agent owns sim.js. Renderer agent owns render.js. Use seconds for all timing.

## Simulation API
`createGame({ mission, upgrades, difficulty='normal', seed=1234 })` returns mutable state. Mission is one of config.MISSIONS. `stepGame(game,input,dt)` advances one fixed 1/60 tick (never own requestAnimationFrame). Input `{moveX,moveY,aimX,aimY,beam}`: movement -1..1; aim in world coordinates. Export other pure helpers as useful for tests.

State minimum: `{time,remaining,status:'playing'|'won'|'lost',mission,ufo:{x,y,vx,vy,hp,maxHp,angle,beamAngle,beamOn,load,capacity,invulnerable},camera,entities:[],projectiles:[],particles:[],texts:[],buildings:[],boss:null|{x,y,hp,maxHp,phase,state,timer},stats:{captured,destroyed,rockKills,planesDown,combo,maxCombo,credits},director:{phase,warning,warningSide,warningY},events:[],beamFeedback}`. Engine pushes discrete `{type:'capture'|'hit'|'throw'|'explosion'|'shot'|'warning'|'win'|'lose',...}` into events, app drains after step. Engine handles particles/text lifetime.

Entity `{id,kind:'civilian'|'thrower'|'gunner'|'agent'|'cow'|'rock'|'truck'|'plane'|'bomb',x,y,vx,vy,w,h,hp,state,physical:'grounded'|'lifted'|'airborne'|'stunned',timer,load,collectible,carried,...}`. Positions are centers. Beam half-angle limit +/-40 degrees from down: beamAngle=0 is down. Buildings `{x,y,w,h,hp,shelter:true}` centers. Projectiles `{x,y,vx,vy,kind:'bullet'|'arc'|'plasma'|'boss',life,...}`. Particles `{x,y,vx,vy,life,maxLife,color,size}`. Texts `{x,y,text,color,life}`. Optional fields must have renderer fallbacks.

`render(ctx,game,{width:1280,height:720,time,reducedMotion:false,menu:false})` paints full scene. Renderer handles background, buildings, entities, beam, UFO, warnings, boss, effects but NOT HTML HUD. Camera state sets world viewport. Also export `drawShip(ctx,x,y,scale,time)` if useful. Title scene is a game state created with mission 1; not stepped until game begins. Renderer may draw ambient details from time.

## Requirements
Five missions 60/75/90/105 seconds and final boss; survive timer OR collect/defeat finite population. Optional capture and object-impact challenges. Lift interrupts attacks, release follows gravity then recovery; rocks/trucks retained under craft rather than collected; drop impacts hit enemies and boss. Obstacle cover blocks shots and line of sight. Civilian flee/shelter; thrower telegraph locked aim; agent bounded homing. Attack director limits overlap and gives recovery. Warned planes, transport delivers population. Boss throw/catch/return bomb with vulnerability windows. No enemy instant spawn damage. On mission win persist rewards and next mission; loss retains collection earnings at half and allows retry. Engine computes earned credits; app calculates payouts. All five upgrade categories functional.

## Config
`WORLD={width:2400,height:720,ground:610}`, `MISSIONS` each `{id,title,subtitle,duration,population,threat,theme,brief,goals:[{key,target,label}],boss}`. `UPGRADES` list `{id,name,description,prices}` with ids suction,capacity,armour,engine,processor. Defaults upgrades all 0. Health 50+armour*10; capacity 30+capacity*10. Difficulty normal/easy/hard (damage and pressure multiplier). No artificial boost from upgrades needed in tests.
