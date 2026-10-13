'use strict';
const $=id=>document.getElementById(id), cfg=window.DMS_CONFIG;
const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});
const names={I981:'高雄',I994:'新北',I995:'桃園',I996:'台中',I997:'台北',I998:'台南'};
const tabs=['營運總覽','派單＆報到效率','D25 診斷','餐廳效率','Rider 效率','訂單分布','星期分析','訂單查詢＆改善追蹤'];
let membership=[],role='center',orders=[],works=[],daily=[],actions=[],page=0,allOrders=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>x?new Date(x):null,minutes=(a,b)=>a&&b?(new Date(b)-new Date(a))/60000:null;
const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—',pct=(n,d)=>d?fmt(n/d*100,1)+'%':'—';
const own=o=>o.delivery_type==='own';const late=o=>o.original_eta&&o.assigned_at&&minutes(o.assigned_at,o.original_eta)<=20;
const lateArr=o=>o.original_eta&&o.rider_arrived_at&&minutes(o.rider_arrived_at,o.original_eta)<15;
const wait=o=>minutes(o.rider_arrived_at,o.departed_at);
const delay=o=>own(o)&&wait(o)!=null&&wait(o)>(lateArr(o)?5:7);
const period=o=>{let d=date(o.order_at);return d?d.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):''};
const slot=o=>{let d=date(o.order_at);if(!d)return '';let t=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(d),[h,m]=t.split(':').map(Number);return String(h).padStart(2,'0')+':'+(m<30?'00':'30')};
const tabulate=(headers,rows)=>`<div class="scroll"><table class="sortable"><thead><tr>${headers.map((x,i)=>`<th data-col="${i}" tabindex="0" role="button" title="點擊排序；再點切換升降冪">${esc(x)} <span class="sortmark">↕</span></th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const sortCell=x=>{let v=x.trim().replace(/,/g,'');if(v==='—'||v==='')return {empty:true};let n=Number(v.replace(/[%分小時]/g,'').trim());if(Number.isFinite(n)&&v!==''&&!/[a-zA-Z]/.test(v))return {number:n};return {text:v};};
function sortTable(th){const table=th.closest('table'),tbody=table?.tBodies[0];if(!tbody)return;const col=Number(th.dataset.col),ascending=th.dataset.dir!=='asc';const rows=[...tbody.rows];rows.sort((a,b)=>{const aa=sortCell(a.cells[col]?.textContent||''),bb=sortCell(b.cells[col]?.textContent||'');if(aa.empty||bb.empty)return aa.empty===bb.empty?0:aa.empty?1:-1;let v=aa.number!==undefined&&bb.number!==undefined?aa.number-bb.number:String(aa.text??aa.number).localeCompare(String(bb.text??bb.number),'zh-Hant',{numeric:true});return ascending?v:-v;});tbody.replaceChildren(...rows);table.querySelectorAll('th').forEach(x=>{x.dataset.dir='';x.querySelector('.sortmark').textContent='↕';x.setAttribute('aria-sort','none');});th.dataset.dir=ascending?'asc':'desc';th.querySelector('.sortmark').textContent=ascending?'▲':'▼';th.setAttribute('aria-sort',ascending?'ascending':'descending');}
document.addEventListener('click',e=>{const th=e.target.closest('table.sortable th[data-col]');if(th){if(th.dataset.dbSort){detailSort={column:th.dataset.dbSort,ascending:detailSort.column===th.dataset.dbSort?!detailSort.ascending:true};fetchDetail().then(renderSummary).catch(e=>$('status').textContent=e.message);}else sortTable(th)}});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('table.sortable th[data-col]')){e.preventDefault();sortTable(e.target)}});
const cards=items=>`<div class="cards">${items.map(([a,b])=>`<div class="card"><small>${esc(a)}</small><b>${esc(b)}</b></div>`).join('')}</div>`;
const box=(title,html)=>`<section class="panel"><h2>${esc(title)}</h2>${html}</section>`;
const d25=arr=>{let a=arr.filter(o=>own(o)&&(o.d25===true||o.d25===false));return pct(a.filter(o=>o.d25===true).length,a.length)};
const centerName=c=>names[c]||c;
const hoursTotal=arr=>arr.reduce((total,x)=>{const a=new Date(x.started_at),b=new Date(x.ended_at),from=new Date($('from').value+'T00:00:00+08:00'),to=new Date($('to').value+'T23:59:59+08:00');return total+Math.max(0,(Math.min(b,to)-Math.max(a,from))/3600000)},0);
const dateOnly=x=>x?new Date(x).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):'—';
function coverageText(){
const range=(arr,field)=>{let lo='',hi='',count=0;for(const x of arr){const v=x[field];if(!v)continue;count++;if(!lo||v<lo)lo=v;if(!hi||v>hi)hi=v;}return count?dateOnly(lo)+' ～ '+dateOnly(hi):'尚無資料';};
return `訂單：${range(allOrders,'order_at')}（${allOrders.length}筆）｜工時：${range(works,'started_at')}（${works.length}區間）`;
}
function refreshCoverage(){const el=$('coverage');if(el)el.textContent=coverageText();}

