/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // iOS-like color palette
        'ios': {
          'bg': '#F2F2F7',
          'bg-dark': '#000000',
          'card': '#FFFFFF',
          'card-dark': '#1C1C1E',
          'secondary': '#8E8E93',
          'separator': '#C6C6C8',
          'separator-dark': '#38383A',
          'blue': '#007AFF',
          'green': '#34C759',
          'red': '#FF3B30',
          'orange': '#FF9500',
          'yellow': '#FFCC00',
        }
      },
      fontFamily: {
        'sf': ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'ios': '10px',
        'ios-lg': '14px',
      },
      boxShadow: {
        'ios': '0 1px 3px rgba(0,0,0,0.08)',
        'ios-lg': '0 4px 12px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
}


