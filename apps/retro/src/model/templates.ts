/** The retro styles on offer (docs/tools/retro.md, Decisions). */

export const COLUMN_ICONS = [
  'play',
  'square',
  'repeat',
  'smile',
  'frown',
  'circle-help',
  'thumbs-up',
  'lightbulb',
  'puzzle',
  'sparkles',
  'angry',
  'wind',
  'anchor',
  'triangle-alert',
  'tree-palm',
  'check',
  'plus',
  'minus',
] as const

export type ColumnIcon = (typeof COLUMN_ICONS)[number]

export interface Column {
  title: string
  /** A short question that shows under the title and in the empty input. */
  prompt: string
  icon: ColumnIcon
}

export interface Template {
  id: TemplateId
  name: string
  description: string
  columns: readonly Column[]
}

export const TEMPLATE_IDS = [
  'start-stop-continue',
  'happy-sad-confused',
  'four-ls',
  'mad-sad-glad',
  'sailboat',
  'starfish',
] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const TEMPLATES: Record<TemplateId, Template> = {
  'start-stop-continue': {
    id: 'start-stop-continue',
    name: 'Start, Stop, Continue',
    description: 'What to begin, drop and keep. A good default.',
    columns: [
      { title: 'Start', prompt: 'What should we begin doing?', icon: 'play' },
      { title: 'Stop', prompt: "What isn't helping anymore?", icon: 'square' },
      { title: 'Continue', prompt: "What's working that we should keep?", icon: 'repeat' },
    ],
  },
  'happy-sad-confused': {
    id: 'happy-sad-confused',
    name: 'Happy, Sad, Confused',
    description: 'How the last stretch felt, including what was unclear.',
    columns: [
      { title: 'Happy', prompt: 'What made you happy?', icon: 'smile' },
      { title: 'Sad', prompt: 'What was disappointing or frustrating?', icon: 'frown' },
      { title: 'Confused', prompt: 'What puzzled you or felt unclear?', icon: 'circle-help' },
    ],
  },
  'four-ls': {
    id: 'four-ls',
    name: 'Liked, Learned, Lacked, Longed for',
    description: 'The 4Ls: a balanced look back that surfaces learning.',
    columns: [
      { title: 'Liked', prompt: 'What did you enjoy?', icon: 'thumbs-up' },
      { title: 'Learned', prompt: 'What did you learn?', icon: 'lightbulb' },
      { title: 'Lacked', prompt: 'What was missing?', icon: 'puzzle' },
      { title: 'Longed for', prompt: 'What do you wish we had?', icon: 'sparkles' },
    ],
  },
  'mad-sad-glad': {
    id: 'mad-sad-glad',
    name: 'Mad, Sad, Glad',
    description: 'Feelings first, for when the mood matters as much as the work.',
    columns: [
      { title: 'Mad', prompt: 'What frustrated you?', icon: 'angry' },
      { title: 'Sad', prompt: 'What disappointed you?', icon: 'frown' },
      { title: 'Glad', prompt: 'What made you glad?', icon: 'smile' },
    ],
  },
  sailboat: {
    id: 'sailboat',
    name: 'Sailboat',
    description: 'What moves the team forward, what slows it and what lies ahead.',
    columns: [
      { title: 'Wind', prompt: 'What pushes us forward?', icon: 'wind' },
      { title: 'Anchors', prompt: 'What holds us back?', icon: 'anchor' },
      { title: 'Rocks', prompt: 'What risks are ahead?', icon: 'triangle-alert' },
      { title: 'Island', prompt: 'Where do we want to get to?', icon: 'tree-palm' },
    ],
  },
  starfish: {
    id: 'starfish',
    name: 'Starfish',
    description: 'Five shades between starting and stopping things.',
    columns: [
      { title: 'Keep doing', prompt: "What's working well?", icon: 'check' },
      { title: 'More of', prompt: 'What should we do more?', icon: 'plus' },
      { title: 'Less of', prompt: 'What should we do less?', icon: 'minus' },
      { title: 'Start doing', prompt: 'What should we try?', icon: 'play' },
      { title: 'Stop doing', prompt: "What isn't helping anymore?", icon: 'square' },
    ],
  },
}

/** The most columns any style has. Card records are validated against it. */
export const MAX_COLUMNS = Math.max(...Object.values(TEMPLATES).map((t) => t.columns.length))
