// Split wide/tall screenshots at native resolution so small text is not lost in a full-image resize.
export async function screenshotDetails(file:File):Promise<string[]>{
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width<=1800&&bitmap.height<=1800)return [];
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
