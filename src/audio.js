// Quiet, optional WebAudio tones; no external audio or autoplay.
export class GentleAudio {
  constructor(){this.enabled=false;this.context=null;}
  async toggle(){this.enabled=!this.enabled;if(this.enabled){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){this.enabled=false;return false;}this.context??=new Audio();await this.context.resume();this.play('click');}return this.enabled;}
  play(kind='click'){
    if(!this.enabled||!this.context)return;
    const ctx=this.context,now=ctx.currentTime;
    const notes=kind==='memory'?[523.25,659.25,783.99]:kind==='happy'?[659.25,783.99]:[kind==='snack'?587.33:523.25];
    notes.forEach((frequency,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain(),start=now+i*.095;osc.type='sine';osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+.018);gain.gain.exponentialRampToValueAtTime(.0001,start+.32);osc.connect(gain).connect(ctx.destination);osc.start(start);osc.stop(start+.34);});
  }
}