function mergeMetrics(items){let trips=[];let by=new Map();for(let o of items.filter(own)){if(!o.departed_at||!o.rider_code){trips.push([o]);continue;}let k=[o.center,o.restaurant,o.rider_code].join('|');if(!by.has(k))by.set(k,[]);by.get(k).push(o);}for(let group of by.values()){group.sort((a,b)=>new Date(a.departed_at)-new Date(b.departed_at));let trip=[];for(let o of group){if(!trip.length||Math.abs(new Date(o.departed_at)-new Date(trip[0].departed_at))<=300000){trip.push(o);}else{trips.push(trip);trip=[o];}}if(trip.length)trips.push(trip);}let merged=trips.filter(t=>t.length>=2),mergedOrders=merged.reduce((n,t)=>n+t.length,0),total=items.filter(own).length;return {rate:total?fmt(mergedOrders/total*100,1)+'%':'—',average:merged.length?fmt(mergedOrders/merged.length,2):'—',allAverage:trips.length?fmt(total/trips.length,2):'—'};}
function mergeEvidence(items){
const by=new Map(),trips=[];
for(const x of items.filter(own)){
if(!x.departed_at||!x.rider_code){trips.push([x]);continue;}
const key=[x.center,x.restaurant,x.rider_code].join('|');
if(!by.has(key))by.set(key,[]);
by.get(key).push(x);
}
for(const arr of by.values()){
arr.sort((a,b)=>new Date(a.departed_at)-new Date(b.departed_at));
let trip=[];
for(const x of arr){
if(trip.length&&Math.abs(new Date(x.departed_at)-new Date(trip[0].departed_at))>300000){trips.push(trip);trip=[];}
trip.push(x);
}
if(trip.length)trips.push(trip);
}
const categories=[['單送',t=>t.length===1],['2單',t=>t.length===2],['3單',t=>t.length===3],['4單',t=>t.length===4],['≥5單',t=>t.length>=5]];
const rows=categories.map(([label,test])=>{const a=trips.filter(test),os=a.flat(),w=os.map(wait).filter(Number.isFinite),r=os.map(x=>minutes(x.departed_at,x.delivered_at)).filter(Number.isFinite);return[label,a.length,os.length,d25(os),w.length?fmt(w.reduce((s,x)=>s+x,0)/w.length):'—',r.length?fmt(r.reduce((s,x)=>s+x,0)/r.length):'—'];});
return tabulate(['配送組合','趟次','訂單 TC','D25','平均等餐（分）','平均配送（分）'],rows);
}
function render(){
const adminView=page===tabs.length-1 && role==='op';
$('admin').classList.toggle('hidden',!adminView);
$('page').classList.toggle('hidden',adminView);
if(adminView)return;
let o=orders,ow=o.filter(own),third=o.filter(x=>!own(x)),del=o.filter(delay),sum=del.reduce((s,x)=>s+wait(x),0),eligible=ow.filter(x=>x.d25===true||x.d25===false);let body='',mm=mergeMetrics(o);
if(page===0){let centers=[...new Set(o.map(x=>x.center))].sort();body=box('營運 KPI',cards([['總 TC',o.length],['OWN TC',ow.length],['3rd%',pct(third.length,o.length)],['D25',d25(o)],['外送任務工時',$('group').value==='ALL'?fmt(hoursTotal(works),1)+' 小時':'Group 工時未提供'],['TPLH',$('group').value==='ALL'?(hoursTotal(works)>0?fmt(ow.length/hoursTotal(works),2):'無工時資料'):'—（缺 Group 工時）'],['晚指派率',pct(ow.filter(late).length,ow.length)],['Rider 晚到店率',pct(ow.filter(lateArr).length,ow.length)],['併單率',mm.rate],['平均併單數（併單趟）',mm.average],['平均每趟單數',mm.allAverage]]))+box('中心成績',tabulate(['中心','TC','OWN','3rd%','D25','晚指派%','晚到店%'],centers.map(c=>{let a=o.filter(x=>x.center===c),b=a.filter(own);return[centerName(c),a.length,b.length,pct(a.length-b.length,a.length),d25(a),pct(b.filter(late).length,b.length),pct(b.filter(lateArr).length,b.length)]})));}
if(page===1){let map=new Map();for(let x of ow){let key=period(x)+' '+slot(x)+' '+(x.restaurant||'未提供');let a=map.get(key)||[];a.push(x);map.set(key,a)}let rows=[...map].map(([key,a])=>{let [day,time,...store]=key.split(' ');return[day,time,store.join(' '),a.length,a.filter(late).length,pct(a.filter(late).length,a.length),a.filter(lateArr).length,pct(a.filter(lateArr).length,a.length),d25(a)]}).sort((a,b)=>b[4]+b[6]-a[4]-a[6]);body=box('派單＆報到效率',cards([['晚指派 TC',ow.filter(late).length],['晚指派率',pct(ow.filter(late).length,ow.length)],['晚到店 TC',ow.filter(lateArr).length],['晚到店率',pct(ow.filter(lateArr).length,ow.length)]]))+box('日期 × 30分鐘 × 餐廳',tabulate(['日期','時段','餐廳','OWN TC','晚指派','晚指派%','晚到店','晚到店%','D25'],rows.slice(0,1000)))+box('異常訂單明細',tabulate(['訂單','日期','餐廳','原 ETA','指派','到店','晚指派','晚到店','D25'],ow.filter(x=>late(x)||lateArr(x)).slice(0,1000).map(x=>[x.order_key,period(x),x.restaurant,x.original_eta,x.assigned_at,x.rider_arrived_at,late(x)?'是':'否',lateArr(x)?'是':'否',x.d25===null?'—':x.d25?'Y':'N'])));}
if(page===2){let groups=[['≤1 km',x=>x<=1],['1–2 km',x=>x>1&&x<=2],['2–3 km',x=>x>2&&x<=3],['3–4 km',x=>x>3&&x<=4],['4–5 km',x=>x>4&&x<=5],['>5 km',x=>x>5]];body=box('D25 遲到診斷',cards([['OWN D25',d25(o)],['D25 遲到 TC',eligible.filter(x=>x.d25===false).length],['晚指派相關遲到',eligible.filter(x=>x.d25===false&&late(x)).length],['Rider晚到相關遲到',eligible.filter(x=>x.d25===false&&lateArr(x)).length]]))+box('距離 × TC × Sales × D25',tabulate(['距離','OWN TC','TC占比','Sales占比','D25','平均配送時間(分)'],groups.map(([label,test])=>{let a=ow.filter(x=>Number.isFinite(+x.distance_km)&&test(+x.distance_km)),s=ow.reduce((z,x)=>z+(+x.food_sales||0),0),t=a.map(x=>minutes(x.departed_at,x.delivered_at)).filter(Number.isFinite);return[label,a.length,pct(a.length,ow.length),pct(a.reduce((z,x)=>z+(+x.food_sales||0),0),s),d25(a),fmt(t.reduce((z,x)=>z+x,0)/t.length)]})));
}
if(page===3){let by=new Map();for(let x of ow){let key=x.restaurant||'未提供';if(!by.has(key))by.set(key,[]);by.get(key).push(x)}let rows=[...by].map(([r,a])=>{let b=a.filter(delay),w=b.map(wait).filter(Number.isFinite);return[r,a.length,pct(a.filter(late).length,a.length),pct(a.filter(lateArr).length,a.length),a.filter(x=>!lateArr(x)&&wait(x)>7).length,a.filter(x=>lateArr(x)&&wait(x)>5).length,pct(b.length,a.length),fmt(w.reduce((s,x)=>s+x,0)/w.length)+' 分']}).sort((a,b)=>parseFloat(b[6])-parseFloat(a[6]));body=box('餐廳效率',cards([['延遲 OWN TC',del.length],['改善合計%',pct(del.length,ow.length)],['延遲平均等待時間（分）',fmt(sum/del.length)+' 分']]))+box('餐廳改善優先排名',tabulate(['餐廳','OWN TC','晚指派%','晚到店%','正常到店等餐>7','晚到店等餐>5','改善合計%','延遲平均等待時間'],rows));}
if(page===4){let map=new Map();for(let x of works){if(!['服務員','訓練員'].includes(x.position))continue;let a=map.get(x.rider_code)||[];a.push(x);map.set(x.rider_code,a)}let rows=[...map].map(([id,a])=>{let hours=a.reduce((s,x)=>s+Math.max(0,minutes(x.started_at,x.ended_at)||0)/60,0),r=ow.filter(x=>x.rider_code===id);return[id,a[0].center,fmt(hours),r.length,fmt(r.length/hours,2),d25(r),r.filter(lateArr).length,r.filter(delay).length]}).sort((a,b)=>Number(a[4])-Number(b[4]));body=box('Rider 效率',cards([['已匯入 Rider 工時區間',works.length],['有工時 Rider',map.size],['OWN TC',ow.length]]))+box('Rider 明細（僅已儲存工時）',tabulate(['Rider編號','中心','工時','OWN TC','TPLH','D25','晚到店 TC','等餐異常 TC'],rows))+box('併單績效比較（不提供併單建議）',mergeEvidence(ow))+'<p class="note">Rider 明細依已匯入的服務員與訓練員工時顯示。併單依同 Rider、同餐廳、同趟起始離店時間 ±5 分鐘歸類。</p>'; }
if(page===5){
let buckets=new Map();
for(const x of o){const key=period(x)+'|'+slot(x);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(x);}
const rows=[...buckets].sort(([a],[b])=>a.localeCompare(b)).map(([key,a])=>{const [day,time]=key.split('|'),b=a.filter(own);return[day,time,a.length,b.length,a.length-b.length,pct(b.filter(late).length,b.length),pct(b.filter(lateArr).length,b.length),d25(b)];});
body=box('訂單分布｜30 分鐘',tabulate(['日期','時段','總 TC','OWN TC','第三方 TC','晚指派%','晚到店%','OWN D25'],rows));
}
if(page===6){
const week=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
const rows=week.map((name,i)=>{const a=o.filter(x=>{const d=date(x.order_at);return d&&new Date(d.toLocaleString('en-US',{timeZone:'Asia/Taipei'})).getDay()===i}),b=a.filter(own),c=b.filter(delay);return[name,a.length,b.length,pct(a.length-b.length,a.length),pct(b.filter(late).length,b.length),pct(b.filter(lateArr).length,b.length),b.filter(x=>!lateArr(x)&&wait(x)>7).length,b.filter(x=>lateArr(x)&&wait(x)>5).length,c.length,d25(b)];});
body=box('星期分析',tabulate(['星期','總 TC','OWN TC','3rd%','晚指派%','晚到店%','正常到店等餐>7','晚到店等餐>5','改善合計 TC','D25'],rows));
}
if(page===7){body=box('訂單明細（最多顯示前 1000 筆）',tabulate(['訂單','日期','中心','餐廳','類型','原 ETA','指派剩餘(分)','到店剩餘(分)','等餐(分)','配送時間(分)','距離(km)','D25'],o.slice(0,1000).map(x=>[x.order_key,period(x),centerName(x.center),x.restaurant,x.delivery_type,x.original_eta,fmt(minutes(x.assigned_at,x.original_eta)),fmt(minutes(x.rider_arrived_at,x.original_eta)),fmt(wait(x)),fmt(minutes(x.departed_at,x.delivered_at)),x.distance_km,x.d25===null?'—':x.d25?'Y':'N'])))+box('改善追蹤',tabulate(['日期','中心','餐廳','問題','改善行動','負責人','狀態'],actions.map(x=>[x.created_at,centerName(x.center),x.restaurant,x.title,x.action_text,x.owner_name,x.status])));}
$('page').innerHTML=body;}
// Timeout-safe paged retrieval: no exact COUNT, no simultaneous large scans.
// Date-scoped keyset pagination avoids increasingly expensive OFFSET scans.
const READ_PAGE=300,MAX_DETAIL_ROWS=30000;
async function fetchOrdersScoped(center,from,to){
 const centers=center==='ALL'?Object.keys(names):[center];
 const rows=[];let truncated=false;
 for(const c of centers){
   let cursor=null;
   while(true){
     let q=db.from('delivery_orders').select('*').eq('center',c)
       .gte('order_at',from+'T00:00:00+08:00')
       .lte('order_at',to+'T23:59:59+08:00')
       .order('order_at',{ascending:false}).order('order_key',{ascending:false}).limit(READ_PAGE);
     if(cursor)q=q.or(`order_at.lt.${cursor.at},and(order_at.eq.${cursor.at},order_key.lt.${cursor.key})`);
     const {data,error}=await q;
     if(error)throw Error('訂單查詢：'+error.message);
     const batch=data||[];rows.push(...batch);
     if(rows.length>=MAX_DETAIL_ROWS){truncated=true;break;}
     if(batch.length<READ_PAGE)break;
     const last=batch[batch.length-1];cursor={at:last.order_at,key:last.order_key};
     $('status').textContent=`讀取訂單中：${rows.length.toLocaleString()} 筆（${centerName(c)}）`;
   }
   if(truncated)break;
 }
 return {rows,truncated};
}
async function fetchSmall(table,center,from,to){
 let q=db.from(table).select('*');
 if(center!=='ALL')q=q.eq('center',center);
 if(table==='rider_work_intervals')q=q.lt('started_at',to+'T23:59:59+08:00').gt('ended_at',from+'T00:00:00+08:00');
 if(table==='improvement_actions')q=q.order('created_at',{ascending:false});
 const rows=[];let offset=0;
 while(true){const {data,error}=await q.range(offset,offset+READ_PAGE-1);if(error)throw Error(table+'：'+error.message);const batch=data||[];rows.push(...batch);if(batch.length<READ_PAGE)break;if(rows.length>=MAX_DETAIL_ROWS)throw Error(table+' 資料超過安全讀取上限，請縮小日期範圍');offset+=READ_PAGE;}
 return rows;
}
function groupValue(ac){const v=String(ac||'').trim().toUpperCase();const m=v.match(/(?:TWI\d{3}|I\d{3})[-_ ]?([A-Z])(?:$|[-_ ])/);return m?m[1]:(v||'未標示');}
function applyGroup(){const selected=$('group').value;orders=selected==='ALL'?allOrders:allOrders.filter(o=>groupValue(o.ac)===selected);}
function updateGroupFilter(){const sel=$('group'),previous=sel.value;const groups=[...new Set(allOrders.map(o=>groupValue(o.ac)))].sort();sel.innerHTML='<option value="ALL">全部 Group</option>'+groups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');sel.value=groups.includes(previous)?previous:'ALL';applyGroup();}
let loadGeneration=0;
// Memory-only cache: no additional network traffic when querying the same center/date.
// Bound cache to two query scopes to avoid accumulating 12 months of orders in memory.
const queryCache=new Map(),CACHE_MS=10*60*1000;
function clearQueryCache(){queryCache.clear();}
function cachedQuery(key){const item=queryCache.get(key);if(!item)return null;if(Date.now()-item.at>CACHE_MS){queryCache.delete(key);return null;}return item.data;}
function rememberQuery(key,data){queryCache.delete(key);queryCache.set(key,{at:Date.now(),data});while(queryCache.size>2)queryCache.delete(queryCache.keys().next().value);}

let summary=null,detailRows=[],detailSort={column:'order_at',ascending:false};
const summaryPct=(n,d)=>d?pct(n,d):'—';
const sr=k=>(summary?.rows||[]).filter(x=>x.kind===k);
const sm=(r,k)=>Number(r?.[k]||0);
const d25sum=r=>summaryPct(sm(r,'d25_ok'),sm(r,'d25_n'));
const summaryTable=(cols,rows)=>tabulate(cols,rows);
function renderSummary(){
 const adminView=page===tabs.length-1 && role==='op';$('admin').classList.toggle('hidden',!adminView);$('page').classList.toggle('hidden',adminView);if(adminView)return;
 const total=sr('total')[0]||{},n=sm(total,'own_tc'),tc=sm(total,'tc'),hrs=summary?.hours;
 let body='';
 if(page===0){body=box('營運 KPI（資料庫彙總）',cards([['總 TC',tc],['OWN TC',n],['3rd%',summaryPct(sm(total,'third_tc'),tc)],['D25',d25sum(total)],['晚指派率',summaryPct(sm(total,'late_n'),n)],['Rider 晚到店率',summaryPct(sm(total,'arrive_n'),n)],['外送任務工時',hrs==null?'Group 工時未提供':fmt(Number(hrs),1)+' 小時'],['TPLH',hrs>0?fmt(n/hrs,2):'—']]))+box('中心成績',summaryTable(['中心','總 TC','OWN TC','3rd%','D25','晚指派%','晚到店%'],sr('center').map(r=>[centerName(r.center),r.tc,r.own_tc,summaryPct(r.third_tc,r.tc),d25sum(r),summaryPct(r.late_n,r.own_tc),summaryPct(r.arrive_n,r.own_tc)])));}
 if(page===1){body=box('派單＆報到效率',cards([['晚指派 TC',sm(total,'late_n')],['晚指派率',summaryPct(sm(total,'late_n'),n)],['晚到店 TC',sm(total,'arrive_n')],['晚到店率',summaryPct(sm(total,'arrive_n'),n)]]))+box('日期 × 30分鐘 × 餐廳',summaryTable(['日期','時段','餐廳','OWN TC','晚指派','晚指派%','晚到店','晚到店%','D25'],sr('store_slot').map(r=>[r.day,r.slot,r.restaurant,r.own_tc,r.late_n,summaryPct(r.late_n,r.own_tc),r.arrive_n,summaryPct(r.arrive_n,r.own_tc),d25sum(r)])));}
 if(page===2){body=box('D25 診斷',cards([['OWN D25',d25sum(total)],['D25 遲到 TC',sm(total,'d25_n')-sm(total,'d25_ok')]]))+box('配送距離分析',summaryTable(['距離','OWN TC','TC占比','Sales占比','D25','平均配送時間(分)'],sr('distance').map(r=>[r.band,r.own_tc,summaryPct(r.own_tc,n),summaryPct(r.sales,total.sales),d25sum(r),sm(r,'road_n')?fmt(sm(r,'road_sum')/sm(r,'road_n')):'—'])));}
 if(page===3){body=box('餐廳效率',cards([['延遲等餐 TC',sm(total,'wait7')+sm(total,'wait5')],['延遲平均等待時間(分)',(sm(total,'wait7')+sm(total,'wait5'))?fmt(sm(total,'delayed_wait_sum')/(sm(total,'wait7')+sm(total,'wait5'))):'—']]))+box('餐廳效率明細',summaryTable(['餐廳','OWN TC','晚指派%','晚到店%','正常到店等餐>7','晚到店等餐>5','延遲等餐%','延遲平均等待(分)'],sr('store').map(r=>[r.restaurant,r.own_tc,summaryPct(r.late_n,r.own_tc),summaryPct(r.arrive_n,r.own_tc),r.wait7,r.wait5,summaryPct(sm(r,'wait7')+sm(r,'wait5'),r.own_tc),sm(r,'wait7')+sm(r,'wait5')?fmt(sm(r,'delayed_wait_sum')/(sm(r,'wait7')+sm(r,'wait5'))):'—'])));}
 if(page===4){body=box('Rider 效率｜訂單績效',summaryTable(['Rider','OWN TC','D25','晚指派 TC','晚到店 TC','延遲等餐 TC'],sr('rider').filter(r=>r.rider_code).map(r=>[r.rider_code,r.own_tc,d25sum(r),r.late_n,r.arrive_n,sm(r,'wait7')+sm(r,'wait5')])))+'<p class="note">為節省流量，此頁先顯示 Rider 訂單績效；個別 Rider TPLH、併單趟次尚未納入彙總，避免呈現錯誤數值。</p>';}
 if(page===5){body=box('訂單分布｜30 分鐘',summaryTable(['日期','時段','總 TC','OWN TC','第三方 TC','晚指派%','晚到店%','OWN D25'],sr('slot').map(r=>[r.day,r.slot,r.tc,r.own_tc,r.third_tc,summaryPct(r.late_n,r.own_tc),summaryPct(r.arrive_n,r.own_tc),d25sum(r)])));}
 if(page===6){let m=new Map();for(const r of sr('day')){let wd=new Date(r.day+'T12:00:00+08:00').getUTCDay(),a=m.get(wd)||{tc:0,own_tc:0,third_tc:0,d25_n:0,d25_ok:0,late_n:0,arrive_n:0,wait7:0,wait5:0};for(const k of Object.keys(a))a[k]+=sm(r,k);m.set(wd,a);}body=box('星期分析',summaryTable(['星期','總 TC','OWN TC','3rd%','晚指派%','晚到店%','正常到店等餐>7','晚到店等餐>5','改善合計 TC','D25'],['日','一','二','三','四','五','六'].map((name,i)=>{let r=m.get(i)||{};return['星期'+name,sm(r,'tc'),sm(r,'own_tc'),summaryPct(sm(r,'third_tc'),sm(r,'tc')),summaryPct(sm(r,'late_n'),sm(r,'own_tc')),summaryPct(sm(r,'arrive_n'),sm(r,'own_tc')),sm(r,'wait7'),sm(r,'wait5'),sm(r,'wait7')+sm(r,'wait5'),d25sum(r)]})));}
 if(page===7){body=box('訂單明細｜資料庫排序後最多 100 筆',`<p class="note">點擊表頭會重新向資料庫排序並取得前 100 筆；完整明細請使用 Excel 匯出。</p>`+tabulate(['訂單','日期','中心','餐廳','類型','原 ETA','指派剩餘(分)','到店剩餘(分)','等餐(分)','配送時間(分)','距離(km)','D25'],detailRows.map(x=>[x.order_key,period(x),centerName(x.center),x.restaurant,x.delivery_type,x.original_eta,fmt(minutes(x.assigned_at,x.original_eta)),fmt(minutes(x.rider_arrived_at,x.original_eta)),fmt(wait(x)),fmt(minutes(x.departed_at,x.delivered_at)),x.distance_km,x.d25===null?'—':x.d25?'Y':'N'])));}
 $('page').innerHTML=body;
 if(page===7){const cols=['order_key','order_at','center','restaurant','delivery_type','original_eta','assigned_at','rider_arrived_at','departed_at','delivered_at','distance_km','d25'];$('page').querySelectorAll('table.sortable th').forEach((th,i)=>{th.dataset.dbSort=cols[i];th.title='資料庫排序後取得前100筆';});}
}
async function fetchDetail(){
 let q=db.from('delivery_orders').select('order_key,center,ac,restaurant,order_at,original_eta,assigned_at,rider_arrived_at,departed_at,delivered_at,delivery_type,distance_km,d25').gte('order_at',$('from').value+'T00:00:00+08:00').lt('order_at',nextDay($('to').value)+'T00:00:00+08:00');
 if($('center').value!=='ALL')q=q.eq('center',$('center').value);
 if($('group').value!=='ALL')q=q.ilike('ac','%'+$('group').value);
 const {data,error}=await q.order(detailSort.column,{ascending:detailSort.ascending,nullsFirst:false}).limit(100);
 if(error)throw Error('明細查詢：'+error.message);detailRows=data||[];
}
function nextDay(v){const [y,m,d]=v.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10)}
async function load(){
 const generation=++loadGeneration;
 try{
  $('status').textContent='讀取 KPI 彙總中…';
  const c=$('center').value,from=$('from').value,to=$('to').value,g=$('group').value;
  if(!from||!to||from>to)throw Error('請確認日期範圍');
  const key=JSON.stringify([c,from,to,g]);const hit=cachedQuery(key);
  if(hit){summary=hit;detailRows=[];if(page===7)await fetchDetail();renderSummary();$('status').textContent='使用 10 分鐘彙總快取';return;}
  const {data,error}=await db.rpc('dms_summary',{p_from:from,p_to:to,p_center:c,p_group:g});
  if(error)throw Error('KPI 彙總：'+error.message+'。請先在 Supabase 執行 supabase-lightweight.sql');
  if(generation!==loadGeneration)return;
  summary=data;rememberQuery(key,data);detailRows=[];
  if(page===7)await fetchDetail();
  renderSummary();$('coverage').textContent=`查詢期間：${from} ～ ${to}｜KPI 為完整條件彙總，未下載訂單明細`;
  $('status').textContent=`彙總完成：${sm(sr('total')[0],'tc').toLocaleString()} 筆訂單（只傳輸彙總）`;
 }catch(e){if(generation!==loadGeneration)return;$('status').textContent='讀取失敗：'+e.message;$('page').innerHTML='<section class="panel"><h2>查詢失敗</h2><p>未顯示不完整 KPI；請檢查 SQL 函式及 Supabase 權限。</p></section>';}
}
async function initialize(){let {data:{session}}=await db.auth.getSession();if(!session){$('login').style.display='block';$('app').style.display='none';return;}let {data,error}=await db.from('user_centers').select('center,role');if(error||!data?.length){$('loginMsg').textContent='此帳號尚未取得 DMS 權限：'+(error?.message||'請聯絡 OP');await db.auth.signOut();return;}membership=data;role=data.some(x=>x.role==='op')?'op':'center';$('login').style.display='none';$('app').style.display='block';$('who').textContent=session.user.email+'｜'+(role==='op'?'OP':'中心');if(role==='op'&&!tabs.includes('資料管理（OP）')){tabs.push('資料管理（OP）');buildTabs();}$('center').innerHTML=(role==='op'?[['ALL','全部中心'],...Object.entries(names).map(([a,b])=>[a,b])]:membership.map(x=>[x.center,centerName(x.center)])).map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');$('group').innerHTML='<option value="ALL">全部 Group</option>'+ 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(g=>`<option value="${g}">${g}</option>`).join('');await load();}
$('signin').onclick=async()=>{let {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){$('loginMsg').textContent=error.message;return;}$('password').value='';await initialize();};$('logout').onclick=async()=>{clearQueryCache();await db.auth.signOut();location.reload()};$('refresh').onclick=load; $('group').onchange=load;
function buildTabs(){$('tabs').innerHTML=tabs.map((x,i)=>`<button data-index="${i}" class="${i===page?'active':''}">${i+1}. ${esc(x)}</button>`).join('');}
buildTabs();
$('tabs').onclick=e=>{let b=e.target.closest('button[data-index]');if(!b)return;page=+b.dataset.index;for(let x of $('tabs').children)x.classList.toggle('active',x===b);if(page===7){fetchDetail().then(renderSummary).catch(e=>$('status').textContent=e.message);}else if(summary)renderSummary();else load();};
const excelDate=x=>{if(x==null||x==='')return null;if(x instanceof Date)return x.toISOString();if(typeof x==='number'){let d=XLSX.SSF.parse_date_code(x);if(!d)return null;return new Date(Date.UTC(d.y,d.m-1,d.d,d.H||0,d.M||0,d.S||0)-8*3600000).toISOString()}let s=String(x).trim().replace(' ','T');let d=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s)?s:s+'+08:00');return Number.isFinite(d.getTime())?d.toISOString():null;};
const clean=x=>String(x??'').trim();const centerCode=x=>{let s=clean(x),m=s.match(/I(981|994|995|996|997|998)/i);return m?'I'+m[1]:null};
const field=(r,...keys)=>{for(let k of keys){let match=Object.keys(r).find(h=>normKey(h).toLowerCase()===normKey(k).toLowerCase());if(match!==undefined&&r[match]!==undefined&&r[match]!==null)return r[match];}return null};
const parseNumeric=x=>{let m=clean(x).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
const rcCenter=x=>{let s=clean(x);return centerCode(s)||({'台北外送中心':'I997','新北外送中心':'I994','桃園外送中心':'I995','台中外送中心':'I996','台南外送中心':'I998','高雄外送中心':'I981','台北':'I997','新北':'I994','桃園':'I995','台中':'I996','台南':'I998','高雄':'I981'}[s]||null)};
function orderRowsFromBook(book){let all=[],detected=false;for(let name of book.SheetNames){let sheet=book.Sheets[name];let grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true});let headerAt=grid.findIndex(r=>r.some(v=>normKey(v).toLowerCase()==='regorderid')&&r.some(v=>normKey(v)==='落單時間'));if(headerAt<0)continue;detected=true;let headers=grid[headerAt].map(x=>clean(x));for(let row of grid.slice(headerAt+1)){if(row.every(x=>x==null||x===''))continue;all.push(Object.fromEntries(headers.map((h,i)=>[h,row[i]])));}}if(!detected)throw Error('找不到 ByOrder 欄位：reg order id、落單時間。請確認上傳的是 DMS ByOrder 訂單明細');return all;}

