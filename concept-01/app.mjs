import { escapeHTML as e, nameOf, readRoute, routeHash, coordinates, filterStores, validateCatalog } from './model.mjs';
import { homeView, exploreView, resultRow, detailView, informationView, genreStyle } from './views.mjs';

const main=document.getElementById('main'), dialog=document.getElementById('store-dialog'), content=document.getElementById('store-content');
const storageKey='meshijin:concept-01:favorites';
let catalog, route, preview=true, saved=new Set(), position=null, map=null, markerLayer=null, me=null, lastPage=null, lastHash=null, lastCity=null, lastStore=null, toastTimer, searchTimer, opener=null, geoPending=false;
try { const stored=JSON.parse(localStorage.getItem(storageKey)||'[]'); if(Array.isArray(stored)) saved=new Set(stored.filter(id=>typeof id==='string')); } catch { /* Browser storage can be unavailable. */ }
const link=patch=>routeHash({...route,...patch});
function toast(message){const box=document.getElementById('toast');box.textContent=message;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{box.hidden=true;},4500);}
function navigate(patch,{replace=false}={}){clearTimeout(searchTimer);history[replace?'replaceState':'pushState'](null,'',link(patch));lastHash=null;handleRoute();}
function closeStore(){navigate({store:null},{replace:true});}
function filtered(){return filterStores(catalog,route,saved,position);}
function selectedHash(id){return link({page:'map',store:id});}
function syncFilters(){
  const form=document.getElementById('filters');if(!form)return;
  form.elements.q.value=route.q;form.elements.city.value=route.city;form.elements.sort.value=route.sort;
  for(const input of form.querySelectorAll('input[type=checkbox]'))input.checked=input.name==='genre'?route.genres.includes(input.value):input.name==='parking'?route.parking:input.name==='cashless'?route.cashless:route.favorites;
}
function updateResults(){
  const stores=filtered();
  document.getElementById('result-count').innerHTML=`<span>${stores.length}</span>店${route.city?` / ${e(route.city)}`:''}`;
  document.getElementById('results-list').innerHTML=stores.length?stores.map(s=>resultRow(s,catalog,saved,preview,selectedHash(s.id))).join(''):`<div class="empty-state"><h2>${route.favorites?'保存したお店がありません':'条件に合うお店がありません'}</h2><p>${route.favorites?'お店のハートボタンを押すと、お気に入りに保存できます。':preview?'このプレビューの収録店は18店舗です。検索文字や絞り込み条件を変更してください。':'検索文字や絞り込み条件を変更してください。'}</p><button class="button" data-action="reset">すべてのお店を見る</button></div>`;
  document.getElementById('results-layout').dataset.view=route.view;
  for(const b of document.querySelectorAll('.view-tabs button'))b.setAttribute('aria-pressed',String(b.dataset.action===`view-${route.view}`));
  if(map){drawMarkers(stores,lastCity!==route.city);requestAnimationFrame(()=>map?.invalidateSize());}
  lastCity=route.city;
}
function removeMap(){if(map){map.remove();map=null;markerLayer=null;me=null;}}
function render(){
  const newPage=route.page!==lastPage;
  if(newPage){removeMap();lastPage=route.page;if(route.page==='home')main.innerHTML=homeView(catalog,saved,preview,link);else if(route.page==='map')main.innerHTML=exploreView(catalog,route);else main.innerHTML=informationView(route.page,preview);window.scrollTo(0,0);}
  if(route.page==='map'){syncFilters();updateResults();}
  const store=route.store!==null?catalog.stores.find(s=>s.id===route.store):null;
  if(route.store!==null){
    content.innerHTML=store?detailView(store,catalog,saved,preview,link):'<div class="detail-body"><h1 id="store-title">お店が見つかりません</h1><p>掲載内容が変わった可能性があります。一覧からお店を探してください。</p><button class="button" data-action="close">一覧に戻る</button></div>';
    if(!dialog.open){opener=document.activeElement;dialog.showModal();document.body.style.overflow='hidden';}
    if(lastStore!==route.store){dialog.scrollTop=0;dialog.querySelector('.dialog-close').focus();const point=store&&coordinates(store,catalog,preview);if(map&&point)map.setView(point,17);}
    document.title=store?`${nameOf(store)}｜飯人グルメマップ`:'お店が見つかりません｜飯人グルメマップ';
  }else{
    if(dialog.open){dialog.close();document.body.style.overflow='';if(opener?.isConnected)opener.focus();else main.focus({preventScroll:true});}
    document.title=route.page==='home'?'飯人グルメマップ｜長崎の紹介店を探す':`${route.page==='map'?'お店を探す':route.page==='about'?'掲載情報について':'このサイトの利用について'}｜飯人グルメマップ`;
  }
  lastStore=route.store;
  if(newPage && route.page!=='home' && route.store===null)main.focus({preventScroll:true});
}
function handleRoute(){if(!catalog||location.hash===lastHash)return;lastHash=location.hash;route=readRoute(location.hash,catalog);render();}
function formPatch(){const data=new FormData(document.getElementById('filters'));return {q:String(data.get('q')||''),city:String(data.get('city')||''),genres:data.getAll('genre'),parking:data.has('parking'),cashless:data.has('cashless'),favorites:data.has('saved'),sort:String(data.get('sort')||'latest'),store:null};}
function mapAlert(message){const box=document.getElementById('map-alert');if(box){box.textContent=message;box.hidden=false;}}
function loadMap(){
  if(map){map.invalidateSize();return;}
  const L=window.L,el=document.getElementById('map');if(!el)return;
  if(!L){const fallback=document.getElementById('map-fallback');fallback.querySelector('h2').textContent='地図を読み込めませんでした';fallback.querySelector('p').textContent='一覧からお店の詳細をご覧いただけます。ページを再読み込みして、もう一度お試しください。';return;}
  document.getElementById('map-fallback').hidden=true;document.getElementById('map-tools').hidden=false;
  map=L.map(el,{zoomControl:false,minZoom:7,maxZoom:18,scrollWheelZoom:false}).setView([32.7555,129.8745],14);
  const tileURL=catalog.map?.tile_url || 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
  // Ordinary browser caching and Referer headers remain enabled. No prefetch or offline tiles.
  const tiles=L.tileLayer(tileURL,{maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'}).addTo(map);
  map.attributionControl.setPrefix(false);tiles.on('tileerror',()=>mapAlert('背景地図を読み込めませんでした。一覧からお店を探せます。'));
  markerLayer=L.layerGroup().addTo(map);drawMarkers(filtered(),true);
  document.getElementById('map-note').textContent=preview?'ピンは確認前の仮位置です。正しい住所は、店舗詳細と店舗公式でご確認ください。':'位置を確認済みのお店を表示しています。位置を確認中のお店は、一覧から探せます。';
  if(position)showPosition();requestAnimationFrame(()=>map?.invalidateSize());
}
function drawMarkers(stores,fit=false){
  if(!map||!markerLayer)return;const L=window.L;markerLayer.clearLayers();const groups=new Map(), points=[];
  for(const store of stores){const point=coordinates(store,catalog,preview);if(!point)continue;points.push(point);if(store.bld){const items=groups.get(store.bld)||[];items.push(store);groups.set(store.bld,items);continue;}
    const marker=L.marker(point,{keyboard:true,title:nameOf(store),alt:nameOf(store),icon:L.divIcon({className:'',html:`<div class="map-pin" style="${genreStyle(store.g)}">${e(catalog.genres[store.g].i)}</div>`,iconSize:[44,44],iconAnchor:[22,22]})});marker.on('click',()=>navigate({store:store.id}));markerLayer.addLayer(marker);
  }
  for(const [key,items] of groups){const building=catalog.buildings[key],point=coordinates(items[0],catalog,preview);const marker=L.marker(point,{keyboard:true,title:`${building.name}の${items.length}店`,icon:L.divIcon({className:'',html:`<div class="building-pin"><strong>${items.length}</strong><span>${e(building.name)}<br>施設内のお店を見る</span></div>`,iconSize:[200,48],iconAnchor:[100,24]})});marker.on('click',()=>{navigate({q:building.name,city:'',store:null,view:'list'});map?.setView(point,17);});markerLayer.addLayer(marker);}
  if(fit&&points.length)map.fitBounds(L.latLngBounds(points).pad(.16),{maxZoom:16});
}
function showPosition(){if(!map||!position)return;const L=window.L;me?.remove();me=L.circleMarker(position,{radius:8,color:'#fff',weight:3,fillColor:'#376cbb',fillOpacity:1}).addTo(map);map.setView(position,15);}
function locate(){
  if(geoPending)return;if(!navigator.geolocation){toast('現在地を取得できません。エリアを選んでお店を探してください。');return;}
  geoPending=true;toast('現在地を確認しています。');
  navigator.geolocation.getCurrentPosition(p=>{geoPending=false;position=[p.coords.latitude,p.coords.longitude];navigate({page:'map',store:null,sort:'near',view:'map'});loadMap();showPosition();if(!catalog.stores.some(s=>coordinates(s,catalog)))toast('現在地を表示しました。お店の位置は確認前のため、近い順には並べ替えていません。');else toast('位置を確認済みのお店を、近い順に並べました。');},error=>{geoPending=false;toast(error.code===1?'現在地の利用が許可されていません。エリアから探せます。':'現在地を取得できませんでした。エリアから探してください。');},{timeout:10000,maximumAge:60000,enableHighAccuracy:false});
}
async function share(id){
  const store=catalog.stores.find(s=>s.id===id);if(!store)return;const url=new URL(location.href);url.hash=selectedHash(id);
  try{if(navigator.share){await navigator.share({title:`${nameOf(store)}｜飯人グルメマップ`,url:url.href});return;}if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(url.href);toast('お店のリンクをコピーしました。');return;}}catch(error){if(error.name==='AbortError')return;}
  // A selectable URL also works when clipboard permission or Web Share is unavailable.
  const existing=document.getElementById('share-fallback');existing?.remove();const box=document.createElement('div');box.id='share-fallback';box.className='notice';const label=document.createElement('label');label.textContent='次のリンクをコピーして共有してください。';const input=document.createElement('input');input.type='text';input.readOnly=true;input.value=url.href;input.style.width='100%';input.style.fontSize='16px';label.append(input);box.append(label);content.querySelector('.detail-actions').after(box);input.focus();input.select();
}
function toggleSaved(id){if(!catalog.stores.some(s=>s.id===id))return;if(saved.has(id))saved.delete(id);else saved.add(id);let persisted=true;try{localStorage.setItem(storageKey,JSON.stringify([...saved]));}catch{persisted=false;}
  const focused=document.activeElement;const actionId=focused?.dataset.id;
  if(route.page==='home'){main.innerHTML=homeView(catalog,saved,preview,link);}else updateResults();
  for(const b of dialog.querySelectorAll('[data-action=save]')){const on=saved.has(id);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',`${nameOf(catalog.stores.find(s=>s.id===id))}を${on?'お気に入りから外す':'お気に入りに保存'}`);b.firstElementChild.textContent=on?'♥':'♡';}
  if(actionId&&!focused?.isConnected)[...document.querySelectorAll('[data-action=save]')].find(b=>b.dataset.id===actionId)?.focus({preventScroll:true});
  toast(persisted?(saved.has(id)?'お気に入りに保存しました。':'お気に入りから外しました。'):'ブラウザーに保存できません。この画面を開いている間だけ記録します。');
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  if(button.dataset.action==='retry'){loadCatalog();return;}
  if(!catalog)return;
  const action=button.dataset.action;
  if(action==='close')closeStore();else if(action==='save')toggleSaved(button.dataset.id);else if(action==='share')share(button.dataset.id);else if(action==='locate')locate();else if(action==='load-map')loadMap();else if(action==='zoom-in')map?.zoomIn();else if(action==='zoom-out')map?.zoomOut();else if(action==='view-map')navigate({view:'map'});else if(action==='view-list')navigate({view:'list'});else if(action==='reset')navigate({q:'',city:'',genres:[],parking:false,cashless:false,favorites:false,sort:'latest'});else if(action==='clear-search'){navigate({q:''},{replace:true});document.getElementById('search')?.focus();}else if(action==='retry')loadCatalog();
});
document.addEventListener('submit',event=>{if(event.target.id==='filters'){event.preventDefault();navigate(formPatch());}});
document.addEventListener('input',event=>{if(event.target.id==='search'){clearTimeout(searchTimer);searchTimer=setTimeout(()=>navigate(formPatch(),{replace:true}),180);}});
document.addEventListener('change',event=>{if(!event.target.closest('#filters')||event.target.id==='search')return;const patch=formPatch();if(patch.sort==='near'&&!position){patch.sort='latest';navigate(patch);locate();}else navigate(patch);});
dialog.addEventListener('cancel',event=>{event.preventDefault();closeStore();});
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeStore();});
window.addEventListener('hashchange',handleRoute);window.addEventListener('popstate',handleRoute);
document.addEventListener('error',event=>{const img=event.target;if(img instanceof HTMLImageElement){img.style.display='none';if(!img.parentElement.querySelector('.image-error')){const note=document.createElement('span');note.className='image-error muted';note.textContent='画像を読み込めませんでした';img.parentElement.append(note);}}},true);
async function loadCatalog(){
  main.innerHTML='<div class="loading wrap" role="status">お店の情報を読み込んでいます。</div>';
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),12000);
  try{const response=await fetch('/meshijin-gourmet-map-pages/concept-01/data/catalog.json',{signal:abort.signal});if(!response.ok)throw new Error('読み込みに失敗しました。');catalog=validateCatalog(await response.json());saved=new Set([...saved].filter(id=>catalog.stores.some(s=>s.id===id)));preview=catalog.purpose!=='public';document.getElementById('preview-note').hidden=!preview;
    // Preserve the store links shared by the earlier prototype.
    const oldId=new URL(location.href).searchParams.get('store');if(oldId&&!location.hash){const url=new URL(location.href);url.searchParams.delete('store');url.hash=`/store/${encodeURIComponent(oldId)}`;history.replaceState(null,'',url);}
    lastPage=null;lastHash=null;handleRoute();
  }catch{main.innerHTML='<section class="loading wrap"><h1>お店の情報を読み込めませんでした</h1><p>通信環境を確認し、もう一度お試しください。</p><button class="button primary" data-action="retry">もう一度読み込む</button><p><a href="https://www.instagram.com/meshijin_food/" target="_blank" rel="noopener noreferrer">飯人のInstagramで紹介店を見る</a></p></section>';}finally{clearTimeout(timer);}
}
loadCatalog();
