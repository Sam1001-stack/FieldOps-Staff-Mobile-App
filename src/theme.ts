import { Platform, type ViewStyle } from 'react-native'

export const colors = {
  bg: '#07080A',
  surface: '#14171C',
  raised: '#1C2128',
  ink: '#F7F4EE',
  muted: '#9AA3B2',
  line: '#2A313C',
  gold: '#D4A017',
  navy: '#3D5273',
  teal: '#2DD4BF',
  rose: '#FB7185',
} as const

export const cardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  android: { elevation: 6 },
  default: {},
}) as ViewStyle

export const statusTone: Record<string, { bg: string; fg: string; label: string }> = {
  assigned: { bg: '#1E3A5F', fg: '#93C5FD', label: 'Zugewiesen' },
  en_route: { bg: '#3F2E0C', fg: '#FBBF24', label: 'Unterwegs' },
  on_site: { bg: '#2E1064', fg: '#C4B5FD', label: 'Vor Ort' },
  waiting_parts: { bg: '#431407', fg: '#FDBA74', label: 'Teile' },
  completed: { bg: '#064E3B', fg: '#6EE7B7', label: 'Erledigt' },
  scheduled: { bg: '#1E3A5F', fg: '#93C5FD', label: 'Geplant' },
  draft: { bg: '#27272A', fg: '#A1A1AA', label: 'Entwurf' },
}