async function importFiles(){if(role!=='op')return;let files=[...$('files').files];if(!files.length)return;$('import').disabled=true;let imported=0,failed=0,skipped=0;let reasons={noKey:0,noCenter:0,noDate:0};try{for(let f of files){$('importStatus').textContent=`處理 ${f.name}… 已寫入 ${imported}`;let book=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});let rows=orderRowsFromBook(book);for(let i=0;i<rows.length;i+=250){let chunk=rows.slice(i,i+250).map(r=>{let key=clean(field(r,'reg order id'));let c=rcCenter(field(r,'AC'))||rcCenter(field(r,'RC'));let at=excelDate(field(r,'落單時間'));if(!key||!c||!at){skipped++;if(!key)reasons.noKey++;if(!c)reasons.noCenter++;if(!at)reasons.noDate++;return null;}let type=clean(field(r,'自動/手動')).includes('第三方')?'third':'own',d25v=clean(field(r,'D25')).toUpperCase();return {order_key:key,center:c,ac:clean(field(r,'AC'))||null,restaurant:clean(field(r,'ID','餐廳'))||null,order_at:at,original_eta:excelDate(field(r,'原預計送達時間')),assigned_at:excelDate(field(r,'指派時間')),rider_arrived_at:excelDate(field(r,'門市到達時間')),departed_at:excelDate(field(r,'外送出發')),delivered_at:excelDate(field(r,'到達時間')),rider_code:clean(field(r,'員工編號'))||null,delivery_type:type,distance_km:parseNumeric(field(r,'距離')),food_sales:parseNumeric(field(r,'餐點金額')),d25:d25v==='Y'?true:d25v==='N'?false:null};}).filter(Boolean);if(chunk.length){let {error}=await db.from('delivery_orders').upsert(chunk,{onConflict:'order_key'});if(error){failed+=chunk.length;throw Error(f.name+'：'+error.message);}imported+=chunk.length;}$('importStatus').textContent=`${f.name}｜已寫入 ${imported} 筆、略過 ${skipped} 筆`;await new Promise(resolve=>setTimeout(resolve,0));}}$('importStatus').textContent=`${imported===0?'未匯入任何訂單，請檢查略過原因：':'匯入完成：'}寫入/更新 ${imported} 筆、略過 ${skipped} 筆（缺訂單ID ${reasons.noKey}、中心無法辨識 ${reasons.noCenter}、日期無法解析 ${reasons.noDate}）、失敗 ${failed} 筆。正在更新共用資料。`;clearQueryCache();await load();}catch(e){$('importStatus').textContent='匯入中止：'+e.message+`（已寫入 ${imported} 筆；略過 ${skipped} 筆：缺訂單ID ${reasons.noKey}、中心無法辨識 ${reasons.noCenter}、日期無法解析 ${reasons.noDate}）`;}finally{$('import').disabled=false;}}$('import').onclick=importFiles;

