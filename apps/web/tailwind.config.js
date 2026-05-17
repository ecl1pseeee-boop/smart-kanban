/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'accent-violet': '#8b5cf6',
        'accent-cyan':   '#06b6d4',
        'accent-blue':   '#0ea5e9',
        'surface':       'rgba(255,255,255,0.03)',
        'surface-hover': 'rgba(255,255,255,0.05)',
        'bg-base':       '#0d0e11',
        'text-primary':  '#ffffff',
        'text-muted':    'rgba(255,255,255,0.45)',
        'text-subtle':   'rgba(255,255,255,0.25)',
        priority: {
          critical: '#ef4444',
          high:     '#f97316',
          medium:   '#06b6d4',
          low:      'rgba(255,255,255,0.3)',
        },
      },
      borderColor: {
        'subtle':      'rgba(255,255,255,0.08)',
        'input':       'rgba(255,255,255,0.10)',
        'input-focus': 'rgba(139,92,246,0.60)',
      },
      backdropBlur: {
        'glass': '12px',
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #8b5cf6 0%, #0ea5e9 100%)',
        'gradient-text':   'linear-gradient(90deg, #8b5cf6, #06b6d4)',
      },
      borderRadius: {
        'pb-sm':  '8px',
        'pb-md':  '10px',
        'pb-lg':  '12px',
        'pb-xl':  '16px',
        'pb-2xl': '20px',
      },
    },
  },
  plugins: [],
}
