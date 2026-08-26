/**
 * DO WE PASS OUR OWN MOTION RULES?
 *
 * Usage: node scripts/motion-selfcheck.mjs [baseUrl]   (needs the site running; default :3877)
 *
 * The `motion-signature` family landed on 2026-08-24 and it reads COMPUTED STYLES in a real
 * browser, which means the only way to know whether our own site trips it is to point a real
 * browser at our own site. It caught a genuine self-own the first time it ran: 64%/67%/100% of
 * the transitions on our three routes computed to Tailwind's shipped default pairing, which is
 * exactly what `motion.framework-default-timing` exists to flag. See the note on
 * `--default-transition-duration` in apps/web/app/globals.css.
 *
 * This file DELIBERATELY re-implements `readMotion` and the six thresholds rather than importing
 * them. That is the point: if the copy here and the rules in packages/detectors-web/src/rules/
 * motion.ts ever disagree, one of the two is wrong and the disagreement is worth finding. A
 * check that imports the thing it is checking cannot catch the thing being wrong.
 *
 * It is not a gate — it needs a server — so it does not run in `npm test`. Run it after any
 * change to motion or to the transition theme tokens.
 */
import { chromium } from "playwright";
const b = await chromium.launch();

const readMotion = () => {
  const listSplit = (value) => { const out=[]; let d=0,c=""; for (const ch of value||"") {
    if(ch==="(")d++; if(ch===")")d--; if(ch===","&&d===0){out.push(c.trim());c="";continue;} c+=ch;}
    if(c.trim())out.push(c.trim()); return out.filter(Boolean); };
  const ms = (v)=>{let m=0;for(const p of listSplit(v)){const n=parseFloat(p);if(!Number.isFinite(n))continue;
    const s=/ms$/.test(p)?n:n*1000; if(Math.abs(s)>Math.abs(m))m=s;} return Math.round(m);};
  const first=(v)=>listSplit(v)[0]??"";
  const sel=(el)=>{const id=el.id?`#${el.id}`:""; const cls=typeof el.className==="string"&&el.className.trim()?"."+el.className.trim().split(/\s+/).slice(0,3).join("."):""; return el.tagName.toLowerCase()+id+cls;};
  const records=[]; const els=[...document.querySelectorAll("body *")].slice(0,4000);
  for (const el of els) {
    const cs=getComputedStyle(el);
    const ownText=[...el.childNodes].some(n=>n.nodeType===3&&(n.textContent??"").trim());
    const decorative=!ownText;
    if (cs.animationName && cs.animationName!=="none")
      records.push({selector:sel(el),source:"animation",name:first(cs.animationName),durationMs:ms(cs.animationDuration),delayMs:ms(cs.animationDelay),easing:first(cs.animationTimingFunction),iterations:first(cs.animationIterationCount),decorative});
    const td=ms(cs.transitionDuration);
    if (td>0 && cs.transitionProperty && cs.transitionProperty!=="none")
      records.push({selector:sel(el),source:"transition",name:first(cs.transitionProperty),properties:cs.transitionProperty,durationMs:td,delayMs:ms(cs.transitionDelay),easing:first(cs.transitionTimingFunction),iterations:"1",decorative});
  }
  const kf=[]; for (const sheet of document.styleSheets) { try { for (const r of sheet.cssRules)
    if (r.type===7||r.constructor.name==="CSSKeyframesRule") { const props=new Set(); for(const k of r.cssRules) for(const p of k.style) props.add(p);
      kf.push({name:r.name,stops:r.cssRules.length,properties:[...props].join(", ")}); } } catch {} }
  // SECTION REVEALS, with the probe's own selector and the probe's own predicate.
  //
  // This used to count sections with a selector of its own and then print "(check)", which is
  // not a check: `motion.every-section-reveals` needs BOTH numbers - it fires only when every
  // one of five-or-more sections carries an entrance - and a script that reports one of them
  // cannot say whether the rule fires. Re-implemented rather than imported, like everything
  // else in this file, but re-implemented against `packages/detectors-web/src/probe.ts` line
  // for line: a different selector here would silently answer a different question.
  const sections=[...document.querySelectorAll("body > * > section, body > section, main > section, main > div")];
  let sectionsWithReveal=0; const revealing=[];
  for (const section of sections) {
    const cands=[section,...[...section.children].slice(0,6)];
    const hit=cands.find((el)=>{ const cs=getComputedStyle(el);
      const animated=cs.animationName&&cs.animationName!=="none"&&/opacity|transform|translate|fade/i.test(`${cs.animationName} ${cs.willChange}`);
      const transitioned=/opacity|transform/i.test(cs.transitionProperty)&&parseFloat(cs.transitionDuration)>0;
      const held=cs.opacity!==""&&parseFloat(cs.opacity)<1;
      return !!(animated||transitioned||held); });
    if (hit) { sectionsWithReveal+=1; revealing.push(sel(hit)); }
  }
  return {records,keyframes:kf,sampled:els.length,sectionsTotal:sections.length,sectionsWithReveal,revealing};
};

