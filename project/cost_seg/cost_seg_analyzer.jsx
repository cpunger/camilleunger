import { useState, useRef, useCallback, useEffect } from "react";

const SYSTEM_PROMPT = `You are an expert cost segregation analyst with deep knowledge of IRS guidelines, MACRS depreciation classes, and construction/building component identification.

When given a photo of a property or building component, analyze it and identify all visible items that may qualify for accelerated depreciation under cost segregation.

Respond ONLY with a JSON array of findings. No preamble, no markdown, no explanation outside of the JSON.

Each finding should have:
- "item": short name of the component
- "description": what you see in the image
- "classification": one of "5-Year Personal Property", "7-Year Personal Property", "15-Year Land Improvement", "39-Year Structural", or "Needs Review"
- "confidence": "High", "Medium", or "Low"
- "rationale": 1-2 sentence explanation referencing IRS/MACRS criteria
- "accelerated": true if it qualifies for accelerated depreciation (5, 7, or 15 year), false if structural (39-year)

Focus on:
- Specialty electrical (process wiring, dedicated circuits)
- Decorative/specialty lighting fixtures
- Removable partitions or non-structural walls
- Specialty flooring (raised floors, epoxy, decorative tile)
- Built-in casework and millwork
- Plumbing fixtures and special-purpose plumbing
- HVAC components (especially process-related)
- Parking lots, sidewalks, curbing, landscaping (15-year)
- Signage and decorative elements
- Technology infrastructure (cabling, server rooms)

If an image is unclear or not property-related, return: [{"item": "Unable to analyze", "description": "Image does not appear to show building components", "classification": "Needs Review", "confidence": "Low", "rationale": "No identifiable cost segregation components visible.", "accelerated": false}]`;

const classColors = {
  "5-Year Personal Property":  { bg: "#1a3a2a", border: "#2ecc71", text: "#2ecc71", badge: "#0d2a1a" },
  "7-Year Personal Property":  { bg: "#1a2a3a", border: "#3498db", text: "#3498db", badge: "#0d1a2a" },
  "15-Year Land Improvement":  { bg: "#2a2a1a", border: "#f39c12", text: "#f39c12", badge: "#1a1a0d" },
  "39-Year Structural":        { bg: "#2a1a1a", border: "#e74c3c", text: "#e74c3c", badge: "#1a0d0d" },
  "Needs Review":              { bg: "#2a1a2a", border: "#9b59b6", text: "#9b59b6", badge: "#1a0d1a" },
};
const confDot = { High: "#2ecc71", Medium: "#f39c12", Low: "#e74c3c" };

