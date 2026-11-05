const shapes = {
  'four-ear-jar': '补齐罐口和短颈缺掉的整片器壁。口沿顺着两端的弧度接成完整一圈，厚度与原口沿一致，短颈和两侧断面自然接合。',
  'brown-ewer': '从右侧断面补出整段壶流，壶流是连续的中空管，与壶身接缝齐平，末端留出水口。长度、弯度和方向按采用的线索。',
  'song-bowl': '补齐缺失的整片碗壁和碗沿。补片沿碗壁曲面弯曲，上缘与两端原碗沿齐平并接成连续圆弧，厚度贴近原瓷壁。',
};

const choices = [
  { id: 'complete', label: '按原样补齐', description: '补齐整个缺口，延续原有釉面', material: '补件沿用相邻釉面的颜色、光泽和纹理，完整接合。' },
  { id: 'visible', label: '保留补配痕迹', description: '轮廓补齐，能看出新旧交界', material: '用略浅的哑光陶片补齐，在新旧交界留一条细接缝。' },
  { id: 'silver', label: '用银片补配', description: '用完整银片补齐缺失部分', material: '用一整片银片成形，银片覆盖整个缺失部位，贴合断面并呈现银色光泽。' },
];

export function repairPrompts(caseId) {
  return choices.map(({ material, ...choice }) => ({ ...choice, text: shapes[caseId] + material }));
}