/**
 * The base URL was documented as an argument in the header of this file and then ignored by the
 * code, which meant the one machine that could run this check was a machine with a spare 3877.
 * It reads the argument now. `/mcp` is in the list because it is the page that carries the
 * install commands, and a page nobody can reach without tripping our own motion rules is not a
 * page we get to ship.
 */
const BASE = (process.argv[2] || "http://localhost:3877").replace(/\/+$/, "");

for (const path of ["/", "/receipt/4F2A-9C", "/method", "/mcp"]) {
  const ctx = await b.newContext({ viewport:{width:1440,height:1000} });
  const p = await ctx.newPage();
  await p.goto(BASE+path,{waitUntil:"load"});
  await p.waitForTimeout(2500);
  const m = await p.evaluate(readMotion);
  const anim = m.records.filter(r=>r.source==="animation"&&r.durationMs>0);
  const trans = m.records.filter(r=>r.source==="transition"&&r.durationMs>0);
  const bucket = (rs) => { const g=new Map(); for(const r of rs){const k=`${r.durationMs}ms ${r.easing}`; g.set(k,[...(g.get(k)??[]),r]);} 
    return [...g.entries()].sort((a,c)=>c[1].length-a[1].length); };
  const ab = bucket(anim), tb = bucket(trans);
  const loops = anim.filter(r=>r.decorative&&/infinite/i.test(r.iterations));
  console.log(`\n### ${path}   sampled=${m.sampled} animations=${anim.length} transitions=${trans.length}`);
  console.log(`  animation buckets:`, ab.slice(0,5).map(([k,v])=>`${v.length}x ${k}`).join(" | ") || "(none)");
  console.log(`  transition buckets:`, tb.slice(0,5).map(([k,v])=>`${v.length}x ${k}`).join(" | ") || "(none)");
  const topA = ab[0], topT = tb[0];
  const FW = "150mscubic-bezier(0.4,0,0.2,1)";
  const norm = s => s.replace(/\s+/g,"").toLowerCase();
  console.log(`  motion.uniform-timing        : ${anim.length>=6 && topA && topA[1].length>=6 && topA[1].length/anim.length>=0.7 ? "FIRES" : "clear"}  (needs >=6 animations & >=70% one bucket; have ${anim.length}, top ${topA?topA[1].length:0})`);
  console.log(`  motion.framework-default-timing: ${trans.length>=8 && topT && norm(topT[0])===FW && topT[1].length/trans.length>=0.6 ? "FIRES" : "clear"}  (needs >=8 transitions & >=60% at 150ms cubic-bezier(0.4,0,0.2,1); have ${trans.length}, top "${topT?topT[0]:"-"}" ${topT?Math.round(topT[1].length/trans.length*100):0}%)`);
  console.log(`  motion.infinite-decorative-loop: ${loops.length>=2 ? "FIRES" : "clear"}  (needs >=2 infinite decorative element animations; have ${loops.length})`);
  // stagger ladder
  let ladder = false;
  const g=new Map(); for(const r of anim){const k=`${r.name}|${r.durationMs}|${r.easing}`; g.set(k,[...(g.get(k)??[]),r]);}
  for (const [,mem] of g){ const d=[...new Set(mem.map(x=>x.delayMs))].sort((a,c)=>a-c);
    if(d.length<4)continue; const delta=d[1]-d[0]; if(delta<20)continue;
    if(d.every((x,i)=>i===0||x-d[i-1]===delta)) ladder=true; }
  console.log(`  motion.stagger-ladder        : ${ladder?"FIRES":"clear"}`);
  const everySection = m.sectionsTotal>=5 && m.sectionsWithReveal===m.sectionsTotal;
  console.log(`  motion.every-section-reveals : ${everySection?"FIRES":"clear"}  (needs >=5 sections ALL revealing; have ${m.sectionsWithReveal} of ${m.sectionsTotal})`);
  if (m.sectionsWithReveal) console.log(`     revealing:`, m.revealing.join(", "));
  console.log(`  counter.bespoke-keyframe     : ${m.keyframes.filter(k=>(k.stops>=4&&/clip-path|filter|stroke-dash|offset-|mask|letter-spacing|background-position|rotate|skew/i.test(k.properties))||k.stops>=6).map(k=>k.name).join(",")||"none earned"}`);
  console.log(`  our keyframes:`, m.keyframes.filter(k=>/grain|scan/.test(k.name)).map(k=>`${k.name}(${k.stops} stops: ${k.properties})`).join(" | "));
  await ctx.close();
}
await b.close();
