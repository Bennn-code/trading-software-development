type ImageDimensions={width:number;height:number};
const SOF_MARKERS=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
const ascii=(bytes:Uint8Array,start:number,length:number)=>String.fromCharCode(...bytes.subarray(start,start+length));

function jpegDimensions(bytes:Uint8Array):ImageDimensions|null{
 let offset=2;
 while(offset+4<=bytes.length){
  if(bytes[offset]!==0xff){offset++;continue;}
  while(bytes[offset]===0xff)offset++;
  const marker=bytes[offset++];
  if(marker===0xd9||marker===0xda)return null;
  if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(offset+2>bytes.length)return null;
  const segmentLength=(bytes[offset]<<8)|bytes[offset+1];
  if(segmentLength<2||offset+segmentLength>bytes.length)return null;
  if(SOF_MARKERS.has(marker)&&segmentLength>=7){
   const height=(bytes[offset+3]<<8)|bytes[offset+4],width=(bytes[offset+5]<<8)|bytes[offset+6];
   return width&&height?{width,height}:null;
  }
  offset+=segmentLength;
 }
 return null;
}

function webpDimensions(bytes:Uint8Array):ImageDimensions|null{
 const chunk=ascii(bytes,12,4);
 if(chunk==='VP8X'&&bytes.length>=30){
  const width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);
  return {width,height};
 }
 if(chunk==='VP8 '&&bytes.length>=30&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a){
  const width=((bytes[26]|(bytes[27]<<8))&0x3fff),height=((bytes[28]|(bytes[29]<<8))&0x3fff);
  return width&&height?{width,height}:null;
 }
 if(chunk==='VP8L'&&bytes.length>=25&&bytes[20]===0x2f){
  const width=1+bytes[21]+((bytes[22]&0x3f)<<8),height=1+((bytes[22]>>6)|(bytes[23]<<2)|((bytes[24]&0x0f)<<10));
  return {width,height};
 }
 return null;
}

export function imageDimensions(bytes:Uint8Array,mime:string):ImageDimensions|null{
 if(mime==='image/png'&&bytes.length>=24&&ascii(bytes,0,8)==='\x89PNG\r\n\x1a\n'){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);
  return width&&height?{width,height}:null;
 }
 if(mime==='image/jpeg'&&bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8)return jpegDimensions(bytes);
 if(mime==='image/webp'&&bytes.length>=30&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP')return webpDimensions(bytes);
 return null;
}

export function imageDimensionsWithinLimit(dimensions:ImageDimensions|null,maxPixels=16_000_000,maxSide=12_000){
 return !!dimensions&&dimensions.width>0&&dimensions.height>0&&dimensions.width<=maxSide&&dimensions.height<=maxSide&&dimensions.width*dimensions.height<=maxPixels;
}
