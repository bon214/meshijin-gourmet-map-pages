export const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const nameOf = store => [store.n, store.b].filter(Boolean).join(' ');
export const newest = store => [...store.posts].sort((a,b) => b[1].localeCompare(a[1]))[0];
export const newestFirst = (a,b) => newest(b)[1].localeCompare(newest(a)[1]);
export const dateLabel = date => date.replace(/^(\d+)-(\d+)-(\d+)$/, (_,y,m,d) => `${y}年${Number(m)}月${Number(d)}日`);
export const volLabel = store => newest(store)[0] ? `Vol.${newest(store)[0]}` : dateLabel(newest(store)[1]);

export function readRoute(hash, catalog) {
  const [pathname, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const cities = new Set(catalog.stores.map(s => s.city));
  const genres = params.getAll('genre').filter(g => Object.hasOwn(catalog.genres,g));
  const city = cities.has(params.get('city')) ? params.get('city') : '';
  const route = { page: ['/about','/privacy'].includes(pathname) ? pathname.slice(1) : pathname === '/map' || pathname?.startsWith('/store/') ? 'map' : 'home',
    q: (params.get('q') || '').slice(0,200), city, genres: [...new Set(genres)], parking: params.get('parking') === '1', cashless: params.get('cashless') === '1', favorites: params.get('saved') === '1',
    view: params.get('view') === 'map' ? 'map' : 'list', sort: params.get('sort') === 'near' ? 'near' : 'latest', store: null };
  if (pathname?.startsWith('/store/')) {
    try { route.store = decodeURIComponent(pathname.slice(7)); } catch { route.store = ''; }
  }
  return route;
}
export function routeHash(route) {
  const path = route.store !== null ? `/store/${encodeURIComponent(route.store)}` : `/${route.page === 'home' ? '' : route.page}`;
  const params = new URLSearchParams();
  if (route.q) params.set('q', route.q);
  if (route.city) params.set('city', route.city);
  for (const genre of [...route.genres].sort()) params.append('genre',genre);
  if (route.parking) params.set('parking','1');
  if (route.cashless) params.set('cashless','1');
  if (route.favorites) params.set('saved','1');
  if (route.view === 'map') params.set('view','map');
  if (route.sort === 'near') params.set('sort','near');
  return `#${path}${params.size ? `?${params}` : ''}`;
}
export function coordinates(store, catalog, allowIllustrative = false) {
  if (!allowIllustrative && store.coordinate_status !== 'verified') return null;
  const point = store.bld ? catalog.buildings[store.bld] : store;
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return null;
  return [point.lat,point.lng];
}
export function distanceKm(a,b) {
  const rad = v => v * Math.PI/180;
  const v = Math.sin(rad(b[0]-a[0])/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(rad(b[1]-a[1])/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));
}
export function filterStores(catalog, route, saved = new Set(), position = null) {
  const query = normalize(route.q);
  const list = catalog.stores.filter(s => {
    if (route.city && s.city !== route.city) return false;
    if (route.genres.length && !route.genres.includes(s.g)) return false;
    if (route.parking && !/専用|施設内/.test(s.pk || '')) return false;
    if (route.cashless && (!['ok','cashless'].includes(s.pt) || !/QR|キャッシュレス|PayPay|カード|現金以外/i.test(s.pay || ''))) return false;
    if (route.favorites && !saved.has(s.id)) return false;
    const hay = normalize([nameOf(s),s.addr,s.fl,s.city,s.ar,catalog.genres[s.g]?.l,catalog.buildings[s.bld]?.name,...s.posts.map(p => p[0] ? `vol.${p[0]} vol${p[0]} ${p[0]}` : '')].join(' '));
    return !query || hay.includes(query);
  }).sort(newestFirst);
  if (route.sort === 'near' && position) list.sort((a,b) => {
    const aa = coordinates(a,catalog), bb = coordinates(b,catalog);
    return (aa ? distanceKm(position,aa) : Infinity) - (bb ? distanceKm(position,bb) : Infinity) || newestFirst(a,b);
  });
  return list;
}
export function openingStatus(store, date = new Date()) {
  if (!store.sc || store.temp) return { text: '営業時間を確認してください', open: null };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{ timeZone:'Asia/Tokyo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(date).map(p=>[p.type,p.value]));
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday), minute = Number(parts.hour)*60+Number(parts.minute);
  const ranges = d => store.sc.filter(([days]) => days.includes(String(d))).flatMap(([,times]) => times.map(time => {
    const [a,b] = time.split('-').map(v=>v.split(':').reduce((h,m)=>Number(h)*60+Number(m)));
    return [a,b <= a ? b+1440 : b];
  }));
  const today = ranges(day);
  const open = ranges((day+6)%7).some(([,end]) => end>1440 && minute<end-1440) || today.some(([start,end]) => minute>=start && minute<end);
  return { text: open ? '投稿に記載された営業時間内' : '投稿に記載された営業時間外', open };
}
export function validateCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.stores) || !catalog.stores.length || !catalog.genres || !catalog.buildings || !Array.isArray(catalog.areas)) throw new Error('店舗データの形式が正しくありません。');
  const ids = new Set();
  for (const s of catalog.stores) {
    if (!/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id) || !s.n || !Object.hasOwn(catalog.genres,s.g) || !s.addr || !Array.isArray(s.posts) || !s.posts.length || (s.bld && !Object.hasOwn(catalog.buildings,s.bld))) throw new Error('店舗データに不足や重複があります。');
    ids.add(s.id);
    for (const [vol,date,code] of s.posts) if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[\w-]+$/.test(code) || (vol && !/^\d+$/.test(vol))) throw new Error('紹介投稿の形式が正しくありません。');
    if (s.ig && !/^[a-zA-Z0-9._]+$/.test(s.ig)) throw new Error('公式アカウントの形式が正しくありません。');
    if (s.sc && (!Array.isArray(s.sc) || s.sc.some(row => !Array.isArray(row) || !/^[0-6]+$/.test(row[0]) || !Array.isArray(row[1]) || row[1].some(time => !/^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-7]):[0-5]\d$/.test(time))))) throw new Error('営業時間の形式が正しくありません。');
  }
  return catalog;
}
