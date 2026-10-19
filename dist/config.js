export const WORLD = { width: 2400, height: 720, ground: 610 };
export const MISSIONS = [
  {id:1,title:'A quiet little farm',subtitle:'01 / GREEN PASTURES',duration:60,population:18,threat:1,theme:'farm',brief:'Your first night on Earth. Collect the locals, make creative use of the rocks, and keep the ship in one piece. Survive the shift or clear the area.',goals:[{key:'captured',target:10,label:'Collect 10 Earth specimens'},{key:'rockKills',target:2,label:'Hit 2 hostiles with dropped cargo'}]},
  {id:2,title:'Unwelcome company',subtitle:'02 / COUNTY LINE',duration:75,population:24,threat:2,theme:'town',brief:'Word travels fast out here. Armed locals and delivery trucks are joining the party. A carried rock makes surprisingly good cover.',goals:[{key:'captured',target:14,label:'Collect 14 Earth specimens'},{key:'rockKills',target:3,label:'Hit 3 hostiles with dropped cargo'}]},
  {id:3,title:'The night shift',subtitle:'03 / INDUSTRIAL OUTSKIRTS',duration:90,population:28,threat:3,theme:'industrial',brief:'The agents have arrived. Their plasma turns slowly: change direction, break line of sight, and interrupt the launch before it happens.',goals:[{key:'captured',target:16,label:'Collect 16 Earth specimens'},{key:'planesDown',target:1,label:'Intercept an aircraft with cargo'}]},
  {id:4,title:'Restricted airspace',subtitle:'04 / SECTOR 51',duration:105,population:32,threat:4,theme:'base',brief:'Nobody is pretending this is a weather balloon anymore. Watch for flight-path warnings and use recovery windows to collect.',goals:[{key:'captured',target:18,label:'Collect 18 Earth specimens'},{key:'rockKills',target:5,label:'Hit 5 hostiles with dropped cargo'}]},
  {id:5,title:'Return to sender',subtitle:'05 / THE LAST LINE',duration:180,population:16,threat:4,theme:'boss',boss:true,brief:'Meet ATLAS, Earth’s very large complaint department. Lift its spent charges or a rock, carry them over the robot, then release onto the glowing core. Your beam is your weapon.',goals:[{key:'rockKills',target:3,label:'Land 3 cargo impacts'},{key:'captured',target:8,label:'Collect 8 specimens during the battle'}]}
];
export const UPGRADES = [
  {id:'suction',name:'Abductor crystal',description:'Pull targets into the ship faster.',prices:[600,1600,3600,6500],icon:'crystal'},
  {id:'capacity',name:'Beam generator',description:'Carry 10 more load units per level.',prices:[600,1600,3600,6500],icon:'beam'},
  {id:'armour',name:'Hull plating',description:'Add 10 shield points per level.',prices:[800,2200,4800],icon:'shield'},
  {id:'engine',name:'Ion drive',description:'Faster flight, tighter handling.',prices:[500,1400,3200,6000],icon:'engine'},
  {id:'processor',name:'Cargo processor',description:'Earn 20% more per specimen per level.',prices:[1200,3000],icon:'processor'}
];
export const EMPTY_UPGRADES={suction:0,capacity:0,armour:0,engine:0,processor:0};
