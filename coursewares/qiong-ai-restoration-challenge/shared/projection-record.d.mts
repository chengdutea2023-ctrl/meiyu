export type RestorationProjection = {
  proposalId:string;caseName:string;proposalText:string;resultImage:string;planImage:string;
  resultRegion:number[]|null;featureSelections:unknown[];creativeText:string;featureCheck:Record<string,unknown>;
  clues:Array<{clueId:string;label:string;feature:string;source:string;image:string}>;mocked:boolean;
};
export function isRestorationProjectionRecord(record:unknown):boolean;
export function isRestorationPackageArtifact(artifact:unknown,record:unknown):boolean;
export function readRestorationPackage(bytes:Uint8Array,expectedId:string):RestorationProjection;
export function loadRestorationPackage(artifact:unknown,record:unknown,options?:{baseUrl?:string;fetcher?:typeof fetch}):Promise<RestorationProjection>;
export function restorationProjectionModel(record:unknown,baseUrl:string):RestorationProjection & {student:string;readFailed:boolean};
export function buildRestorationProjectionHtml(record:unknown,baseUrl:string):string;
export function needsRestorationPackage(record:unknown):boolean;
export function hydrateRestorationRecord<T>(record:T,options?:{baseUrl?:string;fetcher?:typeof fetch}):Promise<T>;
