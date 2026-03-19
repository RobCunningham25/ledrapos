// LedraPOS Design System Tokens
// All colors defined as HSL in index.css — these are reference constants for documentation

export const THEME = {
  colors: {
    primary: '#2E5FA3',       // Navy blue
    secondary: '#4A90D9',     // Mid blue
    success: '#1E8449',       // Green
    warning: '#D68910',       // Amber
    danger: '#C0392B',        // Red
    surface: '#FFFFFF',
    background: '#F4F6F9',
    border: '#E2E8F0',
    textPrimary: '#1A202C',
    textMuted: '#718096',
  },
  radius: {
    card: '8px',
    input: '6px',
  },
  shadow: {
    subtle: '0 1px 3px rgba(0,0,0,0.08)',
  },
  font: {
    family: 'Inter, sans-serif',
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
    },
  },
} as const;