// Rider work-hour source: only delivery-center support assignments count.
const normKey=x=>String(x??'').trim().replace(/\s+/g,'');
const workCenter=(...xs)=>{for(const x of xs){let c=centerCode(x);if(c)return c;}return null};
const isDeliveryCenter=(name,code)=>/外送中心/.test(clean(name))||/^I(981|994|995|996|997|998)(?:-|$)/i.test(clean(name))||/^TWI(981|994|995|996|997|998)$/i.test(clean(code));
const clockParts=x=>{if(x==null||x==='')return null;if(x instanceof Date)return [x.getUTCHours(),x.getUTCMinutes(),x.getUTCSeconds()];if(typeof x==='number'){let z=((x%1)+1)%1*86400;return[Math.floor(z/3600),Math.floor(z%3600/60),Math.round(z%60)];}let m=String(x).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);return m?[+m[1],+m[2],+(m[3]||0)]:null};
const workDay=x=>{if(x instanceof Date)return [x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate()];if(typeof x==='number'){let d=XLSX.SSF.parse_date_code(x);return d?[d.y,d.m,d.d]:null;}let m=String(x??'').match(/(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)/);if(m)return[+m[1],+m[2],+m[3]];let d=new Date(x);return Number.isFinite(d.getTime())?[d.getFullYear(),d.getMonth()+1,d.getDate()]:null};
const taipeiTime=(day,clock)=>{if(!day||!clock)return null;return new Date(Date.UTC(day[0],day[1]-1,day[2],clock[0]-8,clock[1],clock[2])).toISOString()};
function parseWorkRows(book){let output=[],skip={nonDelivery:0,noTime:0,invalid:0};for(const name of book.SheetNames){let grid=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:null,raw:true});let headerAt=grid.findIndex(row=>row.some(v=>normKey(v)==='員工編號')&&row.some(v=>normKey(v)==='支援餐廳名稱'));const fixed=['FT/PT','工時型態','所屬RC','所屬AC','所屬餐廳店號','所屬餐廳名稱','員工編號','員工姓名','職級','日結日期','支援日期','支援餐廳店號','支援餐廳名稱','IN1','OUT1','IN2','OUT2','IN3','OUT3','總工時'];if(headerAt<0&&!grid.some(r=>r.length>=20&&clean(r[6])&&clean(r[12])))continue;let hdr=headerAt>=0?grid[headerAt].map(normKey):fixed;let col=(r,k)=>r[hdr.indexOf(normKey(k))];for(let j=Math.max(0,headerAt+1);j<grid.length;j++){let row=grid[j],id=clean(col(row,'員工編號'));if(!id)continue;let dest=col(row,'支援餐廳名稱'),destCode=col(row,'支援餐廳店號');if(!isDeliveryCenter(dest,destCode)){skip.nonDelivery++;continue;}let center=workCenter(dest,destCode,col(row,'所屬餐廳名稱'),col(row,'所屬餐廳店號'));let day=workDay(col(row,'支援日期'))||workDay(col(row,'日結日期'));if(!center||!day){skip.invalid++;continue;}let position=clean(col(row,'職級'))||null,valid=0;for(let n=1;n<=3;n++){let ci=clockParts(col(row,'IN'+n)),co=clockParts(col(row,'OUT'+n));if(!ci||!co)continue;let begin=taipeiTime(day,ci),end=taipeiTime(day,co);if(!begin||!end)continue;if(new Date(end)<=new Date(begin))end=new Date(new Date(end).getTime()+86400000).toISOString();let interval_key=[center,id,begin,end].join('|');output.push({interval_key,center,rider_code:id,position,started_at:begin,ended_at:end});valid++;}if(!valid)skip.noTime++;}}return {rows:output,skip};}
async function importWorkFiles(){if(role!=='op')return;let files=[...$('workFiles').files];if(!files.length){$('workStatus').textContent='請先選擇工時 Excel';return;}let btn=$('importWork');btn.disabled=true;let written=0,ignored=0;try{for(const f of files){$('workStatus').textContent='解析工時：'+f.name;let book=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});let parsed=parseWorkRows(book),unique=[...new Map(parsed.rows.map(x=>[x.interval_key,x])).values()];ignored+=parsed.skip.nonDelivery+parsed.skip.noTime+parsed.skip.invalid;for(let i=0;i<unique.length;i+=200){let chunk=unique.slice(i,i+200);let {error}=await db.from('rider_work_intervals').upsert(chunk,{onConflict:'interval_key'});if(error)throw Error(f.name+'：'+error.message);written+=chunk.length;$('workStatus').textContent=`已寫入/更新 ${written} 個工時區間；略過 ${ignored} 筆非外送或無效資料`;await new Promise(r=>setTimeout(r,0));}}$('workStatus').textContent=`完成：${written} 個工時區間（重複匯入自動更新），略過 ${ignored} 筆。正在更新共用資料。`;clearQueryCache();await load();}catch(e){$('workStatus').textContent='工時匯入中止：'+e.message+'；已寫入 '+written+' 個區間';}finally{btn.disabled=false;}}$('importWork').onclick=importWorkFiles;
async function exportExcel(){
 const btn=$('exportExcel');btn.disabled=true;let result=[];
 try{
  const c=$('center').value,from=$('from').value,to=$('to').value,g=$('group').value;
  $('exportStatus').textContent='準備分批匯出…';
  let offset=0;const batchSize=300;
  while(true){
   let q=db.from('delivery_orders').select('order_key,center,ac,restaurant,delivery_type,order_at,original_eta,assigned_at,rider_arrived_at,departed_at,delivered_at,distance_km,food_sales,rider_code,d25')
    .gte('order_at',from+'T00:00:00+08:00').lt('order_at',nextDay(to)+'T00:00:00+08:00');
   if(c!=='ALL')q=q.eq('center',c);
   if(g!=='ALL')q=q.ilike('ac','%'+g);
   const {data,error}=await q.order('order_at',{ascending:false}).order('order_key',{ascending:false}).range(offset,offset+batchSize-1);
   if(error)throw Error(error.message);
   result.push(...(data||[]));$('exportStatus').textContent=`匯出準備：${result.length.toLocaleString()} 筆`;
   if(!data||data.length<batchSize)break;
   offset+=batchSize;
   if(result.length>=150000)throw Error('單次匯出超過 15 萬筆，請縮小日期範圍');
  }
  const wb=XLSX.utils.book_new();
  const headers=['訂單編號','中心','AC','餐廳','OWN或3rd','落單時間','原預計送達','指派時間','Rider到店','外送出發','送達時間','距離(km)','Sales','Rider編號','D25'];
  const sheet=XLSX.utils.aoa_to_sheet([headers,...result.map(x=>[x.order_key,x.center,x.ac,x.restaurant,x.delivery_type,x.order_at,x.original_eta,x.assigned_at,x.rider_arrived_at,x.departed_at,x.delivered_at,x.distance_km,x.food_sales,x.rider_code,x.d25===null?'—':x.d25?'Y':'N'])]);
  XLSX.utils.book_append_sheet(wb,sheet,'DMS訂單明細');
  XLSX.writeFile(wb,`DMS_${c}_${from}_${to}.xlsx`);
  $('exportStatus').textContent=`匯出完成：${result.length.toLocaleString()} 筆；只有按下匯出才下載完整明細。`;
 }catch(e){$('exportStatus').textContent='匯出失敗：'+e.message;}finally{btn.disabled=false;}
} $('exportExcel').onclick=exportExcel;

const today=new Date(),end=new Date(today),start=new Date(today);start.setDate(start.getDate()-6);const localISO=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);$('from').value=localISO(start);$('to').value=localISO(end);initialize();
