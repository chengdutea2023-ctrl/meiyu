import {showcasePage,SHOWCASE_VERSION,resultRegion} from './showcase.mjs';
import { unzipSync } from 'fflate';
const VERSION = 'qiong-restoration-projection-v1';
const MAX_BYTES = 35 * 1024 * 1024, MAX_IMAGE = 8 * 1024 * 1024;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const text = (v, max = 1600) => typeof v === 'string' ? v.slice(0, max) : '';
const list = (v) => Array.isArray(v) ? v : [];
function safeUrl(value, base) {
    try {
        const raw = text(value, 5000), url = new URL(raw, base);
        return raw && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    }
    catch {
        return '';
    }
}
function platformUrl(value, base) {
    const safe = safeUrl(value, base);
    if (!safe)
        return '';
    const url = new URL(safe);
    return /^\/api\/v1\/course-runtime\/artifacts\/[a-zA-Z0-9_-]{16,200}\/file$/.test(url.pathname) && !url.search && !url.hash ? new URL(url.pathname, base).href : safe;
}
function canonicalArtifacts(record) {
    const s = object(record.summary), id = text(s.proposalId, 80);
    const refs = list(s.artifacts).map(object);
    // Only display artifacts referenced by this submitted proposal, never a later unfinished upload.
    return (record.artifacts || []).filter(a => refs.some(r => r.url === a.url && r.kind === a.kind) && (!id || object(a.metadata).proposalId === id));
}
export function isRestorationProjectionRecord(record) {
    const c=object(record.courseware);
    return c.slug === 'qiong-ai-restoration-challenge' ||
        record.course?.slug === 'qiong-ai-inquiry' && c.slug === 'courseware-is9nlxd12' ||
        text(c.title).replace(/\s/g, '') === '邛窑AI修复挑战';
}
export function isRestorationPackageArtifact(a, record) {
    return isRestorationProjectionRecord(record) && a.kind === 'evidence-package' &&
        ['application/zip', 'application/octet-stream'].includes(a.mimeType) &&
        (a.originalFileName || a.fileName) === '我的线索与复原方案.zip' && canonicalArtifacts(record).some(x => x.url === a.url && object(x.metadata).proposalId === object(a.metadata).proposalId);
}
function png(bytes) {
    if (!bytes || bytes.length > MAX_IMAGE || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
        return '';
    let binary = '';
    for (let n = 0; n < bytes.length; n += 16384)
        binary += String.fromCharCode(...bytes.subarray(n, n + 16384));
    return 'data:image/png;base64,' + btoa(binary);
}
export function readRestorationPackage(bytes, expectedId) {
    if (bytes.byteLength > MAX_BYTES)
        throw Error('资料包过大');
    let count = 0, total = 0;
    const files = unzipSync(bytes, { filter: file => {
            count++;
            total += file.originalSize;
            if (count > 80 || total > 100 * 1024 * 1024 || file.originalSize > 12 * 1024 * 1024 || /(^|\/)\.\.(\/|$)/.test(file.name))
                throw Error('资料包超出读取限制');
            return file.name === '复原方案.json' || /^images\/[a-zA-Z0-9-]{10,80}\.png$/.test(file.name) || ['results/AI复原候选.png','results/计划修复位置.png'].includes(file.name);
        } });
    const json = files['复原方案.json'];
    if (!json || json.length > 1024 * 1024)
        throw Error('未找到三步版方案');
    const p = object(JSON.parse(new TextDecoder().decode(json))), snapshot = object(p.snapshot);
    if (p.workflowVersion !== 2 || typeof p.id !== 'string' || !expectedId || p.id !== expectedId ||
        !Array.isArray(snapshot.evidence) || snapshot.evidence.length < 1 || snapshot.evidence.length > 3)
        throw Error('方案与本次提交不匹配');
    const clues = snapshot.evidence.map((value, i) => {
        const a = object(value), id = text(a.id, 80);
        if (!/^[a-zA-Z0-9-]{10,80}$/.test(id))
            throw Error('线索编号无效');
        return { clueId:id,label: text(a.label, 100) || '线索' + (i + 1), feature: text(a.feature, 1600), source: text(a.source, 1600), image: png(files['images/' + id + '.png']) };
    });
    const result = list(p.results).map(object).find(r => r.state === 'succeeded' && text(r.fileId));
    return { caseName: text(snapshot.caseName, 100) || '四系罐', proposalId: p.id, proposalText: text(snapshot.proposalText, 500), resultImage: result ? png(files['results/AI复原候选.png']) : '',planImage:png(files['results/计划修复位置.png']),resultRegion:resultRegion(snapshot),featureSelections:list(snapshot.featureSelections),creativeText:text(snapshot.creativeText,120),featureCheck:object(p.featureCheck), clues, mocked: p.mocked === true };
}
export async function loadRestorationPackage(a, record,options={}) {
    if (!isRestorationPackageArtifact(a, record))
        throw Error('不是本次修复方案资料包');
    const url = platformUrl(a.url, options.baseUrl||window.location.href);
    if (!url)
        throw Error('资料地址无效');
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 10000);
    try {
        const response = await (options.fetcher||fetch)(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
        if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body)
            throw Error('资料包无法读取');
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        while (true) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            size += chunk.value.byteLength;
            if (size > MAX_BYTES) {
                await reader.cancel();
                throw Error('资料包过大');
            }
            chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        return readRestorationPackage(bytes, text(object(a.metadata).proposalId, 80));
    }
    finally {
        window.clearTimeout(timer);
    }
}
export function restorationProjectionModel(record, baseUrl) {
    const s = object(record.summary), artifacts = canonicalArtifacts(record), id = text(s.proposalId, 80);
    const saved = object(s.restorationProjection);
    const result = artifacts.find(a => a.kind === 'restoration-result' && a.mimeType === 'image/png' && object(a.metadata).proposalId === id);
    const plan = artifacts.find(a => a.kind === 'restoration-plan' && a.mimeType === 'image/png' && object(a.metadata).proposalId === id);
    const clueArtifacts = artifacts.filter(a => a.kind === 'restoration-clue' && a.mimeType === 'image/png' && object(a.metadata).proposalId === id).slice(0, 3);
    const fresh = [VERSION, SHOWCASE_VERSION].includes(saved.version) && saved.proposalId === id;
    const hydrated = artifacts.filter(a => isRestorationPackageArtifact(a, record)).map(a => object(object(a.metadata).restorationProjection)).find(p => p.proposalId === id || !id && typeof p.proposalId === 'string');
    const legacy = object(hydrated);
    const clues = fresh ? list(saved.clues).slice(0, 3).map((value, i) => {
        const a = object(value), own = clueArtifacts.find(x => x.url === a.imageUrl);
        return {clueId:text(object(object(own?.metadata).restorationImage).clueId||a.clueId,80),label: text(a.label, 100) || '线索' + (i + 1), feature: text(a.feature, 1600), source: text(a.source, 1600), image: own ? platformUrl(own.url, baseUrl) : '' };
    }) : list(legacy.clues).slice(0, 3).map((value, i) => {
        const a = object(value), image = text(a.image, MAX_IMAGE * 1.4);
        return {clueId:text(a.clueId,80),label: text(a.label, 100) || '线索' + (i + 1), feature: text(a.feature, 1600), source: text(a.source, 1600), image: /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) ? image : '' };
    });
    const legacyImage = text(legacy.resultImage, MAX_IMAGE * 1.4);
    const resultImage = fresh ? (result && saved.resultUrl === result.url ? platformUrl(result.url, baseUrl) : '') : /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(legacyImage) ? legacyImage : '';
    const links = artifacts.filter(a => a.kind === 'final-work' || a.kind === 'evidence-package').map(a => ({ title: a.originalFileName || a.fileName, url: safeUrl(a.url, baseUrl) })).filter(a => a.url);
    const readFailed = artifacts.some(a => object(a.metadata).restorationProjectionError);
    const details=list(s.featureSelections).length?s:legacy;
    return {proposalId:id||text(legacy.proposalId,80),caseName: text(fresh ? saved.caseName : legacy.caseName, 100) || text(s.caseName, 100) || '四系罐', student: text(record.student?.displayName || '学生作品', 160), proposalText: text(fresh ? saved.proposalText : legacy.proposalText, 500) || text(s.brief, 500), resultImage,planImage:fresh&&plan&&saved.planUrl===plan.url?platformUrl(plan.url,baseUrl):text(legacy.planImage,MAX_IMAGE*1.4),resultRegion:saved.resultRegion||legacy.resultRegion||null,featureSelections:list(details.featureSelections),featureCheck:object(details.featureCheck),creativeText:text(details.creativeText,120),score:record.score,scoreText:text(s.scoreText,100), clues, links, readFailed, mocked: fresh ? saved.mocked === true : legacy.mocked === true };
}

export function needsRestorationPackage(record){const s=object(record.summary),p=object(s.restorationProjection);return isRestorationProjectionRecord(record)&&p.version!==SHOWCASE_VERSION;}
export async function hydrateRestorationRecord(record,options={}){
  if(!needsRestorationPackage(record))return record;
  const artifacts=await Promise.all((record.artifacts||[]).map(async a=>{
    if(!isRestorationPackageArtifact(a,record))return a;
    try{return {...a,metadata:{...object(a.metadata),restorationProjection:await loadRestorationPackage(a,record,options)}};}
    catch{return {...a,metadata:{...object(a.metadata),restorationProjectionError:true}};}
  }));return {...record,artifacts};
}

export function buildRestorationProjectionHtml(record,baseUrl){return showcasePage(restorationProjectionModel(record,baseUrl));}
