import type { ExerciseDefinition, HabitDefinition } from './domain'

export const HABIT_GROUPS = ['每日习惯', '日常运动', '其他活动'] as const
export type HabitGroup = typeof HABIT_GROUPS[number]
export type RecordingMode = 'single' | 'captures' | 'duration'
export type HabitFrequency = 'daily' | 'weekly' | 'occasional'
export const FREQUENCY_LABELS: Record<HabitFrequency, string> = { daily: '每天', weekly: '每周', occasional: '偶尔' }
export const MODE_LABELS: Record<RecordingMode, string> = { single: '单次完成', captures: '多次记录', duration: '时长记录' }

// Translate only exact shipped text on built-in definitions. Custom text is never replaced.
const TEXT: Record<string, string> = {
  'Mindful eating': '正念饮食', 'Early sleep': '早睡', 'Foot soak': '泡脚', 'Moxibustion': '艾灸',
  'Walking': '散步', 'Ginger drink': '姜饮', 'Routine A': '训练组合 A', 'Routine B': '训练组合 B',
  'Sit-to-stand from high chair': '高椅坐站', 'Glute bridge': '臀桥', 'Chest-supported dumbbell row': '胸托哑铃划船',
  'Wall push-up': '墙壁俯卧撑', 'Dead bug': '死虫式', 'Dumbbell Romanian deadlift': '哑铃罗马尼亚硬拉',
  'Side-lying clam': '侧卧蚌式', 'Single-arm dumbbell floor press': '单臂哑铃地板卧推', 'Band pull-apart': '弹力带拉开', 'Bird-dog': '鸟狗式',
  'Lower body': '下肢', 'Upper body': '上肢', 'Core': '核心', 'Pelvic-floor-friendly': '盆底友好',
  'Meal rhythm': '饮食', 'Rest': '休息', 'Evening care': '晚间照护', 'Care': '照护', 'Movement': '运动', 'Kitchen': '饮食',
  'One calm, attentive meal.': '专注地吃一餐。', 'A steady wind-down and earlier bedtime.': '规律放松，早点休息。',
  'A short warm soak to settle at the end of the day.': '晚间温水泡脚。', 'Gentle self-care practice when it feels appropriate.': '按个人习惯安排。',
  'A light everyday walk outside or indoors.': '室内或户外轻松散步。', 'A simple warm drink when it suits the day.': '按个人习惯饮用。',
  'A supported standing pattern from a higher seat.': '从较高的座椅起身。',
  'Use a higher seat and keep the knees comfortable. Hold the chair if needed.': '使用较高座椅，保持膝部舒适，必要时扶椅。',
  'A gentle posterior-chain movement done on the floor.': '在垫上完成臀桥。', 'Press through the feet and stop before any back strain.': '双脚发力，背部不适时停止。',
  'A pulling movement with chest support for steadiness.': '胸部有支撑的划船动作。', 'Support the chest so the lower back stays quiet.': '保持胸部支撑和腰背稳定。',
  'A gentle pressing pattern using the wall.': '借助墙壁完成推撑。', 'Keep the body long and choose a wall distance that feels steady.': '保持身体平直，选择舒适的离墙距离。',
  'A slow trunk-control pattern done with steady breathing.': '缓慢移动，保持自然呼吸。', 'Move slowly and keep the ribs down without breath-holding.': '慢速完成，不要憋气。',
  'A hip-hinge pattern with a light dumbbell.': '用轻哑铃完成髋部折叠。', 'Soft knees, hinge at the hips, and keep the range modest.': '膝部微屈，从髋部折叠，控制幅度。',
  'A small side-lying hip exercise for controlled glute work.': '侧卧完成小幅度髋部动作。', 'Keep the pelvis still and avoid rolling backward.': '保持骨盆稳定，避免向后翻滚。',
  'A light pressing movement from the floor.': '在垫上用轻重量完成推举。', 'Use a light weight and keep the shoulder comfortable.': '使用轻重量，保持肩部舒适。',
  'A controlled upper-back movement with a light band.': '用轻弹力带完成上背动作。', 'Move with control and keep the shoulders down.': '动作平稳，肩部自然下沉。',
  'A slow contralateral reach for trunk steadiness.': '缓慢伸展对侧手脚。', 'Reach long rather than high and keep the trunk steady.': '向远处伸展，保持躯干稳定。',
  '6 to 8 reps': '6–8 次', '8 to 10 reps': '8–10 次', '8 reps': '8 次', '6 to 10 reps': '6–10 次',
  '5 reps each side': '每侧 5 次', '10 reps each side': '每侧 10 次', '8 reps each side': '每侧 8 次',
  '2 sets': '2 组', '3 min': '3 分钟', '4 min': '4 分钟',
}
const SHIPPED: Record<string, Record<string, unknown>> = {
  "mindfulEating": {
    "name": "Mindful eating",
    "category": "Meal rhythm",
    "note": "One calm, attentive meal."
  },
  "earlySleep": {
    "name": "Early sleep",
    "category": "Rest",
    "note": "A steady wind-down and earlier bedtime."
  },
  "foot-soak": {
    "name": "Foot soak",
    "category": "Evening care",
    "note": "A short warm soak to settle at the end of the day."
  },
  "moxibustion": {
    "name": "Moxibustion",
    "category": "Care",
    "note": "Gentle self-care practice when it feels appropriate."
  },
  "walking": {
    "name": "Walking",
    "category": "Movement",
    "note": "A light everyday walk outside or indoors."
  },
  "ginger-drink": {
    "name": "Ginger drink",
    "category": "Kitchen",
    "note": "A simple warm drink when it suits the day."
  },
  "routine-a-sit-to-stand": {
    "name": "Sit-to-stand from high chair",
    "category": "Lower body",
    "description": "A supported standing pattern from a higher seat.",
    "caution": "Use a higher seat and keep the knees comfortable. Hold the chair if needed.",
    "suggestedVolume": "6 to 8 reps",
    "suggestedSets": "2 sets",
    "estimatedTime": "3 min"
  },
  "routine-a-glute-bridge": {
    "name": "Glute bridge",
    "category": "Lower body",
    "description": "A gentle posterior-chain movement done on the floor.",
    "caution": "Press through the feet and stop before any back strain.",
    "suggestedVolume": "8 to 10 reps",
    "suggestedSets": "2 sets",
    "estimatedTime": "3 min"
  },
  "routine-a-chest-supported-row": {
    "name": "Chest-supported dumbbell row",
    "category": "Upper body",
    "description": "A pulling movement with chest support for steadiness.",
    "caution": "Support the chest so the lower back stays quiet.",
    "suggestedVolume": "8 reps",
    "suggestedSets": "2 sets",
    "estimatedTime": "4 min"
  },
  "routine-a-wall-push-up": {
    "name": "Wall push-up",
    "category": "Upper body",
    "description": "A gentle pressing pattern using the wall.",
    "caution": "Keep the body long and choose a wall distance that feels steady.",
    "suggestedVolume": "6 to 10 reps",
    "suggestedSets": "2 sets",
    "estimatedTime": "3 min"
  },
  "routine-a-dead-bug": {
    "name": "Dead bug",
    "category": "Core",
    "description": "A slow trunk-control pattern done with steady breathing.",
    "caution": "Move slowly and keep the ribs down without breath-holding.",
    "suggestedVolume": "5 reps each side",
    "suggestedSets": "2 sets",
    "estimatedTime": "4 min"
  },
  "routine-b-romanian-deadlift": {
    "name": "Dumbbell Romanian deadlift",
    "category": "Lower body",
    "description": "A hip-hinge pattern with a light dumbbell.",
    "caution": "Soft knees, hinge at the hips, and keep the range modest.",
    "suggestedVolume": "8 reps",
    "suggestedSets": "2 sets",
    "estimatedTime": "4 min"
  },
  "routine-b-side-lying-clam": {
    "name": "Side-lying clam",
    "category": "Pelvic-floor-friendly",
    "description": "A small side-lying hip exercise for controlled glute work.",
    "caution": "Keep the pelvis still and avoid rolling backward.",
    "suggestedVolume": "10 reps each side",
    "suggestedSets": "2 sets",
    "estimatedTime": "4 min"
  },
  "routine-b-floor-press": {
    "name": "Single-arm dumbbell floor press",
    "category": "Upper body",
    "description": "A light pressing movement from the floor.",
    "caution": "Use a light weight and keep the shoulder comfortable.",
    "suggestedVolume": "8 reps each side",
    "suggestedSets": "2 sets",
    "estimatedTime": "4 min"
  },
  "routine-b-band-pull-apart": {
    "name": "Band pull-apart",
    "category": "Upper body",
    "description": "A controlled upper-back movement with a light band.",
    "caution": "Move with control and keep the shoulders down.",
    "suggestedVolume": "8 to 10 reps",
    "suggestedSets": "2 sets",
    "estimatedTime": "3 min"
  },
  "routine-b-bird-dog": {
    "name": "Bird-dog",
    "category": "Core",
    "description": "A slow contralateral reach for trunk steadiness.",
    "caution": "Reach long rather than high and keep the trunk steady.",
    "suggestedVolume": "5 reps each side",
    "suggestedSets": "2 sets",
    "estimatedTime": "4 min"
  },
  "routine-a": {
    "name": "Routine A"
  },
  "routine-b": {
    "name": "Routine B"
  }
}
export function translateBuiltIn<T extends { id: string; isBuiltIn?: boolean }>(item: T): T {
  if (!item.isBuiltIn) return item
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'string' && SHIPPED[item.id]?.[key] === value ? TEXT[value] ?? value : value])) as T
}
export function habitMode(habit: HabitDefinition): RecordingMode {
  return habit.recordingMode ?? (habit.id === 'mindfulEating' ? 'captures' : 'single')
}
export function habitGroup(habit: HabitDefinition): HabitGroup {
  return habit.group ?? (['walking', 'jingang', 'swimming'].includes(habit.id) ? '日常运动' : ['yoga', 'zumba', 'pilates'].includes(habit.id) ? '其他活动' : '每日习惯')
}
export function normalizeHabit(habit: HabitDefinition): HabitDefinition {
  if (!habit.isBuiltIn) return habit
  return { ...translateBuiltIn(habit), group: habitGroup(habit), recordingMode: habit.recordingMode ?? (['walking', 'jingang', 'swimming', 'yoga', 'zumba', 'pilates'].includes(habit.id) ? 'duration' : habitMode(habit)), frequency: habit.frequency ?? 'daily' }
}
export function coreExercises(exercises: ExerciseDefinition[]) {
  return exercises.filter((exercise) => exercise.dailyCore && exercise.enabled)
}
export function moveHabit(habits: HabitDefinition[], id: string, direction: 'up' | 'down') {
  const index = habits.findIndex((habit) => habit.id === id)
  if (index < 0) return habits
  const group = habitGroup(habits[index])
  let target = index + (direction === 'up' ? -1 : 1)
  while (target >= 0 && target < habits.length && habitGroup(habits[target]) !== group) target += direction === 'up' ? -1 : 1
  if (target < 0 || target >= habits.length) return habits
  const next = [...habits]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
export function completedHabitIds(completions: Record<string, string | undefined>, captures: Record<string, string[] | undefined>) {
  return [...new Set([...Object.keys(completions).filter((id) => completions[id]), ...Object.keys(captures).filter((id) => captures[id]?.length)])]
}

/** Shared display for library defaults and resolved routine prescriptions. */
export function exercisePrescription(exercise: Pick<ExerciseDefinition, 'suggestedSets' | 'suggestedVolume' | 'estimatedTime'> & {
  displaySets?: string
  displayVolume?: string
  displayTime?: string
}) {
  return [exercise.displaySets ?? exercise.suggestedSets, exercise.displayVolume ?? exercise.suggestedVolume, exercise.displayTime ?? exercise.estimatedTime].filter(Boolean).join(' · ')
}
