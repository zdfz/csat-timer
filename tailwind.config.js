/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Euclid Circular B', 'sans-serif'],
                display: ['Outfit', 'sans-serif'],
            },
            colors: {
                primary: {
                    DEFAULT: '#1f6a4a', // main
                    50: '#f2f6f4',      // surface
                    100: '#e4ede9',     // focus
                    200: '#d7e4de',     // border
                    300: '#94c4b0',     // interpolated
                    400: '#2e9e6e',     // hover (lighter)
                    500: '#2e9e6e',     // hover (using as 500 base for some utilities)
                    600: '#1f6a4a',     // main
                    700: '#154a33',     // between main and pressed
                    800: '#103525',     // pressed
                    900: '#0b2419',     // dark
                    950: '#05120c',
                    // Aliases
                    main: '#1f6a4a',
                    surface: '#f2f6f4',
                    focus: '#e4ede9',
                    border: '#d7e4de',
                    hover: '#2e9e6e',
                    pressed: '#103525',
                },
                secondary: {
                    DEFAULT: '#ff9d18', // main
                    50: '#fff5e8',      // surface
                    100: '#ffebd1',     // focus
                    200: '#ffd8a3',     // border
                    300: '#ffc17a',     // interpolated
                    400: '#ffaa40',     // interpolated
                    500: '#ff9d18',     // main
                    600: '#e58400',     // hover
                    700: '#aa6910',     // pressed
                    800: '#854d0c',
                    900: '#5c3305',
                    950: '#3d2102',
                    // Aliases
                    main: '#ff9d18',
                    surface: '#fff5e8',
                    focus: '#ffebd1',
                    border: '#ffd8a3',
                    hover: '#e58400',
                    pressed: '#aa6910',
                },
                neutral: {
                    50: '#f4f5f6', // neutral--50-501
                    100: '#f3f4f6', // neutral--100
                    200: '#e5e7eb', // neutral--200
                    300: '#d1d5db', // neutral--300
                    400: '#9ca3af', // neutral--400
                    500: '#6b7280', // neutral--500
                    600: '#595b5d', // neutral--600
                    700: '#374151', // neutral--700
                    800: '#1f2937', // neutral--800
                    900: '#111827', // neutral--900
                    white: {
                        DEFAULT: 'white',
                        100: 'white',
                        88: '#ffffffe0',
                        80: '#fffc',
                        32: '#ffffff52',
                        20: '#fff3',
                        10: '#ffffff1a',
                        6: 'transparent',
                    }
                },
            },
            boxShadow: {
                'premium': '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 0 3px rgba(0, 0, 0, 0.02)',
                'glow': '0 0 15px rgba(99, 102, 241, 0.1)',
            },
            animation: {
                'fade-in': 'fadeIn 0.4s ease-out forwards',
                'slide-up': 'slideUp 0.5s ease-out forwards',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                }
            }
        },
    },
    plugins: [],
}
