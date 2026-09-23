# Motion direction

The home page draws on three Awwwards examples without copying their layouts or assets:

- [Alejandro Schintu — Web design](https://www.awwwards.com/sites/alejandro-schintu-web-design): heading microanimations inspired the staged hero text and collaboration-node entrance.
- [Oaksun Studio — Silky Smooth Marquee Scroll](https://www.awwwards.com/inspiration/silky-smooth-marquee-scroll-oaksun-studio): the moving text band inspired a quieter, noninteractive loop of product ideas.
- [Noomo redesign case study](https://www.awwwards.com/new-focus-new-brand-new-website.html): its account of GSAP performance issues informed the small number of timelines and scoped cleanup.

GSAP animates the home hero, decorative nodes, ticker, product preview, and feature sections. ScrollTrigger reveals the two lower sections when they enter the viewport. Native scrolling remains intact. `gsap.matchMedia()` scopes the setup to users without a reduced-motion preference and reverts animations when that preference changes or the page unmounts. Offscreen content stays in the accessibility tree and remains visible before JavaScript initializes.

No animation targets the actual draggable board cards. The home page keeps English and Traditional Chinese text in the existing i18n catalog; ticker copies are decorative and hidden from assistive technology.
