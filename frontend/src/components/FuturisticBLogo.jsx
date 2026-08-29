/**
 * Futuristic "B" Monogram Logo
 * Precision geometric glyph with sharp cybernetic facets, angled slits, and high-contrast negative space.
 */
export default function FuturisticBLogo({ size = 22, className = '' }) {
  return (
    <span
      className={`futuristic-b-wrap ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', width: '100%', height: '100%' }}
      >
        {/* Futuristic faceted B lettermark */}
        <path
          d="M5 3.5H18C22.4183 3.5 26 7.08172 26 11.5C26 14.1611 24.7008 16.5186 22.6859 17.9866C25.4385 19.387 27.25 22.2319 27.25 25.5C27.25 29.9183 23.6683 33.5 19.25 33.5H5C4.17157 33.5 3.5 32.8284 3.5 32V5C3.5 4.17157 4.17157 3.5 5 3.5Z"
          fill="#ffffff"
        />
        {/* Top geometric cutout */}
        <path
          d="M10.5 8.5H17.5C19.1569 8.5 20.5 9.84315 20.5 11.5C20.5 13.1569 19.1569 14.5 17.5 14.5H10.5V8.5Z"
          fill="#09090b"
        />
        {/* Bottom geometric cutout */}
        <path
          d="M10.5 19.5H18.5C20.1569 19.5 21.5 20.8431 21.5 22.5C21.5 24.1569 20.1569 25.5 18.5 25.5H10.5V19.5Z"
          fill="#09090b"
        />
        {/* Cyber angled speed notch on spine */}
        <polygon
          points="3.5,15.5 13.5,15.5 10.5,18.5 3.5,18.5"
          fill="#09090b"
        />
        {/* Corner angled chamfer accent */}
        <polygon
          points="5,3.5 3.5,5 3.5,3.5"
          fill="#09090b"
        />
      </svg>
    </span>
  )
}
