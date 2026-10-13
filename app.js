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
document.addEventListener('click',e=>{const th=e.target.closest('table.sortable th[data-col]');if(th)sortTable(th)});
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
// Parallel paginated reads; RLS remains enforced by Supabase for every request.
async function fetchAll(table,query){
  const base=query(db.from(table).select('*',{count:'exact',head:true}));
  const {count,error:countError}=await base;
  if(countError)throw countError;
  if(!count)return [];
  if(count>100000)throw Error(`查詢 ${table} 有 ${count} 筆，超過目前前端安全上限 100,000 筆；請縮小日期或中心`);
  const pageSize=1000,pages=Math.ceil(count/pageSize),result=new Array(pages);
  let next=0,completed=0;
  async function worker(){
    while(next<pages){
      const i=next++;
      const {data,error}=await query(db.from(table).select('*').range(i*pageSize,(i+1)*pageSize-1));
      if(error)throw error;
      result[i]=data||[];
      completed++;
      if(table==='delivery_orders'&&completed%5===0)$('status').textContent=`訂單讀取中：${Math.min(completed*pageSize,count).toLocaleString()} / ${count.toLocaleString()} 筆`;
    }
  }
  await Promise.all(Array.from({length:Math.min(6,pages)},()=>worker()));
  return result.flat();
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

async function load(){
 const generation=++loadGeneration;
 try{
  $('status').textContent='查詢資料庫中…';
  const c=$('center').value,from=$('from').value,to=$('to').value;
  const centerFilter=q=>c==='ALL'?q:q.eq('center',c);
  const cacheKey=JSON.stringify([c,from,to]);
  const hit=cachedQuery(cacheKey);
  if(hit){allOrders=hit.orders;works=hit.works;actions=hit.actions;updateGroupFilter();$('status').textContent=`使用快取：${orders.length.toLocaleString()} 筆訂單（10分鐘內免重複下載）`;refreshCoverage();render();return;}
  const [newOrders,newWorks,newActions]=await Promise.all([
   fetchAll('delivery_orders',q=>centerFilter(q).gte('order_at',from+'T00:00:00+08:00').lte('order_at',to+'T23:59:59+08:00').order('order_at',{ascending:false})),
   fetchAll('rider_work_intervals',q=>centerFilter(q).lt('started_at',to+'T23:59:59+08:00').gt('ended_at',from+'T00:00:00+08:00')),
   fetchAll('improvement_actions',q=>centerFilter(q).order('created_at',{ascending:false}))
  ]);
  if(generation!==loadGeneration)return;
  allOrders=newOrders;works=newWorks;actions=newActions;
  rememberQuery(cacheKey,{orders:newOrders,works:newWorks,actions:newActions});
  updateGroupFilter();
  $('status').textContent=`讀取完成：${orders.length.toLocaleString()} 筆訂單、${works.length.toLocaleString()} 筆工時區間`;
  refreshCoverage();render();
 }catch(e){
  if(generation!==loadGeneration)return;
  orders=[];allOrders=[];works=[];actions=[];
  $('page').innerHTML='<section class="panel"><h2>資料庫讀取失敗</h2><p>請確認 Supabase 連線與資料庫權限後重試。查詢失敗不會顯示為 0。</p></section>';
  if($('coverage'))$('coverage').textContent='資料狀態：查詢失敗';
  $('status').textContent='讀取失敗：'+e.message;
 }
}
async function initialize(){let {data:{session}}=await db.auth.getSession();if(!session){$('login').style.display='block';$('app').style.display='none';return;}let {data,error}=await db.from('user_centers').select('center,role');if(error||!data?.length){$('loginMsg').textContent='此帳號尚未取得 DMS 權限：'+(error?.message||'請聯絡 OP');await db.auth.signOut();return;}membership=data;role=data.some(x=>x.role==='op')?'op':'center';$('login').style.display='none';$('app').style.display='block';$('who').textContent=session.user.email+'｜'+(role==='op'?'OP':'中心');if(role==='op'&&!tabs.includes('資料管理（OP）')){tabs.push('資料管理（OP）');buildTabs();}$('center').innerHTML=(role==='op'?[['ALL','全部中心'],...Object.entries(names).map(([a,b])=>[a,b])]:membership.map(x=>[x.center,centerName(x.center)])).map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');await load();}
$('signin').onclick=async()=>{let {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){$('loginMsg').textContent=error.message;return;}$('password').value='';await initialize();};$('logout').onclick=async()=>{clearQueryCache();await db.auth.signOut();location.reload()};$('refresh').onclick=load; $('group').onchange=()=>{applyGroup();refreshCoverage();render();};
function buildTabs(){$('tabs').innerHTML=tabs.map((x,i)=>`<button data-index="${i}" class="${i===page?'active':''}">${i+1}. ${esc(x)}</button>`).join('');}
buildTabs();
$('tabs').onclick=e=>{let b=e.target.closest('button[data-index]');if(!b)return;page=+b.dataset.index;for(let x of $('tabs').children)x.classList.toggle('active',x===b);render();};
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
function exportExcel(){try{if(!orders.length&&!works.length){$('exportStatus').textContent='目前沒有可匯出的資料，請先查詢';return;}let wb=XLSX.utils.book_new();if($('group').value!=='ALL'){$('exportStatus').textContent='Group 篩選僅適用訂單資料；Rider 工時沒有 Group 欄位，相關 TPLH 不可據此計算。';}const add=(name,headers,rows)=>{let sheet=XLSX.utils.aoa_to_sheet([headers,...rows]);sheet['!cols']=headers.map(h=>({wch:Math.max(13,Math.min(30,String(h).length*2+5))}));sheet['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:headers.length-1}})};XLSX.utils.book_append_sheet(wb,sheet,name)};
let ownOrders=orders.filter(own),thirdOrders=orders.filter(x=>!own(x)),delayOrders=ownOrders.filter(delay);let eligible=ownOrders.filter(x=>x.d25===true||x.d25===false),success=eligible.filter(x=>x.d25===true);let h=hoursTotal(works);
add('KPI總覽',['指標','數值'],[['開始日期',$('from').value],['結束日期',$('to').value],['中心',$('center').value],['Group',$('group').value],['總TC',orders.length],['OWN TC',ownOrders.length],['第三方TC',thirdOrders.length],['3rd%',thirdOrders.length/Math.max(orders.length,1)],['D25%',success.length/Math.max(eligible.length,1)],['晚指派TC',ownOrders.filter(late).length],['晚到店TC',ownOrders.filter(lateArr).length],['延遲等餐TC',delayOrders.length],['延遲平均等待時間(分)',delayOrders.length?delayOrders.reduce((s,x)=>s+wait(x),0)/delayOrders.length:null],['外送任務工時',$('group').value==='ALL'?h:null],['TPLH',$('group').value==='ALL'&&h?ownOrders.length/h:null],['併單率',mergeMetrics(orders).rate],['平均併單數（併單趟）',mergeMetrics(orders).average],['已匯入訂單最新日期',orders.length?dateOnly(orders.map(x=>x.order_at).sort().at(-1)):'無'],['已匯入工時最新日期',works.length?dateOnly(works.map(x=>x.started_at).sort().at(-1)):'無']]);
let byStore=new Map();for(let x of ownOrders){let k=x.restaurant||'未提供';if(!byStore.has(k))byStore.set(k,[]);byStore.get(k).push(x)}add('餐廳效率',['餐廳','OWN TC','晚指派TC','晚指派%','Rider晚到店TC','晚到店%','正常到店等餐>7','晚到店等餐>5','改善合計TC','改善合計%','延遲平均等待時間(分)','D25%'],[...byStore].map(([name,a])=>{let b=a.filter(delay),avg=b.length?b.reduce((s,x)=>s+wait(x),0)/b.length:null;return[name,a.length,a.filter(late).length,a.filter(late).length/a.length,a.filter(lateArr).length,a.filter(lateArr).length/a.length,a.filter(x=>!lateArr(x)&&wait(x)>7).length,a.filter(x=>lateArr(x)&&wait(x)>5).length,b.length,b.length/a.length,avg,Number.parseFloat(d25(a))/100||null]}));
let slots=new Map();for(let x of ownOrders){let k=[period(x),slot(x),x.restaurant||'未提供'].join('|');if(!slots.has(k))slots.set(k,[]);slots.get(k).push(x)}add('派單報到時段',['日期','30分鐘時段','餐廳','OWN TC','晚指派TC','晚指派%','晚到店TC','晚到店%','D25%'],[...slots].map(([k,a])=>{let [day,time,store]=k.split('|');return[day,time,store,a.length,a.filter(late).length,a.filter(late).length/a.length,a.filter(lateArr).length,a.filter(lateArr).length/a.length,Number.parseFloat(d25(a))/100||null]}));
let riderMap=new Map();for(let w of works){if(!['服務員','訓練員'].includes(w.position))continue;let a=riderMap.get(w.rider_code)||[];a.push(w);riderMap.set(w.rider_code,a)}add('Rider效率',['Rider編號','中心','職級','工時','OWN TC','TPLH','D25%','晚到店TC','延遲等餐TC'],[...riderMap].map(([id,a])=>{let hrs=a.reduce((s,x)=>s+Math.max(0,minutes(x.started_at,x.ended_at)||0)/60,0),o=ownOrders.filter(x=>x.rider_code===id);return[id,a[0].center,a[0].position,hrs,o.length,hrs?o.length/hrs:null,Number.parseFloat(d25(o))/100||null,o.filter(lateArr).length,o.filter(delay).length]}));
add('DMS訂單明細',['訂單編號','中心','AC','餐廳','OWN或3rd','落單時間','原預計送達','指派時間','Rider到店','外送出發','送達時間','指派剩餘(分)','到店剩餘(分)','等餐(分)','配送時間(分)','距離(km)','Sales','Rider編號','D25'],orders.map(x=>[x.order_key,x.center,x.ac,x.restaurant,x.delivery_type,x.order_at,x.original_eta,x.assigned_at,x.rider_arrived_at,x.departed_at,x.delivered_at,minutes(x.assigned_at,x.original_eta),minutes(x.rider_arrived_at,x.original_eta),wait(x),minutes(x.departed_at,x.delivered_at),x.distance_km,x.food_sales,x.rider_code,x.d25===null?'—':x.d25?'Y':'N']));
add('工時區間',['中心','Rider編號','職級','IN','OUT','工時'],works.map(x=>[x.center,x.rider_code,x.position,x.started_at,x.ended_at,Math.max(0,minutes(x.started_at,x.ended_at)||0)/60]));
add('改善追蹤',['中心','餐廳','問題','原因','行動','負責人','到期日','狀態'],actions.map(x=>[x.center,x.restaurant,x.title,x.cause,x.action_text,x.owner_name,x.due_date,x.status]));
XLSX.writeFile(wb,`DMS_V35_${$('center').value}_${$('from').value}_${$('to').value}.xlsx`);$('exportStatus').textContent='已產出 Excel（依目前查詢資料）';}catch(e){$('exportStatus').textContent='匯出失敗：'+e.message;}}$('exportExcel').onclick=exportExcel;

const today=new Date(),end=new Date(today),start=new Date(today);start.setDate(start.getDate()-30);const localISO=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);$('from').value=localISO(start);$('to').value=localISO(end);initialize();
