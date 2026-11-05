const completeGap = '根据我采用的线索特征补齐整个缺口，让补件与现有断面完整接合。';

const choices = [
  {
    id: 'complete', label: '依据线索补齐', description: '按采用的特征补齐整个缺口',
    text: completeGap + '补件的形态和表面特征按已采用的线索，未指定部分延续原器物残存结构。',
  },
  {
    id: 'visible', label: '保留接缝', description: '按线索补齐，标出新旧交界',
    text: completeGap + '在新旧交界保留细接缝，便于辨认补配位置，具体形态仍按已采用的线索。',
  },
  {
    id: 'silver', label: '银片补配', description: '尝试银片材料，形态仍按线索',
    text: completeGap + '我想尝试银片补配，银片覆盖整个缺失部位。银是额外创意，与已采用的线索特征冲突时以线索为准。',
  },
];

export function repairPrompts() {
  return choices;
}
