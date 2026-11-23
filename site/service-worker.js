const offlineVersion = "95e85f353691d823bdbc5d937acbc8c2560523b28ab45a8de7561107ada3efe5";
const offlineFiles = ["assets/dragon-D_svfr6J.webp","assets/dwarf1-gdRWQma9.webp","assets/dwarf2-COLHq26O.webp","assets/dwarf3-DfJKmSfD.webp","assets/index-B3J7TIFu.js","assets/index-BuDQN38S.css","assets/index-legacy-BvYUvTQ7.js","assets/polyfills-legacy-B4Uk9VY4.js","favicon.webp","images/dragon/attack3.webp","images/dragon/defense.webp","images/dragon/dragonback.webp","images/dragon/fire1.webp","images/dragon/fire2.webp","images/dragon/fly.webp","images/dragon/move1.webp","images/dragon/move1attack2.webp","images/dragon/move1defense.webp","images/dragon/move2.webp","images/dragon/move2attack1.webp","images/dragon/move2attack2.webp","images/dwarves/attack1.webp","images/dwarves/attack1crossbow.webp","images/dwarves/attack2.webp","images/dwarves/attackdouble.webp","images/dwarves/crossbow.webp","images/dwarves/defense.webp","images/dwarves/dwarvesback.webp","images/dwarves/move1attack1.webp","images/dwarves/move1defense.webp","images/dwarves/move2crossbow.webp","images/dwarves/move2defense.webp","images/dwarves/move2dwarves.webp","images/dwarves/movedoublecrossbow.webp","images/dwarves/movedoubledefense.webp","images/dwarves/movedoublenet.webp","images/dwarves/net.webp","images/dwarves/netdefense.webp","index.html","manifest.webmanifest","rulebook/drako-en/page-01.webp","rulebook/drako-en/page-02.webp","rulebook/drako-en/page-03.webp","rulebook/drako-en/page-04.webp","rulebook/drako-en/page-05.webp","rulebook/drako-en/page-06.webp","rulebook/drako-en/page-07.webp","rulebook/drako-en/page-08.webp","rulebook/drako-en/page-09.webp","rulebook/drako-en/page-10.webp","rulebook/drako-en/page-11.webp","rulebook/drako-en/page-12.webp","rulebook/drako-pl/page-01.webp","rulebook/drako-pl/page-02.webp","rulebook/drako-pl/page-03.webp","rulebook/drako-pl/page-04.webp","rulebook/drako-pl/page-05.webp","rulebook/drako-pl/page-06.webp","rulebook/drako-pl/page-07.webp","rulebook/drako-pl/page-08.webp","rulebook/drako-pl/page-09.webp","rulebook/drako-pl/page-10.webp","rulebook/drako-pl/page-11.webp","rulebook/drako-pl/page-12.webp"];

/* global offlineFiles, offlineVersion */
const scope = new URL(self.registration.scope);
const cachePrefix = `dragon-dwarves:${encodeURIComponent(scope.href)}:`;
const cacheName = cachePrefix + offlineVersion;
const index = new URL('index.html', scope);
const rulebook = new URL('rulebook/', scope).href;
const files = offlineFiles.map(file => new URL(file, scope).href);
const gameFiles = files.filter(url => !url.startsWith(rulebook));
const rulebookFiles = new Set(files.filter(url => url.startsWith(rulebook)));

let operations = Promise.resolve();

function serialize(operation) {
    const next = operations.then(operation);
    operations = next.catch(() => {});
    return next;
}

async function gameCaches() {
    return (await caches.keys()).filter(name => name.startsWith(cachePrefix));
}

async function savedCache() {
    if (await caches.match(index.href, { cacheName })) return cacheName;
    for (const name of await gameCaches()) {
        if (await caches.match(index.href, { cacheName: name })) return name;
    }
    return null;
}

async function download() {
    if (await caches.match(index.href, { cacheName })) return;
    const cache = await caches.open(cacheName);
    try {
        await cache.addAll(gameFiles.map(url => new Request(url, { cache: 'reload' })));
    } catch (error) {
        await caches.delete(cacheName);
        throw error;
    }
    const old = (await gameCaches()).filter(name => name !== cacheName);
    await Promise.all(old.map(name => caches.delete(name)));
}

async function activate() {
    if (await savedCache()) {
        // Keep the previous offline copy if the connection drops during an update.
        await download().catch(() => {});
    }
    await self.clients.claim();
}

async function manage(command) {
    if (command === 'download') await download();
    if (command === 'remove') {
        await Promise.all((await gameCaches()).map(name => caches.delete(name)));
    }
    const saved = await savedCache();
    if (!saved) return 'missing';
    return saved === cacheName ? 'ready' : 'update';
}

async function serve(url, request, navigation) {
    const saved = await savedCache();
    const cached = saved && await caches.match(url, { cacheName: saved });
    if (cached && (!navigation || saved === cacheName)) return cached;

    try {
        const response = await fetch(request);
        if (cached && !response.ok) return cached;
        if (saved === cacheName && rulebookFiles.has(url) && response.status === 200) {
            await serialize(async () => {
                if (!await caches.match(index.href, { cacheName })) return;
                const cache = await caches.open(cacheName);
                await cache.put(url, response.clone());
            }).catch(() => {});
        }
        return response;
    } catch (error) {
        if (cached) return cached;
        throw error;
    }
}

self.addEventListener('activate', event => event.waitUntil(activate()));
self.addEventListener('message', event => {
    const port = event.ports[0];
    const command = event.data?.offline;
    if (!port || !['status', 'download', 'remove'].includes(command)) return;
    event.waitUntil(serialize(() => manage(command))
        .then(status => port.postMessage({ status }), error => port.postMessage({ error: error.message })));
});
self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || !request.url.startsWith(scope.href)) return;
    const url = new URL(request.url);
    const navigation = request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === index.pathname);
    if (request.mode === 'navigate' && !navigation) return;
    event.respondWith(serve(navigation ? index.href : url.href, request, navigation));
});
