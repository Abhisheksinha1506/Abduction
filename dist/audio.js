export class Sound {
  constructor({createContext, onError}={}) {
    this.createContext=createContext||(()=>new(window.AudioContext||window.webkitAudioContext)());
    this.onError=onError||((error)=>console.warn('Game audio is unavailable:',error));
    this.enabled=true;this.ctx=null;this.master=null;this.beam=null;
    this.lastShot=-Infinity;this.lastBeamUpdate=-Infinity;this.voices=new Set();this.reported=false;
  }
  report(error){if(!this.reported){this.reported=true;this.onError(error);}}
  unlock(){
    if(!this.enabled)return;
    try{
      if(!this.ctx||this.ctx.state==='closed'){
        this.ctx=this.createContext();this.master=this.ctx.createGain();this.master.gain.value=.7;
        this.master.connect(this.ctx.destination);this.beam=null;this.voices.clear();
      }
      if(this.ctx.state==='suspended')Promise.resolve(this.ctx.resume()).catch(error=>this.report(error));
    }catch(error){this.report(error);}
  }
  setEnabled(value){this.enabled=Boolean(value);if(!this.enabled)this.stopTransient();}
  tone(freq,duration=.15,type='sine',volume=.06,end=freq,delay=0){
    if(!this.enabled||!this.ctx||this.ctx.state==='closed')return;
    let o,g,voice;
    try{
      while(this.voices.size>=16){const oldest=this.voices.values().next().value;oldest.stop();}
      const t=this.ctx.currentTime+delay;o=this.ctx.createOscillator();g=this.ctx.createGain();
      let stopped=false;
      voice={stop:()=>{if(stopped)return;stopped=true;try{o.stop();}catch(error){this.report(error);}o.disconnect();g.disconnect();this.voices.delete(voice);}};
      o.onended=()=>{o.disconnect();g.disconnect();this.voices.delete(voice);};
      o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
      g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
      o.connect(g);g.connect(this.master);this.voices.add(voice);o.start(t);o.stop(t+duration+.02);
    }catch(error){o?.disconnect();g?.disconnect();if(voice)this.voices.delete(voice);this.report(error);}
  }
  play(type){
    if(!this.enabled)return;this.unlock();if(!this.ctx)return;
    switch(type){
      case'capture':this.tone(500,.22,'sine',.08,1100);break;
      case'hit':this.tone(130,.3,'sawtooth',.05,35);break;
      case'explosion':this.tone(75,.4,'sawtooth',.06,23);break;
      case'shot':if(this.ctx.currentTime-this.lastShot>.15){this.tone(250,.09,'triangle',.025,100);this.lastShot=this.ctx.currentTime;}break;
      case'warning':this.tone(700,.35,'triangle',.045,440);break;
      case'win':[330,440,550,880].forEach((frequency,n)=>this.tone(frequency,.35,'sine',.06,frequency,n*.14));break;
      case'lose':this.tone(200,.8,'triangle',.055,50);break;
      case'buy':this.tone(600,.25,'sine',.06,1200);break;
      case'throw':this.tone(160,.14,'triangle',.025,65);break;
      default:this.tone(380,.06,'sine',.025,500);
    }
  }
  setBeam(active){
    try{this.updateBeam(active);}catch(error){
      this.beam?.o.disconnect();this.beam?.g.disconnect();this.beam=null;this.report(error);
    }
  }
  updateBeam(active){
    if(!this.ctx||this.ctx.state==='closed')return;
    if(active&&this.enabled){
      if(!this.beam){
        const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.value=80;g.gain.value=0;
        o.connect(g);g.connect(this.master);o.start();this.beam={o,g};this.lastBeamUpdate=-Infinity;
      }
      const now=this.ctx.currentTime;
      if(now-this.lastBeamUpdate>=1/30){
        this.beam.g.gain.cancelScheduledValues(now);this.beam.g.gain.setTargetAtTime(.035,now,.08);
        this.beam.o.frequency.cancelScheduledValues(now);this.beam.o.frequency.setTargetAtTime(85+Math.sin(now*4)*12,now,.1);this.lastBeamUpdate=now;
      }
    }else if(this.beam){
      const {o,g}=this.beam;this.beam=null;
      g.gain.cancelScheduledValues(this.ctx.currentTime);g.gain.setTargetAtTime(0,this.ctx.currentTime,.02);
      o.onended=()=>{o.disconnect();g.disconnect();};o.stop(this.ctx.currentTime+.12);
    }
  }
  stopTransient(){this.setBeam(false);for(const voice of [...this.voices])voice.stop();}
  dispose(){
    this.stopTransient();this.master?.disconnect();
    if(this.ctx&&this.ctx.state!=='closed')Promise.resolve(this.ctx.close()).catch(error=>this.report(error));
  }
}
