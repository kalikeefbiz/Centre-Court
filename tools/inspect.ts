import * as pc from 'playcanvas';
const canvas=document.querySelector('canvas')!;
const app=new pc.Application(canvas,{graphicsDeviceOptions:{preserveDrawingBuffer:true}});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight=new pc.Color(.7,.7,.7);
const camera=new pc.Entity();camera.addComponent('camera',{clearColor:new pc.Color(.10,.15,.18),fov:40});camera.setPosition(3,1.7,4);camera.lookAt(0,1,0);app.root.addChild(camera);
const light=new pc.Entity();light.addComponent('light',{type:'directional',intensity:1.5});light.setEulerAngles(40,30,0);app.root.addChild(light);app.start();
function load(url:string):Promise<pc.ContainerResource>{return new Promise((res,rej)=>app.assets.loadFromUrl(url,'container',(e,a)=>e?rej(e):res(a!.resource as pc.ContainerResource)))}
const character=await load('/assets/characters/kira/Meshy_AI_Pink_Valkyrie_All_Animations.glb');
const model=character.instantiateRenderEntity();app.root.addChild(model);model.addComponent('anim',{activate:true});
for(const a of character.animations)model.anim!.assignAnimation(a.resource.name,a.resource,undefined,1,false);
model.anim!.playing=false;
const racket=(await load('/assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb')).instantiateRenderEntity();
const socket=new pc.Entity();model.findByName('mixamorig:RightHand')!.addChild(socket);socket.setLocalPosition(0,.08,0);socket.setLocalEulerAngles(0,0,90);socket.addChild(racket);racket.setLocalScale(.72,.72,.72);racket.setLocalPosition(0,.28,0);
app.autoRender=false;
(window as any).inspect={names:character.animations.map(a=>a.resource.name),pose(name:string,t:number,angle=0){model.anim!.baseLayer.transition(name,0);model.anim!.baseLayer.activeStateCurrentTime=t;model.anim!.update(0);const p=model.findByName('mixamorig:Hips')!.getLocalPosition();model.setLocalPosition(-p.x,0,-p.z);camera.setPosition(Math.sin(angle)*4,1.6,Math.cos(angle)*4);camera.lookAt(0,1,0);app.renderNextFrame=true;return ['mixamorig:RightHand','mixamorig:LeftHand','mixamorig:Hips'].map(n=>model.findByName(n)!.getPosition().toArray())}};