function exportCSV(files, results) {
  const rows = [["Photo","Item","Description","Classification","Confidence","Accelerated","Rationale"]];
  files.forEach(file => {
    const id = file.name + file.size;
    (results[id]?.findings || []).forEach(f => {
      rows.push([file.name, f.item, f.description, f.classification, f.confidence, f.accelerated ? "Yes" : "No", f.rationale]);
    });
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
  a.download = "costseg-analysis.csv";
  a.click();
}

async function exportPDF(files, results) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"pt", format:"letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  const classRGB = {
    "5-Year Personal Property":  [46,204,113],
    "7-Year Personal Property":  [52,152,219],
    "15-Year Land Improvement":  [243,156,18],
    "39-Year Structural":        [231,76,60],
    "Needs Review":              [155,89,182],
  };

  const bump = (need=60) => { if (y+need > H-M) { doc.addPage(); y=M; } };

  const allF = files.flatMap(f => (results[f.name+f.size]?.findings||[]).map(r=>({...r,photo:f.name})));
  const totalAcc = allF.filter(f=>f.accelerated).length;
  const byClass = {};
  allF.forEach(f => { byClass[f.classification]=(byClass[f.classification]||0)+1; });

  // Header bar
  doc.setFillColor(14,14,14); doc.rect(0,0,W,110,"F");
  doc.setTextColor(200,169,110); doc.setFontSize(8); doc.setFont("helvetica","bold");
  doc.text("COST SEGREGATION ANALYSIS SYSTEM", M, 38);
  doc.setTextColor(232,224,208); doc.setFontSize(26);
  doc.text("PhotoSeg Report", M, 70);
  doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(140,140,140);
  doc.text(`Generated ${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}  ·  ${files.length} photo${files.length!==1?"s":""} analyzed`, M, 90);
  y = 130;

  // Summary strip
  doc.setFillColor(22,22,22); doc.roundedRect(M,y,W-M*2,70,4,4,"F");
  const cs = [M+18, M+(W-M*2)/3+10, M+((W-M*2)*2)/3+10];
  ["TOTAL ITEMS","ACCELERATED","PHOTOS"].forEach((lbl,i)=>{
    doc.setTextColor(130,130,130); doc.setFontSize(8); doc.setFont("helvetica","bold");
    doc.text(lbl, cs[i], y+16);
  });
  [[allF.length,[200,169,110]],[totalAcc,[46,204,113]],[files.length,[200,169,110]]].forEach(([v,rgb],i)=>{
    doc.setTextColor(...rgb); doc.setFontSize(22); doc.setFont("helvetica","bold");
    doc.text(String(v), cs[i], y+50);
  });
  y += 86;

  // Breakdown
  doc.setTextColor(200,169,110); doc.setFontSize(8); doc.setFont("helvetica","bold");
  doc.text("BREAKDOWN BY CLASS", M, y); y+=14;
  Object.entries(byClass).forEach(([cls,count])=>{
    const rgb = classRGB[cls]||[150,150,150];
    doc.setFillColor(...rgb); doc.roundedRect(M,y,5,10,1,1,"F");
    doc.setTextColor(210,210,210); doc.setFontSize(9); doc.setFont("helvetica","normal");
    doc.text(cls, M+14, y+8);
    doc.setFont("helvetica","bold"); doc.setTextColor(...rgb);
    doc.text(String(count), W-M-8, y+8, {align:"right"});
    y+=16;
  });
  y+=10;
  doc.setDrawColor(35,35,35); doc.setLineWidth(0.5); doc.line(M,y,W-M,y); y+=20;

  // Per-photo sections
  files.forEach((file,fi)=>{
    const id = file.name+file.size;
    const findings = results[id]?.findings||[];
    if(!findings.length) return;
    bump(56);
    doc.setFillColor(20,20,20); doc.rect(M,y,W-M*2,28,"F");
    doc.setTextColor(200,169,110); doc.setFontSize(8); doc.setFont("helvetica","bold");
    doc.text(`PHOTO ${fi+1}`, M+10, y+11);
    doc.setTextColor(220,220,220); doc.setFontSize(10);
    doc.text(file.name, M+10, y+22);
    const acc2 = findings.filter(f=>f.accelerated).length;
    doc.setTextColor(46,204,113); doc.setFontSize(8);
    doc.text(`${acc2} accelerated · ${findings.length} total`, W-M-10, y+22, {align:"right"});
    y+=34;

    findings.forEach(f=>{
      const rgb = classRGB[f.classification]||[150,150,150];
      const descL = doc.splitTextToSize(f.description, W-M*2-120);
      const ratL  = doc.splitTextToSize(f.rationale,   W-M*2-20);
      const rowH  = 14 + descL.length*12 + 10 + ratL.length*11 + 16;
      bump(rowH);
      doc.setFillColor(22,22,22); doc.roundedRect(M,y,W-M*2,rowH,3,3,"F");
      doc.setFillColor(...rgb); doc.roundedRect(M,y,3,rowH,1,1,"F");
      doc.setTextColor(232,224,208); doc.setFontSize(10); doc.setFont("helvetica","bold");
      doc.text(f.item, M+14, y+13);
      doc.setTextColor(...rgb); doc.setFontSize(8);
      doc.text(f.classification, W-M-8, y+13, {align:"right"});
      const cRGB = {High:[46,204,113],Medium:[243,156,18],Low:[231,76,60]}[f.confidence]||[120,120,120];
      doc.setFillColor(...cRGB); doc.circle(M+14,y+23,3,"F");
      doc.setTextColor(110,110,110); doc.setFontSize(8); doc.setFont("helvetica","normal");
      doc.text(f.confidence+" confidence", M+22, y+26);
      let iy = y+38;
      doc.setTextColor(170,170,170); doc.setFontSize(9);
      doc.text(descL, M+14, iy); iy+=descL.length*12+8;
      doc.setTextColor(100,100,100); doc.setFont("helvetica","italic"); doc.setFontSize(8);
      doc.text(ratL, M+14, iy);
      y+=rowH+6;
    });
    y+=10;
  });

  // Page footers
  const total = doc.internal.getNumberOfPages();
  for(let i=1;i<=total;i++){
    doc.setPage(i);
    doc.setDrawColor(38,38,38); doc.setLineWidth(0.5); doc.line(M,H-28,W-M,H-28);
    doc.setTextColor(75,75,75); doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text("PhotoSeg  ·  For review only. Consult a licensed cost segregation engineer before filing.", M, H-14);
    doc.text(`Page ${i} of ${total}`, W-M, H-14, {align:"right"});
  }

  doc.save("costseg-report.pdf");
}

