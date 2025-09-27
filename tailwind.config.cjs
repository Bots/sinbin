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
  plugins: []
}
