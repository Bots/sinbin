module.exports = {
  content: [
    './public/**/*.html',
    './src/**/*.ts',
    './src/**/*.js',
    './src/**/*.tsx',
    './src/**/*.jsx'
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary-color)',
        secondary: 'var(--secondary-color)',
        accent: 'var(--accent-color)'
      },
      animation: {
        pop: 'pop 420ms ease-out'
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' }
        }
      }
    }
  },
  plugins: [
    require("daisyui"),
    require("@tailwindcss/forms"),
    require("tailwindcss-animate")
  ],
  daisyui: {
    themes: [
      {
        light: {
          "primary": "#6366f1",
          "secondary": "#f472b6",
          "accent": "#10b981",
          "neutral": "#f3f4f6",
          "base-100": "#ffffff",
          "base-200": "#f9fafb",
          "base-300": "#f3f4f6",
          "info": "#3abff8",
          "success": "#36d399",
          "warning": "#fbbd23",
          "error": "#f87272",
        },
        dark: {
          "primary": "#6366f1",
          "secondary": "#f472b6",
          "accent": "#10b981",
          "neutral": "#1a1a1a",
          "base-100": "#000000",
          "base-200": "#1a1a1a",
          "base-300": "#2a2a2a",
          "info": "#3abff8",
          "success": "#36d399",
          "warning": "#fbbd23",
          "error": "#f87272",
        }
      }
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    prefix: "",
    logs: false,
    themeRoot: ":root",
  },
}