function FileCard({ file, result, isLoading }) {
  const url = URL.createObjectURL(file);
  const findings = result?.findings || [];
  const acc = findings.filter(f=>f.accelerated);
  const str = findings.filter(f=>!f.accelerated);

  return (
    <div style={{background:"#141414",border:"1px solid #2a2a2a",borderRadius:4,overflow:"hidden",marginBottom:24}}>
      <div style={{display:"flex",alignItems:"stretch",borderBottom:"1px solid #2a2a2a"}}>
        <div style={{width:180,minHeight:140,flexShrink:0,position:"relative",overflow:"hidden",background:"#0a0a0a"}}>
          <img src={url} alt={file.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",opacity:0.9}} />
          {isLoading && (
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
              <div style={{width:28,height:28,border:"2px solid #c8a96e",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
              <span style={{color:"#c8a96e",fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:2}}>ANALYZING</span>
            </div>
          )}
        </div>
        <div style={{flex:1,padding:"16px 20px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",color:"#888",fontSize:10,letterSpacing:2,marginBottom:6}}>FILE</div>
            <div style={{color:"#e8e0d0",fontFamily:"'DM Mono',monospace",fontSize:13,marginBottom:12,wordBreak:"break-all"}}>{file.name}</div>
          </div>
          {!isLoading && findings.length>0 && (
            <div style={{display:"flex",gap:20}}>
              {[["ACCELERATED","#2ecc71",acc.length],["STRUCTURAL","#e74c3c",str.length],["TOTAL","#c8a96e",findings.length]].map(([label,color,val])=>(
                <div key={label}>
                  <div style={{color,fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:700}}>{val}</div>
                  <div style={{color:"#888",fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:1}}>{label}</div>
                </div>
              ))}
            </div>
          )}
          {result?.error && <div style={{color:"#e74c3c",fontFamily:"'DM Mono',monospace",fontSize:12}}>⚠ {result.error}</div>}
        </div>
      </div>
      {findings.length>0 && (
        <div style={{padding:"0 0 8px 0"}}>
          {findings.map((f,i)=>{
            const c=classColors[f.classification]||classColors["Needs Review"];
            return (
              <div key={i} style={{margin:"8px 12px",background:c.bg,border:`1px solid ${c.border}22`,borderLeft:`3px solid ${c.border}`,borderRadius:3,padding:"10px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{color:"#e8e0d0",fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:600}}>{f.item}</span>
                  {f.accelerated&&<span style={{background:"#1a3a1a",color:"#2ecc71",fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:1,padding:"2px 6px",borderRadius:2}}>✓ ACCELERATED</span>}
                  <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:confDot[f.confidence]||"#888"}} />
                    <span style={{color:"#666",fontFamily:"'DM Mono',monospace",fontSize:10}}>{f.confidence}</span>
                  </span>
                </div>
                <div style={{color:"#aaa",fontFamily:"'DM Mono',monospace",fontSize:11,marginBottom:6}}>{f.description}</div>
                <div style={{marginBottom:6}}>
                  <span style={{background:c.badge,color:c.text,fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:1,padding:"2px 8px",borderRadius:2,border:`1px solid ${c.border}44`}}>{f.classification}</span>
                </div>
                <div style={{color:"#666",fontFamily:"'DM Mono',monospace",fontSize:10,lineHeight:1.5}}>{f.rationale}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CostSegAnalyzer() {
  const [files,   setFiles]   = useState([]);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [dragging,setDragging]= useState(false);
  const [pdfReady,setPdfReady]= useState(false);
  const inputRef = useRef();

  useEffect(()=>{
    if(window.jspdf){setPdfReady(true);return;}
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload=()=>setPdfReady(true);
    document.head.appendChild(s);
  },[]);

  const toBase64 = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(f); });

  const analyzeFile = useCallback(async(file)=>{
    const id=file.name+file.size;
    setLoading(l=>({...l,[id]:true}));
    try {
      const b64=await toBase64(file);
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:SYSTEM_PROMPT,
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:b64}},
            {type:"text",text:"Analyze this photo for cost segregation components. Return only the JSON array."}
          ]}]})
      });
      const data=await res.json();
      const text=data.content?.map(c=>c.text||"").join("")||"";
      const findings=JSON.parse(text.replace(/```json|```/g,"").trim());
      setResults(r=>({...r,[id]:{findings}}));
    } catch {
      setResults(r=>({...r,[id]:{error:"Analysis failed. Please try again.",findings:[]}}));
    } finally {
      setLoading(l=>({...l,[id]:false}));
    }
  },[]);

  const addFiles=useCallback((newFiles)=>{
    const arr=Array.from(newFiles).filter(f=>f.type.startsWith("image/"));
    setFiles(prev=>{
      const ex=new Set(prev.map(f=>f.name+f.size));
      const added=arr.filter(f=>!ex.has(f.name+f.size));
      added.forEach(analyzeFile);
      return [...prev,...added];
    });
  },[analyzeFile]);

  const onDrop=useCallback(e=>{e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files);},[addFiles]);

  const allF=Object.values(results).flatMap(r=>r.findings||[]);
  const totalAcc=allF.filter(f=>f.accelerated).length;
  const anyResults=files.some(f=>(results[f.name+f.size]?.findings||[]).length>0);
  const anyLoading=Object.values(loading).some(Boolean);

  const btn=(disabled,color="#c8a96e")=>({
    background:disabled?"#161616":"#1c1810",
    border:`1px solid ${disabled?"#252525":color+"55"}`,
    color:disabled?"#3a3a3a":color,
    fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:2,
    padding:"9px 20px",borderRadius:3,cursor:disabled?"not-allowed":"pointer",transition:"all 0.15s",
  });

  return (
    <div style={{minHeight:"100vh",background:"#0c0c0c",color:"#e8e0d0",fontFamily:"'DM Mono',monospace",paddingBottom:60}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#111}::-webkit-scrollbar-thumb{background:#333}
      `}</style>

      {/* Header */}
      <div style={{borderBottom:"1px solid #1c1c1c",padding:"28px 40px 24px",display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
        <div>
          <div style={{color:"#c8a96e",fontSize:10,letterSpacing:4,marginBottom:8}}>COST SEGREGATION ANALYSIS SYSTEM</div>
          <div style={{fontSize:28,color:"#e8e0d0",fontWeight:500,letterSpacing:-0.5}}>PhotoSeg</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
          {allF.length>0&&(
            <div style={{display:"flex",gap:24}}>
              {[["ACCELERATED","#2ecc71",totalAcc],["PHOTOS","#c8a96e",files.length]].map(([l,c,v])=>(
                <div key={l} style={{textAlign:"right"}}>
                  <div style={{color:c,fontSize:20,fontWeight:500}}>{v}</div>
                  <div style={{color:"#555",fontSize:9,letterSpacing:2}}>{l}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <button disabled={!anyResults||anyLoading} onClick={()=>exportCSV(files,results)} style={btn(!anyResults||anyLoading)}>↓ CSV</button>
            <button disabled={!anyResults||anyLoading||!pdfReady} onClick={()=>exportPDF(files,results)} style={btn(!anyResults||anyLoading||!pdfReady)}>↓ PDF REPORT</button>
          </div>
        </div>
      </div>

      <div style={{padding:"32px 40px 0"}}>
        {/* Legend */}
        <div style={{display:"flex",gap:16,marginBottom:28,flexWrap:"wrap"}}>
          {Object.entries(classColors).map(([label,colors])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:8,height:8,borderRadius:1,background:colors.border}} />
              <span style={{color:"#666",fontSize:10,letterSpacing:1}}>{label}</span>
            </div>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={onDrop}
          onClick={()=>inputRef.current?.click()}
          style={{border:`1px dashed ${dragging?"#c8a96e":"#272727"}`,borderRadius:4,padding:"36px 24px",textAlign:"center",cursor:"pointer",background:dragging?"#191408":"#0e0e0e",transition:"all 0.15s",marginBottom:32}}
        >
          <input ref={inputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>addFiles(e.target.files)} />
          <div style={{color:dragging?"#c8a96e":"#3a3a3a",fontSize:28,marginBottom:10}}>⊕</div>
          <div style={{color:dragging?"#c8a96e":"#4a4a4a",fontSize:12,letterSpacing:2}}>{dragging?"DROP TO ANALYZE":"DRAG PHOTOS HERE  ·  OR CLICK TO BROWSE"}</div>
          <div style={{color:"#2a2a2a",fontSize:10,letterSpacing:1,marginTop:8}}>JPG · PNG · WEBP · HEIC</div>
        </div>

        {files.map(file=>{
          const id=file.name+file.size;
          return <FileCard key={id} file={file} result={results[id]} isLoading={!!loading[id]} />;
        })}

        {files.length===0&&(
          <div style={{color:"#252525",fontSize:11,letterSpacing:2,textAlign:"center",marginTop:40}}>
            NO PHOTOS UPLOADED · RESULTS WILL APPEAR HERE
          </div>
        )}
      </div>
    </div>
  );
}
