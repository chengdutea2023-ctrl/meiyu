// Stable IDs and files preserve the identity of previously saved proposals.
const source = title => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`;
const common = { photographer:'Kcx36', license:'CC BY-SA 4.0', licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/', institution:'成都隋唐窑址博物馆（按照片来源说明）' };
export const DEFAULT_CASE_ID = 'four-ear-jar';
export const RESTORATION_CASES = [
  { ...common, id:DEFAULT_CASE_ID, type:'罐', name:'唐·邛窑釉下绿彩瓷四系罐', shortName:'四系罐', era:'唐代', damagedFile:'case-damaged.png', maskFile:'case-mask.png', damage:'口沿缺失',
    sourcePage:source('成都隋唐窑址博物馆-唐-邛窑-釉下绿彩瓷四系罐.jpg'),
    hint:'观察罐口、短颈和肩部的连接。', example:'我想把缺口补成向外翻的圆口，因为线索1中的同类罐也是这种口沿。' },
  { ...common, id:'brown-ewer', type:'壶', name:'唐·邛窑釉下褐彩瓷执壶', shortName:'褐彩执壶', era:'唐代', damagedFile:'case-ewer-damaged.png', maskFile:'case-ewer-mask.png', damage:'壶流缺失',
    sourcePage:source('成都隋唐窑址博物馆-唐-邛窑-釉下褐彩瓷执壶.jpg'),
    hint:'观察壶流的方向、开口和与壶身的连接。', example:'我想把壶流补成短而向上翘的形状，因为线索1中的同类执壶有这样的壶流。' },
  { ...common, id:'song-bowl', type:'碗', name:'宋·邛窑瓷碗', shortName:'邛窑瓷碗', era:'宋代', damagedFile:'case-bowl-damaged.png', maskFile:'case-bowl-mask.png', damage:'碗沿缺失',
    sourcePage:source('成都隋唐窑址博物馆-宋-邛窑-瓷碗4.jpg'),
    hint:'观察碗沿的弧度、厚度和碗腹的连接。', example:'我想沿着现有弧度补齐碗沿，因为线索1中的同类碗口沿薄而向外展开。' },
];
export const restorationCase = (id = DEFAULT_CASE_ID) => RESTORATION_CASES.find(item => item.id === id);
export const proposalCase = proposal => restorationCase(proposal?.snapshot?.caseId) || restorationCase();
export const caseImage = item => `./assets/${item.damagedFile}`;
export const caseMask = item => `./assets/${item.maskFile}`;
