// Split wide/tall screenshots at native resolution so small text is not lost in a full-image resize.
export async function screenshotDetails(file:File):Promise<string[]>{
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width<=1800&&bitmap.height<=1800){
   if(Math.max(bitmap.width,bitmap.height)>=1200)return [];
   const render=(left:number,top:number,width:number,height:number)=>{const canvas=document.createElement('canvas'),scale=Math.min(4,1800/Math.max(width,height));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const context=canvas.getContext('2d');if(!context)throw new Error('無法準備截圖細節');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,left,top,width,height,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');};
   const result=[render(0,0,bitmap.width,bitmap.height)];
   if(bitmap.height>bitmap.width*1.15){const topHeight=Math.max(1,Math.round(bitmap.height*.48));result.push(render(0,0,bitmap.width,topHeight));}
   return result;
  }
  const cols=bitmap.width>1800?2:1,rows=bitmap.height>1800?2:1,result:string[]=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
   const left=Math.max(0,Math.floor(x*bitmap.width/cols)-50),top=Math.max(0,Math.floor(y*bitmap.height/rows)-50);
   const width=Math.min(bitmap.width-left,Math.ceil(bitmap.width/cols)+100),height=Math.min(bitmap.height-top,Math.ceil(bitmap.height/rows)+100);
   const canvas=document.createElement('canvas'),scale=Math.min(1,1800/Math.max(width,height));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
   const context=canvas.getContext('2d');if(!context)throw new Error('無法準備截圖細節');context.drawImage(bitmap,left,top,width,height,0,0,canvas.width,canvas.height);
   result.push(canvas.toDataURL('image/jpeg',.95));
  }
  return result;
 }finally{bitmap.close();}
}
